'use strict';

const {createHash} = require('node:crypto');
const {repairHash, repairSpeechContext} = require('../api/dist/content-repairs.js');
const {poemSpeechText, poemAudioProfile} = require('../api/dist/poems.js');
const {hanziAudioProfile} = require('../api/dist/hanzi.js');
const tables = {words:'child_words', sentences:'sentences', poems:'poems', hanzi:'hanzi'};
const uuid = value => typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fail(message, status = 404) {
  throw Object.assign(Error(message), {httpStatus:status});
}

async function owned(pool, kind, id, includeArchived = false) {
  if (!Object.hasOwn(tables,kind) || !uuid(id)) fail('内容编号或类型无效',400);
  const condition = kind === 'sentences' ? "AND t.status='validated'" : includeArchived ? ''
    : kind === 'words' ? 'AND t.archived_at IS NULL AND t.library_archived_at IS NULL' : 'AND t.library_archived_at IS NULL';
  const row = (await pool.query(`
    SELECT t.* FROM wordmate.${tables[kind]} t
    JOIN wordmate.children c ON c.id=t.child_id AND c.archived_at IS NULL
    JOIN wordmate.families f ON f.id=c.family_id AND f.status='active'
    WHERE t.id=$1 ${condition}
  `,[id])).rows[0];
  if (!row) fail('内容已删除、归档或不可访问');
  if (kind === 'sentences') {
    const entry = (await pool.query('SELECT archived_at FROM wordmate.sentence_library WHERE sentence_id=$1',[id])).rows[0];
    if (entry?.archived_at && !includeArchived) fail('句子已归档');
    row.library_archived_at = entry?.archived_at ?? null;
  }
  return row;
}

function settingsKey(clip) {
  return JSON.stringify([clip.accent,clip.voice_id,Number(clip.speech_rate)]);
}

async function repairs(pool, kind, row, part) {
  const context = repairHash(repairSpeechContext(kind,row));
  const records = (await pool.query(`
    SELECT DISTINCT ON (accent,voice_id,speech_rate)
      id,accent,voice_id,speech_rate,created_at
    FROM wordmate.content_repairs
    WHERE child_id=$1 AND audio_kind=$2 AND audio_target=$3 AND audio_part=$4
      AND audio_context_hash=$5 AND status='succeeded' AND audio_bytes IS NOT NULL
    ORDER BY accent,voice_id,speech_rate,created_at DESC,id DESC
    LIMIT 40
  `,[row.child_id,kind,row.id,part,context])).rows;
  return records.map(record => ({...record,source:'repair',part}));
}

function merge(base, replacements) {
  const overrides = new Map(replacements.map(record => [settingsKey(record),record]));
  const seen = new Set();
  const output = [];
  for (const record of [...base,...replacements]) {
    const key = settingsKey(record);
    if (seen.has(key)) continue;
    output.push(overrides.get(key) || record);
    seen.add(key);
  }
  return output;
}

async function clips(pool, runtime, kind, id, part) {
  const row = await owned(pool,kind,id);
  const validParts = kind === 'words' ? ['word'] : kind === 'hanzi' ? ['character','example'] : ['body'];
  if (!validParts.includes(part)) fail('音频部分无效',400);
  let base;
  if (kind === 'words' || kind === 'sentences') {
    base = (await pool.query(`
      SELECT id,accent,voice_id,speech_rate,created_at FROM wordmate.audio_assets
      WHERE child_id=$1 AND ${kind === 'words' ? 'child_word_id' : 'sentence_id'}=$2
        AND content_version=$3 AND status='succeeded'
        AND storage_key IS NOT NULL AND sha256 IS NOT NULL
      ORDER BY created_at DESC,id DESC LIMIT 40
    `,[row.child_id,id,kind === 'words' ? row.version : row.content_version])).rows
      .map(record => ({...record,source:'asset',part}));
  } else {
    const text = kind === 'poems' ? poemSpeechText(row) : String(row[part] ?? '').trim();
    if (!text) return [];
    const profile = runtime?.profile ? (kind === 'poems' ? poemAudioProfile(runtime.profile) : hanziAudioProfile(runtime.profile)) : null;
    base = (await pool.query(`
      SELECT id,voice_id,updated_at FROM wordmate.${kind === 'poems' ? 'poem_audio' : 'hanzi_audio'}
      WHERE ${kind === 'poems' ? 'poem_id' : 'hanzi_id'}=$1 AND content_hash=$2
        AND ($3::text IS NULL OR profile_key=$3) AND state='succeeded' AND content IS NOT NULL
      ORDER BY updated_at DESC,id DESC LIMIT 40
    `,[id,digest(text),profile])).rows.map(record => ({
      ...record,accent:'zh-CN',speech_rate:0.9,source:kind === 'poems' ? 'poem' : 'hanzi',part,
    }));
  }
  return merge(base,await repairs(pool,kind,row,part));
}

async function repairBytes(pool, id) {
  if (!uuid(id)) fail('音频编号无效',400);
  const row = (await pool.query(`
    SELECT id,child_id,audio_kind,audio_target,audio_part,audio_context_hash,
      accent,voice_id,speech_rate,audio_bytes
    FROM wordmate.content_repairs WHERE id=$1 AND status='succeeded' AND audio_bytes IS NOT NULL
  `,[id])).rows[0];
  if (!row) fail('纠错音频已撤销或不存在');
  const source = await owned(pool,row.audio_kind,row.audio_target);
  const current = await repairs(pool,row.audio_kind,source,row.audio_part);
  if (!current.some(record => record.id === id)) fail('音频已更新，请刷新后试听',409);
  const bytes = Buffer.from(row.audio_bytes);
  if (bytes.length < 3 || bytes.length > 10485760 || !(bytes.subarray(0,3).toString() === 'ID3' || bytes[0] === 255 && (bytes[1] & 224) === 224)) {
    fail('音频内容无效',503);
  }
  // Recheck after reading the bytes: a concurrent edit/undo must not serve a stale clip.
  const fresh = await owned(pool,row.audio_kind,row.audio_target);
  if (!(await repairs(pool,row.audio_kind,fresh,row.audio_part)).some(record => record.id === id)) fail('音频已更新，请刷新后试听',409);
  return bytes;
}

async function assetOverride(pool, asset) {
  const kind = asset.child_word_id ? 'words' : 'sentences';
  const row = await owned(pool,kind,asset.child_word_id || asset.sentence_id);
  const part = kind === 'words' ? 'word' : 'body';
  const repair = (await repairs(pool,kind,row,part)).find(record => settingsKey(record) === settingsKey(asset));
  return repair ? repairBytes(pool,repair.id) : null;
}

async function cachedBytes(pool, runtime, kind, target, part, id) {
  if (!['poems','hanzi'].includes(kind) || !uuid(id)) fail('音频编号无效',400);
  const available = await clips(pool,runtime,kind,target,part);
  const selected = available.find(record => record.id === id);
  if (!selected) fail('音频已更新，请刷新后试听',409);
  if (selected.source === 'repair') return repairBytes(pool,id);
  const table = kind === 'poems' ? 'poem_audio' : 'hanzi_audio';
  const owner = kind === 'poems' ? 'poem_id' : 'hanzi_id';
  const row = (await pool.query(`SELECT content FROM wordmate.${table} WHERE id=$1 AND ${owner}=$2 AND state='succeeded'`,[id,target])).rows[0];
  if (!row?.content) fail('音频不存在');
  if (!(await clips(pool,runtime,kind,target,part)).some(record => record.id === id)) fail('音频已更新，请刷新后试听',409);
  const bytes = Buffer.from(row.content);
  if (bytes.length < 3 || bytes.length > 2097152 || !(bytes.subarray(0,3).toString() === 'ID3' || bytes[0] === 255 && (bytes[1] & 224) === 224)) fail('音频内容无效',503);
  return bytes;
}

module.exports = {owned,clips,repairBytes,assetOverride,cachedBytes,merge};
