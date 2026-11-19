'use strict';

const audio = require('./content-audio.cjs');
const uuid = value => typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
const kinds = ['words','sentences','poems','hanzi'];
const fields = {
  words:['lemma','part_of_speech','meaning_zh','ipa_gb','ipa_us'],
  sentences:['text_en','translation_zh'],
  poems:['title','author','dynasty','body','annotations','translation','pinyin'],
  hanzi:['character','pinyin','radical','strokes','meaning','words','example'],
};
const config = {
  words:{table:'child_words',book:'wordbooks',items:'wordbook_words',key:'child_word_id',title:'t.lemma',description:'t.meaning_zh'},
  sentences:{table:'sentences',book:'sentence_books',items:'sentence_book_items',key:'sentence_id',title:'t.text_en',description:'t.translation_zh'},
  poems:{table:'poems',book:'poem_books',items:'poem_book_items',key:'poem_id',title:'t.title',description:"concat_ws(' · ',t.dynasty,t.author)"},
  hanzi:{table:'hanzi',book:'hanzi_books',items:'hanzi_book_items',key:'hanzi_id',title:'t.character',description:"concat_ws(' · ',t.pinyin,t.meaning)"},
};

function fail(message, status = 400) {
  throw Object.assign(Error(message),{httpStatus:status});
}
function filters(params, allowedStatus, defaultKind = 'all') {
  const kind = params.get('kind') || defaultKind;
  const status = params.get('status') || 'all';
  const child = params.get('child_id') || '';
  const term = (params.get('q') || '').trim();
  const rawOffset = params.get('offset') || '0';
  if (![...kinds,'all'].includes(kind) || !allowedStatus.includes(status)) fail('内容类型或状态无效');
  if (child && !uuid(child)) fail('孩子编号无效');
  if (term.length > 120 || /[\u0000-\u001f\u007f]/.test(term)) fail('搜索内容无效');
  if (!/^\d{1,6}$/.test(rawOffset) || Number(rawOffset) > 100000) fail('页码无效');
  return {kind,status,child,term,offset:Number(rawOffset)};
}
function page(rows, offset) {
  return {items:rows.slice(0,50),next_offset:rows.length > 50 ? offset + 50 : null};
}

async function contents(pool, params) {
  const selected = filters(params,['all','active','archived'],'words');
  if (selected.kind === 'all') fail('请选择一种内容类型');
  const origin = params.get('origin') || 'all';
  if (!['all','personal','shared_copy'].includes(origin)) fail('内容来源无效');
  const c = config[selected.kind];
  const archive = selected.kind === 'sentences' ? 'l.archived_at'
    : selected.kind === 'words' ? 'coalesce(t.archived_at,t.library_archived_at)' : 't.library_archived_at';
  const version = selected.kind === 'sentences' ? 't.content_version' : 't.version';
  const library = selected.kind === 'sentences' ? 'JOIN wordmate.sentence_library l ON l.sentence_id=t.id AND l.child_id=t.child_id' : '';
  const wordBookKey = selected.kind === 'words' ? 'wordbook_id' : 'book_id';
  const rows = (await pool.query(`
    SELECT t.id,t.child_id,${c.title} AS title,left(${c.description},180) AS description,
      ${version} AS version,${archive} AS archived_at,t.created_at,
      books.names AS book_names,books.shared_copy
    FROM wordmate.${c.table} t ${library}
    JOIN wordmate.children child ON child.id=t.child_id AND child.archived_at IS NULL
    JOIN wordmate.families family ON family.id=child.family_id AND family.status='active'
    LEFT JOIN LATERAL (
      SELECT coalesce(string_agg(DISTINCT b.name,'、'),'') AS names,
        coalesce(bool_or(b.read_only),false) AS shared_copy
      FROM wordmate.${c.items} bi JOIN wordmate.${c.book} b ON b.id=bi.${wordBookKey} AND b.child_id=bi.child_id AND b.archived_at IS NULL
      WHERE bi.${c.key}=t.id AND bi.child_id=t.child_id
    ) books ON true
    WHERE ($1='' OR position(lower($1) in lower(concat_ws(' ',${c.title},${c.description},${selected.kind === 'poems' ? 't.body' : selected.kind === 'hanzi' ? 't.words,t.example' : 'NULL'},t.id::text)))>0)
      AND ($2='' OR t.child_id::text=$2)
      AND ($3='all' OR ($3='archived')=(${archive} IS NOT NULL))
      AND ($4='all' OR ($4='shared_copy')=books.shared_copy)
      ${selected.kind === 'sentences' ? "AND t.status='validated'" : ''}
    ORDER BY t.created_at DESC,t.id DESC LIMIT 51 OFFSET $5
  `,[selected.term,selected.child,selected.status,origin,selected.offset])).rows;
  return page(rows,selected.offset);
}

async function contentDetail(pool, kind, id) {
  const row = await audio.owned(pool,kind,id,true);
  const detail = Object.fromEntries(fields[kind].map(key => [key,row[key] ?? '']));
  let example = null;
  if (kind === 'words') {
    const source = (await pool.query(`
      SELECT s.id,s.text_en,s.translation_zh FROM wordmate.sentences s
      JOIN wordmate.sentence_targets target ON target.sentence_id=s.id AND target.child_id=s.child_id
      WHERE target.child_word_id=$1 AND s.child_id=$2 AND s.status='validated'
      ORDER BY s.created_at DESC,s.id DESC LIMIT 1
    `,[id,row.child_id])).rows[0];
    if (source) example = source;
  }
  return {kind,id,child_id:row.child_id,archived_at:row.library_archived_at || row.archived_at || null,fields:detail,example};
}

async function repairs(pool, params) {
  const selected = filters(params,['all','queued','running','succeeded','failed','undone']);
  const rows = (await pool.query(`
    SELECT r.id,r.child_id,r.kind,r.target_id,r.issue,r.status,r.note,r.error_code,
      r.created_at,r.updated_at,r.lease_until,
      costs.calls,costs.recorded_cost,costs.known_cost_micros,costs.charge_micros
    FROM wordmate.content_repairs r
    JOIN wordmate.children child ON child.id=r.child_id AND child.archived_at IS NULL
    JOIN wordmate.families family ON family.id=child.family_id AND family.status='active'
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS calls,count(cost_micros)::int AS recorded_cost,
        CASE WHEN count(cost_micros)>0 THEN sum(cost_micros)::text ELSE NULL END AS known_cost_micros,
        coalesce(sum(charge_micros),0)::text AS charge_micros
      FROM wordmate.ai_calls call WHERE call.reference IN ('content-repair:'||r.id::text,'content-repair-check:'||r.id::text)
        OR call.id=r.audio_billing_id
    ) costs ON true
    WHERE ($1='all' OR r.kind=$1) AND ($2='all' OR r.status=$2)
      AND ($3='' OR r.child_id::text=$3)
      AND ($4='' OR position(lower($4) in lower(concat_ws(' ',r.id::text,r.target_id::text,r.error_code)))>0)
    ORDER BY r.created_at DESC,r.id DESC LIMIT 51 OFFSET $5
  `,[selected.kind,selected.status,selected.child,selected.term,selected.offset])).rows;
  return page(rows,selected.offset);
}

async function repairDetail(pool, id) {
  if (!uuid(id)) fail('纠错编号无效');
  const r = (await pool.query(`
    SELECT r.id,r.child_id,r.kind,r.target_id,r.issue,r.description,r.status,r.note,
      r.error_code,r.source,r.result,r.audio_kind,r.audio_target,r.audio_part,r.accent,r.voice_id,r.speech_rate
    FROM wordmate.content_repairs r
    JOIN wordmate.children child ON child.id=r.child_id AND child.archived_at IS NULL
    JOIN wordmate.families family ON family.id=child.family_id AND family.status='active'
    WHERE r.id=$1
  `,[id])).rows[0];
  if (!r) fail('纠错记录不存在或内容已删除',404);
  const changes = Object.fromEntries(Object.entries(r.result?.values || {}).filter(([key,value]) => typeof value === 'string' && [...fields[r.kind],'example_en','example_zh'].includes(key)));
  const diagnostic = r.result?.diagnostic;
  const safeDiagnostic = diagnostic && typeof diagnostic === 'object'
    ? Object.fromEntries(['stage','field','reason'].filter(key => typeof diagnostic[key] === 'string').map(key => [key,diagnostic[key].slice(0,300)])) : null;
  let currentAudio = false;
  if (r.status === 'succeeded' && r.audio_kind) {
    try {
      const row = await audio.owned(pool,r.audio_kind,r.audio_target);
      // Metadata only; do not download bytes or synthesize while opening a record.
      const clips = await audio.clips(pool,null,r.audio_kind,row.id,r.audio_part);
      currentAudio = clips.some(clip => clip.source === 'repair' && clip.id === id);
    } catch (error) {
      if (![404,409].includes(error.httpStatus)) throw error;
    }
  }
  return {
    id:r.id,kind:r.kind,target_id:r.target_id,child_id:r.child_id,issue:r.issue,status:r.status,
    description:r.description,note:r.note,error_code:r.error_code,diagnostic:safeDiagnostic,
    original:Object.fromEntries(Object.keys(changes).map(key => [key,r.source?.content?.[key] ?? ''])),changes,
    pronunciations:Array.isArray(r.result?.pronunciations) ? r.result.pronunciations.filter(item => item && typeof item === 'object').map(item => ({text:item.text,alphabet:item.alphabet,ph:item.ph})) : [],
    current_audio:currentAudio,audio_kind:r.audio_kind,audio_target:r.audio_target,audio_part:r.audio_part,accent:r.accent,voice_id:r.voice_id,speech_rate:r.speech_rate,
  };
}

const importQuery = `
  SELECT r.kind,r.source_id AS id,r.child_id,r.created_at,r.updated_at,
    CASE WHEN r.kind='words' THEN
      CASE WHEN w.status='cancelled' OR w.error_code='USER_CANCELLED' THEN 'cancelled'
        WHEN parts.running>0 THEN 'running' WHEN parts.queued>0 THEN 'queued'
        WHEN w.payload->>'flow'='vocabulary_bulk_v1' AND parts.total>0 THEN
          CASE WHEN parts.completed=parts.total THEN 'succeeded'
            WHEN counts.saved>0 OR counts.pending>0 THEN 'partial'
            WHEN parts.cancelled=parts.total THEN 'cancelled' ELSE 'failed' END
        WHEN counts.pending>0 AND w.status='succeeded' THEN 'ready' ELSE coalesce(w.status,r.status) END
      ELSE CASE WHEN coalesce(p.error_code,h.error_code,s.error_code)='USER_CANCELLED' THEN 'cancelled'
        ELSE coalesce(p.status,h.status,s.status,r.status) END END AS status,
    greatest(r.saved_count,coalesce(counts.saved,0),coalesce(p.saved_count,0),coalesce(s.saved_count,0))::int AS saved_count,
    CASE WHEN r.kind='words' THEN coalesce(parts.error_code,w.error_code)
      ELSE coalesce(p.error_code,h.error_code,s.error_code) END AS error_code,
    parts.completed::int AS completed_batches,parts.total::int AS total_batches,coalesce(counts.pending,0)::int AS pending_count,
    coalesce(parts.attempts,w.attempts)::int AS attempts,w.max_attempts,
    coalesce(parts.lease_until,w.lease_until,p.lease_until,h.lease_until,s.lease_until) AS lease_until,
    coalesce(p.read_page,h.read_page) AS read_page,coalesce(p.read_total,h.read_total) AS read_total,
    (w.id IS NOT NULL OR p.id IS NOT NULL OR h.id IS NOT NULL OR s.id IS NOT NULL) AS detail_available
  FROM wordmate.import_records r
  JOIN wordmate.children child ON child.id=r.child_id AND child.archived_at IS NULL
  JOIN wordmate.families family ON family.id=child.family_id AND family.status='active'
  LEFT JOIN wordmate.generation_jobs w ON r.kind='words' AND w.id=r.source_id AND w.child_id=r.child_id
  LEFT JOIN wordmate.poem_import_jobs p ON r.kind='poems' AND p.id=r.source_id AND p.child_id=r.child_id
  LEFT JOIN wordmate.hanzi_import_jobs h ON r.kind='hanzi' AND h.id=r.source_id AND h.child_id=r.child_id
  LEFT JOIN wordmate.sentence_import_jobs s ON r.kind='sentences' AND s.id=r.source_id AND s.child_id=r.child_id
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS total,count(*) FILTER(WHERE j.status='succeeded')::int AS completed,
      count(*) FILTER(WHERE j.status='cancelled')::int AS cancelled,
      count(*) FILTER(WHERE j.status='running')::int AS running,count(*) FILTER(WHERE j.status='queued')::int AS queued,
      sum(j.attempts)::int AS attempts,max(j.lease_until) AS lease_until,
      (array_agg(j.error_code ORDER BY j.updated_at DESC,j.id DESC)
        FILTER(WHERE j.error_code IS NOT NULL AND j.error_code<>'BULK_PAUSED' AND j.status IN ('failed','partial')))[1] AS error_code
    FROM wordmate.generation_jobs j
    WHERE r.kind='words' AND j.child_id=r.child_id AND (
      (w.payload->>'flow'='vocabulary_bulk_v1' AND j.payload->>'bulk_parent_id'=r.source_id::text)
      OR (coalesce(w.payload->>'flow','')<>'vocabulary_bulk_v1' AND j.id=r.source_id)
    )
  ) parts ON true
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT i.id) FILTER(WHERE i.child_word_id IS NOT NULL)::int AS saved,
      count(DISTINCT i.id) FILTER(WHERE i.child_word_id IS NULL AND i.status IN ('ready','needs_confirmation'))::int AS pending
    FROM wordmate.batch_items i JOIN wordmate.generation_jobs j ON i.batch_id=(j.payload->>'batch_id')::uuid
    WHERE r.kind='words' AND j.child_id=r.child_id AND (j.id=r.source_id OR j.payload->>'bulk_parent_id'=r.source_id::text)
  ) counts ON true
  WHERE r.source='task'
`;

async function imports(pool, params) {
  const selected = filters(params,['all','queued','running','ready','saved','failed','partial','succeeded','cancelled']);
  const rows = (await pool.query(`WITH live AS (${importQuery})
    SELECT * FROM live WHERE ($1='all' OR kind=$1) AND ($2='all' OR status=$2)
      AND ($3='' OR child_id::text=$3) AND ($4='' OR position(lower($4) in lower(concat_ws(' ',id::text,error_code)))>0)
    ORDER BY created_at DESC,kind,id DESC LIMIT 51 OFFSET $5
  `,[selected.kind,selected.status,selected.child,selected.term,selected.offset])).rows;
  return page(rows,selected.offset);
}

module.exports = {contents,contentDetail,repairs,repairDetail,imports};
