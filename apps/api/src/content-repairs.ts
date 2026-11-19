import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Sql, Row } from './ports.ts';
import type { AiAccounts } from './ai-accounts.ts';
import type { AudioRuntime } from './audio-runtime.ts';
import { ensure, uuid, DomainError } from './errors.ts';
import { reserveAudio } from './audio-billing.ts';
import { audioTariff } from './audio-tariff.ts';
import { settleAiCall, releaseAiCall } from './ai-wallet.ts';
import { shortPos } from './word-pos.ts';
import { isSingleWord } from './word-senses.ts';
export type RepairKind = 'words' | 'sentences' | 'poems' | 'hanzi';
export type RepairResult = {
  values: Record<string, string>;
  pronunciations: {
    text: string;
    alphabet: 'py' | 'cmu';
    ph: string;
  }[];
  note: string;
  verified: boolean;
};
export type RepairRequest = {
  kind: RepairKind;
  issue: string;
  description: string;
  source: Record<string, string>;
  fields: Record<string, number>;
  speech?: string;
  accent?: string;
  grade?: string;
};
export type RepairVerification = {
  approved: boolean;
  reason: string;
};
export type RepairVerificationRequest = Omit<RepairRequest, 'fields'> & {
  candidate: RepairResult;
  pronunciation_reference?: unknown;
};
type Source = {
  row: Row;
  content: Record<string, string>;
  example: Row | null;
  version: number;
};
type Access = {
  tx<T>(fn: (q: Sql) => Promise<T>): Promise<T>;
  child(q: Sql, actor: string, id: string): Promise<Row>;
  write<T, S>(actor: string, key: string, op: string, payload: unknown, scope: (q: Sql) => Promise<S>, fn: (q: Sql, source: S) => Promise<T>): Promise<T>;
};
const one = async (q: Sql, s: string, p: unknown[] = []) => (await q.query(s, p)).rows[0];
const limits: Record<RepairKind, Record<string, number>> = {
  words: {
    lemma: 100,
    part_of_speech: 80,
    meaning_zh: 2000,
    ipa_gb: 200,
    ipa_us: 200,
    example_en: 1000,
    example_zh: 1000
  },
  sentences: { text_en: 1000, translation_zh: 1000 },
  poems: {
    title: 100, author: 100, dynasty: 40, body: 1000, annotations: 3000, translation: 3000
  },
  hanzi: {
    character: 1,
    pinyin: 200,
    radical: 20,
    strokes: 3,
    meaning: 2000,
    words: 1000,
    example: 1000
  }
};
const options: Record<RepairKind, Record<string, string[]>> = {
  words: {
    source: ['lemma'],
    meaning: ['part_of_speech', 'meaning_zh'],
    phonetic: ['ipa_gb', 'ipa_us'],
    example: ['example_en', 'example_zh'],
    audio: [],
    example_audio: []
  },
  sentences: {
    source: ['text_en'], translation: ['translation_zh'], audio: []
  },
  poems: {
    source: ['title', 'author', 'dynasty', 'body'],
    explanation: ['annotations', 'translation'],
    audio: []
  },
  hanzi: {
    source: ['character'],
    pinyin: ['pinyin'],
    structure: ['radical', 'strokes'],
    meaning: ['meaning'],
    example: ['words', 'example'],
    audio: [],
    example_audio: []
  }
};
const stable = (v: unknown): string => JSON.stringify(v === null || typeof v !== 'object' ? v : Array.isArray(v) ? v.map(x => JSON.parse(stable(x))) : Object.fromEntries(Object.keys(v).sort().map(k => [k, JSON.parse(stable((v as Record<string, unknown>)[k]))])));
export const repairHash = (v: unknown) => createHash('sha256').update(stable(v)).digest('hex');
export function repairContext(kind: RepairKind, row: Row) {
  return Object.fromEntries(Object.keys(limits[kind]).filter(k => !k.startsWith('example_')).map(k => [k, String(row[k] ?? '')]));
}
const table = {
  words: 'child_words', sentences: 'sentences', poems: 'poems', hanzi: 'hanzi'
};
const validKind = (k: unknown): k is RepairKind => typeof k === 'string' && Object.hasOwn(table, k);
export const repairSpeechContext = (kind: RepairKind, row: Row) => {
  const content = repairContext(kind, row);
  if (kind === 'poems') {
    delete content.annotations;
    delete content.translation;
  }
  if (kind === 'hanzi') {
    delete content.strokes;
    delete content.radical;
  }
  return content;
};
export async function repairedAudio(q: Sql, child: string, kind: RepairKind, id: string, part: string, accent: string, voice: string, row: Row, rate = kind === 'words' || kind === 'sentences' ? 1 : 0.9) {
  if (!(await one(q, "SELECT to_regclass('wordmate.content_repairs') present"))?.present)
    return null;
  const r = await one(q, "SELECT id FROM content_repairs WHERE child_id=$1 AND audio_kind=$2 AND audio_target=$3 AND audio_part=$4 AND accent=$5 AND voice_id=$6 AND audio_context_hash=$7 AND speech_rate=$8 AND status='succeeded' AND audio_bytes IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1", [child, kind, id, part, accent, voice, repairHash(repairSpeechContext(kind, row)), rate]);
  return r ? {
    id: r.id,
    resource_path: `/children/${child}/content-repairs/${r.id}/audio`,
    status: 'succeeded',
    audio_id: r.id
  } : null;
}
export async function repairedSentenceVersions(q: Sql, child: string, id: string, from: number, to: number) {
  if (from === to)
    return true;
  if (from > to || !(await one(q, "SELECT to_regclass('wordmate.content_repairs') present"))?.present)
    return false;
  const rows = (await q.query("SELECT source_version,applied_source_version,undo_source_version FROM content_repairs WHERE child_id=$1 AND kind='sentences' AND target_id=$2 AND applied_source_version IS NOT NULL AND status IN ('succeeded','undone') ORDER BY created_at,id", [child, id])).rows;
  let version = from;
  for (let step = 0; step <= rows.length * 2 && version < to; step++) {
    const next = rows.flatMap(r => [
      [r.source_version, r.applied_source_version],
      [r.applied_source_version, r.undo_source_version]
    ]).find(([a, b]) => a === version && b > version && b <= to);
    if (!next)
      return false;
    version = next[1];
  }
  return version === to;
}
export class ContentRepairs {
  private a: Access;
  private accounts?: AiAccounts;
  private runtime?: AudioRuntime;
  constructor(a: Access, accounts?: AiAccounts, runtime?: AudioRuntime) {
    this.a = a;
    this.accounts = accounts;
    this.runtime = runtime;
  }
  private async source(q: Sql, actor: string, child: string, kind: RepairKind, id: string): Promise<Source> {
    await this.a.child(q, actor, child);
    uuid(id);
    const row = await one(q, `SELECT * FROM ${table[kind]} WHERE child_id=$1 AND id=$2${kind === 'words' ? ' AND archived_at IS NULL' : kind === 'sentences' ? " AND status='validated'" : ''}`, [child, id]);
    ensure(row, 404, 'REPAIR_TARGET_NOT_FOUND');
    const content = repairContext(kind, row);
    let example: Row | null = null;
    if (kind === 'words') {
      example = await one(q, "SELECT s.* FROM sentences s JOIN sentence_targets t ON t.sentence_id=s.id WHERE t.child_word_id=$1 AND t.child_id=$2 AND s.status='validated' ORDER BY s.created_at DESC,s.id DESC LIMIT 1", [id, child]) ?? null;
      content._example_id = String(example?.id ?? '');
      content.example_en = String(example?.text_en ?? '');
      content.example_zh = String(example?.translation_zh ?? '');
    }
    return {
      row,
      content,
      example,
      version: kind === 'sentences' ? row.content_version : row.version
    };
  }
  private dto(r: Row) {
    return {
      id: r.id,
      kind: r.kind,
      target_id: r.target_id,
      issue: r.issue,
      status: r.status,
      note: r.note,
      error_code: r.error_code,
      created_at: r.created_at,
      original: r.status === 'succeeded' || r.status === 'undone' ? r.source.content : undefined,
      changes: r.result?.values,
      resource_path: r.status === 'succeeded' && r.audio_bytes ? `/children/${r.child_id}/content-repairs/${r.id}/audio` : null
    };
  }
  async latest(actor: string, child: string, kind: unknown, id: unknown) {
    ensure(validKind(kind), 422, 'INVALID_REPAIR_KIND');
    return this.a.tx(async (q) => {
      const source = await this.source(q, actor, child, kind, uuid(id));
      const row = await one(q, 'SELECT * FROM content_repairs WHERE child_id=$1 AND kind=$2 AND target_id=$3 ORDER BY created_at DESC,id DESC LIMIT 1', [child, kind, id]);
      return { version: source.version, latest: row ? this.dto(row) : null };
    });
  }
  async get(actor: string, child: string, id: string) {
    return this.a.tx(async (q) => {
      await this.a.child(q, actor, child);
      const row = await one(q, 'SELECT * FROM content_repairs WHERE child_id=$1 AND id=$2', [child, uuid(id)]);
      ensure(row, 404, 'REPAIR_NOT_FOUND');
      return this.dto(row);
    });
  }
  async create(actor: string, key: string, child: string, body: unknown) {
    ensure(body !== null && typeof body === 'object' && !Array.isArray(body), 422, 'INVALID_REPAIR_ISSUE');
    const b = body as Record<string, unknown>;
    ensure(validKind(b.kind) && typeof b.issue === 'string' && Object.hasOwn(options[b.kind], b.issue), 422, 'INVALID_REPAIR_ISSUE');
    const kind = b.kind;
    const issue = b.issue;
    const targetId = uuid(b.target_id);
    const description = b.description ?? '';
    ensure(Number.isInteger(b.expected_version) && Number(b.expected_version) >= 0, 422, 'INVALID_VERSION');
    ensure(typeof description === 'string' && description.length <= 500 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(description), 422, 'INVALID_TEXT');
    ensure(b.accent == null || typeof b.accent === 'string', 422, 'VOICE_ACCENT_UNAVAILABLE');
    ensure(b.voice_id == null || typeof b.voice_id === 'string', 422, 'VOICE_ACCENT_UNAVAILABLE');
    ensure(issue !== 'source' || b.identity_confirmed === true, 422, 'REPAIR_IDENTITY_CONFIRMATION_REQUIRED');
    return this.a.write(actor, key, `repair:create:${child}:${kind}:${targetId}`, b, q => this.source(q, actor, child, kind, targetId), async (q, source) => {
      ensure(source.version === b.expected_version, 409, 'REPAIR_CONTENT_CHANGED');
      ensure(this.accounts, 503, 'AI_NOT_CONFIGURED');
      const active = await one(q, "SELECT * FROM content_repairs WHERE child_id=$1 AND kind=$2 AND target_id=$3 AND status IN ('queued','running')", [child, kind, targetId]);
      if (active) {
        ensure(active.issue === issue, 409, 'REPAIR_ALREADY_RUNNING');
        return this.dto(active);
      }
      const recent = await one(q, "SELECT count(*)::int n FROM content_repairs WHERE actor_id=$1 AND created_at>now()-interval '24 hours'", [actor]);
      ensure(recent.n < 50, 429, 'REPAIR_DAILY_LIMIT');
      if (issue.startsWith('example'))
        ensure(source.example || kind === 'hanzi', 422, 'REPAIR_EXAMPLE_MISSING');
      let accent: string | null = null;
      let voice: string | null = null;
      if (issue.endsWith('audio')) {
        ensure(this.runtime?.synthesize, 503, 'AUDIO_NOT_CONFIGURED');
        if (kind === 'words' || kind === 'sentences') {
          const settings = await one(q, 'SELECT audio_accent,audio_voice_id FROM users WHERE id=$1', [actor]);
          accent = typeof b.accent === 'string' ? b.accent : settings.audio_accent;
          voice = (typeof b.voice_id === 'string' ? b.voice_id : undefined) ?? settings.audio_voice_id ?? this.runtime!.voices.find(v => v.accent === accent)?.id;
          ensure(this.runtime!.voices.some(v => v.id === voice && v.accent === accent), 422, 'VOICE_ACCENT_UNAVAILABLE');
        }
        else {
          accent = 'zh-CN';
          voice = 'longxiaochun_v3';
        }
      }
      const row = await one(q, 'INSERT INTO content_repairs(child_id,actor_id,kind,target_id,issue,description,source,source_version,source_hash,accent,voice_id,speech_rate) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12) RETURNING *', [child, actor, kind, targetId, issue, description.trim(), JSON.stringify({ content: source.content, example_id: source.example?.id ?? null }), source.version, repairHash(source.content), accent, voice, kind === 'words' || kind === 'sentences' ? 1 : 0.9]);
      return this.dto(row);
    });
  }
  private speech(job: Row, source: {
    row: Row;
    example: Row | null;
  }) {
    const kind = job.kind as RepairKind;
    let audioKind = kind;
    let id = job.target_id;
    let part = 'body';
    let row = source.row;
    let text = '';
    if (kind === 'words') {
      if (job.issue === 'example_audio') {
        row = source.example!;
        audioKind = 'sentences';
        id = row.id;
        text = row.text_en;
      }
      else {
        text = row.lemma;
        part = 'word';
      }
    }
    if (kind === 'sentences')
      text = row.text_en;
    if (kind === 'poems') {
      const headings = [String(row.title).trim(), [row.dynasty, row.author].filter(Boolean).join('，')].filter(Boolean).map(v => /[。！？!?]$/.test(v) ? v : `${v}。`);
      text = [...headings, String(row.body).trim()].join('\n');
    }
    if (kind === 'hanzi') {
      part = job.issue === 'example_audio' ? 'example' : 'character';
      text = String(row[part] ?? '').trim();
    }
    ensure(text && text.length <= 1000, 422, 'REPAIR_SPEECH_TOO_LONG');
    return {
      kind: audioKind, id, part, row, text
    };
  }
  private async apply(q: Sql, job: Row, values: Record<string, string>, source: Source) {
    const kind = job.kind as RepairKind;
    const id = job.target_id;
    const child = job.child_id;
    const content = { ...source.content, ...values };
    if (kind === 'words') {
      if (values.lemma !== undefined)
        ensure(isSingleWord(values.lemma), 422, 'REPAIR_NOT_VERIFIED');
      if (values.lemma !== undefined)
        ensure(!await one(q, 'SELECT 1 FROM child_words WHERE child_id=$1 AND id<>$2 AND lower(lemma)=lower($3) AND archived_at IS NULL', [child, id, values.lemma]), 409, 'WORD_DUPLICATE');
      const keys = Object.keys(values).filter(k => !k.startsWith('example_'));
      if (keys.length) {
        if (values.part_of_speech)
          values.part_of_speech = shortPos(values.part_of_speech);
        await q.query(`UPDATE child_words SET ${keys.map((k, i) => `${k}=$${i + 3}::text`).join(',')}${values.lemma !== undefined ? ',normalized_lemma=lower($3::text)' : ''},version=version+1 WHERE child_id=$1 AND id=$2`, [child, id, ...keys.map(k => values[k])]);
      }
      if (values.example_en !== undefined || values.example_zh !== undefined) {
        ensure(source.example, 409, 'REPAIR_CONTENT_CHANGED');
        if (values.example_en !== undefined) {
          const { locateVocabularyTarget } = await import(pathToFileURL(resolve(__dirname, '../../../packages/ai/dist/vocabulary-target.js')).href);
          const targets = (await q.query('SELECT t.child_word_id,w.lemma,w.part_of_speech FROM sentence_targets t JOIN child_words w ON w.id=t.child_word_id WHERE t.child_id=$1 AND t.sentence_id=$2', [child, source.example.id])).rows;
          for (const target of targets) {
            const position = locateVocabularyTarget(content.example_en, target.lemma, target.part_of_speech);
            ensure(position, 422, 'REPAIR_NOT_VERIFIED');
            await q.query('UPDATE sentence_targets SET surface=$4,start_utf16=$5,end_utf16=$6 WHERE child_id=$1 AND sentence_id=$2 AND child_word_id=$3', [child, source.example.id, target.child_word_id, position.surface, position.start, position.end]);
          }
        }
        await q.query('UPDATE sentences SET text_en=$3,translation_zh=$4,content_version=content_version+1 WHERE child_id=$1 AND id=$2', [child, source.example.id, content.example_en, content.example_zh]);
        if (!keys.length)
          await q.query('UPDATE child_words SET version=version+1 WHERE id=$1', [id]);
      }
    }
    else if (kind === 'sentences') {
      if (values.text_en !== undefined) {
        const identity = values.text_en.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').replace(/\s+([,.!?;:])/g, '$1').trim().replace(/\.$/, '');
        ensure(!await one(q, 'SELECT 1 FROM sentence_library WHERE child_id=$1 AND normalized_en=$2 AND sentence_id<>$3', [child, identity, id]), 409, 'SENTENCE_DUPLICATE');
        await q.query('UPDATE sentence_library SET normalized_en=$2 WHERE sentence_id=$1', [id, identity]);
      }
      const keys = Object.keys(values);
      if (keys.length) {
        await q.query(`UPDATE sentences SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(',')},content_version=content_version+1 WHERE child_id=$1 AND id=$2`, [child, id, ...keys.map(k => values[k])]);
        await q.query('UPDATE sentence_library SET version=version+1 WHERE sentence_id=$1', [id]);
      }
    }
    else {
      if (kind === 'hanzi' && values.character !== undefined) {
        ensure(/^\p{Script=Han}$/u.test(values.character), 422, 'INVALID_HANZI');
        ensure(!await one(q, 'SELECT 1 FROM hanzi WHERE child_id=$1 AND character=$2 AND id<>$3', [child, values.character, id]), 409, 'HANZI_EXISTS');
      }
      const keys = Object.keys(values);
      if (keys.length)
        await q.query(`UPDATE ${table[kind]} SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(',')},version=version+1,updated_at=now() WHERE child_id=$1 AND id=$2`, [child, id, ...keys.map(k => k === 'strokes' ? (values[k] ? Number(values[k]) : null) : values[k])]);
    }
    return this.source(q, job.actor_id, child, kind, id);
  }
  async undo(actor: string, key: string, child: string, id: string) {
    return this.a.write(actor, key, `repair:undo:${id}`, {}, q => this.a.child(q, actor, child), async (q) => {
      const job = await one(q, 'SELECT * FROM content_repairs WHERE child_id=$1 AND id=$2 FOR UPDATE', [child, uuid(id)]);
      ensure(job, 404, 'REPAIR_NOT_FOUND');
      if (job.status === 'undone')
        return this.dto(job);
      ensure(job.status === 'succeeded', 409, 'REPAIR_NOT_APPLIED');
      const source = await this.source(q, actor, child, job.kind, job.target_id);
      const keys = Object.keys(job.result?.values ?? {});
      if (keys.length)
        ensure(repairHash(source.content) === job.after_hash, 409, 'REPAIR_CONTENT_CHANGED');
      const restored = keys.length ? await this.apply(q, { ...job, actor_id: actor }, Object.fromEntries(keys.map(k => [k, job.source.content[k]])), source) : source;
      return this.dto(await one(q, "UPDATE content_repairs SET status='undone',undo_source_version=$2,updated_at=now() WHERE id=$1 RETURNING *", [id, restored.version]));
    });
  }
  async audio(actor: string, child: string, id: string) {
    return this.a.tx(async (q) => {
      await this.a.child(q, actor, child);
      const job = await one(q, "SELECT * FROM content_repairs WHERE child_id=$1 AND id=$2 AND status='succeeded'", [child, uuid(id)]);
      ensure(job?.audio_bytes, 404, 'AUDIO_RESOURCE_NOT_FOUND');
      const source = await this.source(q, actor, child, job.audio_kind, job.audio_target);
      ensure(repairHash(repairSpeechContext(job.audio_kind, source.row)) === job.audio_context_hash, 409, 'AUDIO_CONTENT_CHANGED');
      return Buffer.from(job.audio_bytes);
    });
  }
  async processOne() {
    const candidate = await this.a.tx(async (q) => {
      if (!(await one(q, "SELECT to_regclass('wordmate.content_repairs') present"))?.present)
        return null;
      const expired = (await q.query("UPDATE content_repairs SET status='failed',error_code='REPAIR_TIMEOUT',updated_at=now() WHERE status='running' AND lease_until<now() RETURNING id,audio_billing_id")).rows;
      for (const row of expired) {
        await this.accounts?.releaseInTransaction(q, `content-repair:${row.id}`);
        await this.accounts?.releaseInTransaction(q, `content-repair-check:${row.id}`);
        if (row.audio_billing_id)
          await releaseAiCall(q, row.audio_billing_id, 'REPAIR_TIMEOUT');
      }
      return one(q, "SELECT id FROM content_repairs WHERE status='queued' ORDER BY created_at,id LIMIT 1");
    });
    if (!candidate)
      return false;
    const attempt = randomUUID();
    let billing: string | undefined;
    let verificationBilling: string | undefined;
    let audioBilling: string | undefined;
    let claimed = false;
    let stage = 'generation';
    try {
      const input = await this.a.tx(async (q) => {
        const read = await one(q, 'SELECT * FROM content_repairs WHERE id=$1', [candidate.id]);
        if (!read || read.status !== 'queued')
          return null;
        const child = await this.a.child(q, read.actor_id, read.child_id);
        const job = await one(q, "SELECT * FROM content_repairs WHERE id=$1 AND status='queued' FOR UPDATE SKIP LOCKED", [read.id]);
        if (!job)
          return null;
        const source = await this.source(q, job.actor_id, job.child_id, job.kind, job.target_id);
        ensure(repairHash(source.content) === job.source_hash, 409, 'REPAIR_CONTENT_CHANGED');
        const generate = await this.accounts!.contentRepair(q, job.actor_id, `content-repair:${job.id}`, child.family_id);
        const verify = await this.accounts!.contentRepair(q, job.actor_id, `content-repair-check:${job.id}`, child.family_id, true);
        await q.query("UPDATE content_repairs SET status='running',attempt_id=$2,lease_until=now()+interval '15 minutes',updated_at=now() WHERE id=$1", [job.id, attempt]);
        const speech = job.issue.endsWith('audio') ? this.speech(job, source) : null;
        return {
          job, source, generate, verify, speech, grade: child.school_grade
        };
      });
      if (!input)
        return false;
      claimed = true;
      const { job, speech } = input;
      const fields = Object.fromEntries(options[job.kind as RepairKind][job.issue].map(k => [k, limits[job.kind as RepairKind][k]]));
      const request: RepairRequest = {
        kind: job.kind,
        issue: job.issue,
        description: job.description,
        source: input.source.content,
        fields,
        ...(speech ? { speech: speech.text, accent: job.accent } : {}),
        grade: input.grade
      };
      let result: RepairResult | undefined;
      let pronunciationReference: unknown;
      if (job.kind === 'poems' && job.issue === 'audio' && speech && !job.description.trim()) {
        const pronunciation = await import(pathToFileURL(resolve(__dirname, '../../../packages/ai/dist/chinese-pronunciation.js')).href);
        const plan = pronunciation.chinesePronunciationPlan(speech.text);
        if (plan) {
          result = plan.candidate;
          pronunciationReference = plan.reference;
        }
      }
      if (!result) {
        const generated = await input.generate(request);
        billing = generated.id;
        result = generated.data.data;
      }
      ensure(result?.verified === true, 422, 'REPAIR_NOT_VERIFIED');
      stage = 'verification';
      const checked = await input.verify({
        kind: job.kind,
        issue: job.issue,
        description: job.description,
        source: input.source.content,
        candidate: result,
        ...(speech ? { speech: speech.text, accent: job.accent } : {}),
        ...(pronunciationReference ? { pronunciation_reference: pronunciationReference } : {}),
        grade: input.grade
      });
      verificationBilling = checked.id;
      if (checked.data.data.approved !== true)
        throw Object.assign(new DomainError(422, 'REPAIR_NOT_VERIFIED'), { repairReason: checked.data.data.reason });
      result.values = Object.fromEntries(Object.entries(result.values as Record<string, string>).map(([key, value]) => [key, key === 'part_of_speech' ? shortPos(value) : value]).filter(([key, value]) => input.source.content[key] !== value));
      if (result.values.part_of_speech !== undefined) {
        ensure(result.values.part_of_speech.split(/[/；;,、]/).every(label =>
          /^(?:n|v|vt|vi|adj|adv|pron|prep|conj|interj|art|det|num|phr|part|contr|aux|mod|abbr)\.$/.test(label.trim())),
        422, 'REPAIR_NOT_VERIFIED');
      }
      if (!speech && !Object.keys(result.values).length)
        result.note = '已核对，未发现需要修改的内容。';
      const verifiedResult = result;
      let bytes: Buffer | undefined;
      if (speech) {
        stage = 'speech';
        const adapter = await import(pathToFileURL(resolve(__dirname, '../../../packages/ai/dist/content-repair.js')).href);
        audioBilling = await this.a.tx(async (q) => {
          await this.a.child(q, job.actor_id, job.child_id);
          const live = await one(q, "SELECT * FROM content_repairs WHERE id=$1 AND attempt_id=$2 AND status='running' FOR UPDATE", [job.id, attempt]);
          ensure(live, 409, 'REPAIR_LEASE_LOST');
          const id = await reserveAudio(q, job.actor_id, job.child_id, job.id, speech.text, audioTariff(String(this.runtime!.profile.model), this.runtime!.pricePer10000Characters));
          await q.query('UPDATE content_repairs SET audio_billing_id=$2 WHERE id=$1', [job.id, id]);
          return id;
        });
        const audio = await this.runtime!.synthesize!({
          text: speech.text,
          ssml: adapter.repairSsml(speech.text, verifiedResult.pronunciations),
          accent: job.accent,
          voiceId: job.voice_id,
          rate: job.kind === 'words' || job.kind === 'sentences' ? 1 : 0.9,
          languageHints: job.accent === 'zh-CN' ? ['zh'] : ['en']
        });
        bytes = Buffer.from(audio.bytes);
        ensure(bytes.length >= 3 && bytes.length <= 10 * 1024 * 1024 && (bytes.subarray(0, 3).toString() === 'ID3' || bytes[0] === 255 && (bytes[1] & 224) === 224), 502, 'INVALID_AUDIO_RESPONSE');
      }
      await this.a.tx(async (q) => {
        if (bytes && speech) {
          const old = await one(q, "SELECT audio_bytes FROM content_repairs WHERE child_id=$1 AND audio_kind=$2 AND audio_target=$3 AND audio_part=$4 AND accent=$5 AND voice_id=$6 AND audio_context_hash=$7 AND status='succeeded' AND audio_bytes IS NOT NULL ORDER BY created_at DESC LIMIT 1", [job.child_id, speech.kind, speech.id, speech.part, job.accent, job.voice_id, repairHash(repairSpeechContext(speech.kind, speech.row))]);
          const digest = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
          if (old)
            ensure(digest(old.audio_bytes) !== digest(bytes), 422, 'REPAIR_AUDIO_UNCHANGED');
          if (speech.kind === 'words' || speech.kind === 'sentences') {
            const original = await one(q, `SELECT sha256 FROM audio_assets WHERE child_id=$1 AND ${speech.kind === 'words' ? 'child_word_id' : 'sentence_id'}=$2 AND content_version=$3 AND accent=$4 AND voice_id=$5 AND status='succeeded' ORDER BY created_at DESC LIMIT 1`, [job.child_id, speech.id, speech.kind === 'words' ? speech.row.version : speech.row.content_version, job.accent, job.voice_id]);
            if (original?.sha256)
              ensure(original.sha256 !== digest(bytes), 422, 'REPAIR_AUDIO_UNCHANGED');
          }
        }
        const source = await this.source(q, job.actor_id, job.child_id, job.kind, job.target_id);
        const live = await one(q, "SELECT * FROM content_repairs WHERE id=$1 AND status='running' AND attempt_id=$2 AND lease_until>now() FOR UPDATE", [job.id, attempt]);
        ensure(live, 409, 'REPAIR_LEASE_LOST');
        ensure(repairHash(source.content) === job.source_hash, 409, 'REPAIR_CONTENT_CHANGED');
        const after = Object.keys(verifiedResult.values).length ? await this.apply(q, job, verifiedResult.values, source) : source;
        if (billing)
          await this.accounts!.settle(q, billing);
        await this.accounts!.settle(q, verificationBilling!);
        if (audioBilling) {
          await q.query("UPDATE ai_calls SET state='ready',updated_at=now() WHERE id=$1 AND state='running'", [audioBilling]);
          await settleAiCall(q, audioBilling);
        }
        await q.query("UPDATE content_repairs SET status='succeeded',result=$2::jsonb,note=$3,after_hash=$4,applied_source_version=$5,audio_kind=$6,audio_target=$7,audio_part=$8,audio_context_hash=$9,audio_bytes=$10,lease_until=NULL,updated_at=now() WHERE id=$1", [job.id, JSON.stringify(verifiedResult), verifiedResult.note, repairHash(after.content), after.version, speech?.kind ?? null, speech?.id ?? null, speech?.part ?? null, speech ? repairHash(repairSpeechContext(speech.kind, speech.row)) : null, bytes ?? null]);
      });
    }
    catch (error) {
      const failure = error !== null && typeof error === 'object' ? error as Record<string, unknown> : {};
      const raw = failure.code;
      const code = raw === 'GENERATED_CONTENT_REJECTED' ? 'REPAIR_NOT_VERIFIED' : typeof raw === 'string' && /^[A-Z_]{2,64}$/.test(raw) ? raw : 'REPAIR_FAILED';
      const validation = failure.validationIssue;
      const field = validation !== null && typeof validation === 'object' && 'field' in validation ? validation.field : undefined;
      const reason = failure.repairReason;
      const diagnostic = {
        stage,
        ...(typeof reason === 'string' && !/[\u0000-\u001f\u007f]/.test(reason) ? { reason: reason.slice(0, 300) } : {}),
        ...(typeof field === 'string' && /^[a-z_]{1,40}$/.test(field) ? { field } : {})
      };
      // Release reservations and persist failure atomically. If the database fails,
      // propagate the error so the running lease remains recoverable on timeout.
      await this.a.tx(async (q) => {
        await q.query('SELECT id FROM content_repairs WHERE id=$1 FOR UPDATE', [candidate.id]);
        if (verificationBilling)
          await releaseAiCall(q, verificationBilling, code);
        if (billing)
          await releaseAiCall(q, billing, code);
        if (audioBilling)
          await releaseAiCall(q, audioBilling, code);
        await q.query(`UPDATE content_repairs SET status='failed',error_code=$3,result=coalesce(result,'{}'::jsonb)||$4::jsonb,lease_until=NULL,updated_at=now() WHERE id=$1 AND $2::uuid IS NOT NULL AND ${claimed ? "status='running' AND attempt_id=$2" : "status='queued'"}`, [candidate.id, attempt, code, JSON.stringify({ diagnostic })]);
      });
    }
    return true;
  }
}
