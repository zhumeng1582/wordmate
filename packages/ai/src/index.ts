import { createHash } from 'node:crypto';

export type Provider = 'openai' | 'qwen';
export type Fetch = typeof globalThis.fetch;
export type JsonRequest<T> = {
  name: string;
  schema: Record<string, unknown>;
  instructions: string;
  input: unknown;
  // Required: validate shape AND word/sense/answer semantics in the caller.
  validate: (value: unknown) => T;
};
export interface TextGenerator {
  generate<T>(request: JsonRequest<T>): Promise<{
    data: T; provider: Provider; model: string; usage: unknown;
  }>;
}
export class ProviderError extends Error {
  code: string;
  retryable: boolean;
  status?: number;
  constructor(code: string, retryable = false, status?: number) {
    super(code); this.name = 'ProviderError';
    this.code = code; this.retryable = retryable; this.status = status;
  }
}
function required(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new ProviderError(`MISSING_${key}`);
  return value;
}
// No adapter retries: persistent generation_jobs owns attempt limits and billing.
async function request(fetcher: Fetch, url: string, init: RequestInit, timeout: number): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeout) });
  } catch { throw new ProviderError('UPSTREAM_NETWORK_OR_TIMEOUT', true); }
  if (!response.ok) throw new ProviderError('UPSTREAM_HTTP_ERROR', response.status === 429 || response.status >= 500, response.status);
  return response;
}
async function json(response: Response): Promise<any> {
  try { return await response.json(); }
  catch { throw new ProviderError('UPSTREAM_INVALID_JSON', true); }
}
export function createTextGenerator(env: Record<string, string | undefined> = process.env, fetcher: Fetch = fetch): TextGenerator {
  const provider = env.LLM_PROVIDER || 'openai';
  if (provider !== 'openai' && provider !== 'qwen') throw new ProviderError('UNSUPPORTED_LLM_PROVIDER');
  const prefix = provider === 'openai' ? 'OPENAI' : 'QWEN';
  const apiKey = required(env, `${prefix}_API_KEY`);
  const model = required(env, `${prefix}_MODEL`);
  let base = 'https://api.openai.com/v1';
  if (provider === 'qwen') {
    base = required(env, 'QWEN_BASE_URL').replace(/\/$/, '');
    const url = new URL(base);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.aliyuncs.com') || url.username || url.password || url.search || url.hash || url.port)
      throw new ProviderError('INVALID_QWEN_BASE_URL');
  }
  return {
    async generate<T>(r: JsonRequest<T>) {
      if (typeof r.validate !== 'function') throw new ProviderError('VALIDATOR_REQUIRED');
      const format = { type: 'json_schema', name: r.name, strict: true, schema: r.schema };
      const userInput = JSON.stringify(r.input);
      const body = provider === 'openai'
        ? { model, store: false, instructions: r.instructions, input: userInput, text: { format }, max_output_tokens: 8192 }
        : { model, enable_thinking: false, messages: [{ role: 'system', content: r.instructions }, { role: 'user', content: userInput }],
            response_format: { type: 'json_schema', json_schema: { name: r.name, strict: true, schema: r.schema } }, max_tokens: 8192 };
      const response = await request(fetcher, `${base}/${provider === 'openai' ? 'responses' : 'chat/completions'}`, {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }, 60000);
      const result = await json(response);
      let text: string;
      if (provider === 'openai') {
        if (result.status !== 'completed') throw new ProviderError('INCOMPLETE_GENERATION', true);
        const content = (result.output || []).filter((x: any) => x.type === 'message').flatMap((x: any) => x.content || []);
        if (content.some((x: any) => x.type === 'refusal')) throw new ProviderError('MODEL_REFUSAL');
        text = content.filter((x: any) => x.type === 'output_text').map((x: any) => x.text).join('');
      } else {
        const choice = result.choices?.[0];
        if (choice?.message?.refusal) throw new ProviderError('MODEL_REFUSAL');
        if (choice?.finish_reason !== 'stop') throw new ProviderError('INCOMPLETE_GENERATION', true);
        text = choice.message.content;
      }
      let value: unknown;
      try { value = JSON.parse(text); }
      catch { throw new ProviderError('INVALID_GENERATED_JSON', true); }
      let data: T;
      try { data = r.validate(value); }
      catch { throw new ProviderError('GENERATED_CONTENT_REJECTED', true); }
      return { data, provider, model, usage: result.usage ?? null };
    },
  };
}

export type Accent = 'en-GB' | 'en-US';
export type Voice = { id: string; accent: Accent; gender: string };
export type SpeechRequest = { text: string; accent: Accent; voiceId: string; rate: number };
export interface TtsProvider {
  listVoices(): Promise<Voice[]>;
  synthesize(r: SpeechRequest): Promise<{ bytes: Uint8Array; mimeType: 'audio/mpeg'; provider: 'cosyvoice' }>;
}
// Official cosyvoice-v3-flash Beijing catalog. Account enablement must be verified
// by deployment smoke tests; this is a configured allowlist, not a live account API.
const COSY_VOICES: Voice[] = [
  { id: 'loongemily_v3', accent: 'en-GB', gender: 'Female' },
  { id: 'loongeric_v3', accent: 'en-GB', gender: 'Male' },
  { id: 'loongabby_v3', accent: 'en-US', gender: 'Female' },
  { id: 'loongandy_v3', accent: 'en-US', gender: 'Male' },
];
export function createTtsProvider(env: Record<string, string | undefined> = process.env, fetcher: Fetch = fetch): TtsProvider {
  if ((env.TTS_PROVIDER || 'cosyvoice') !== 'cosyvoice') throw new ProviderError('UNSUPPORTED_TTS_PROVIDER');
  const key = required(env, 'COSYVOICE_API_KEY');
  const workspace = required(env, 'COSYVOICE_WORKSPACE_ID');
  if (!/^[a-zA-Z0-9-]+$/.test(workspace)) throw new ProviderError('INVALID_COSYVOICE_WORKSPACE');
  const model = env.COSYVOICE_MODEL || 'cosyvoice-v3-flash';
  if (model !== 'cosyvoice-v3-flash') throw new ProviderError('UNVERIFIED_TTS_MODEL');
  const ids = required(env, 'COSYVOICE_ENABLED_VOICES').split(',').map(x => x.trim());
  if (ids.some(id => !COSY_VOICES.some(v => v.id === id))) throw new ProviderError('UNVERIFIED_TTS_VOICE');
  const voices = COSY_VOICES.filter(v => ids.includes(v.id));
  const base = `https://${workspace}.cn-beijing.maas.aliyuncs.com`;
  return {
    async listVoices() { return voices.map(v => ({ ...v })); },
    async synthesize(r) {
      if (!['en-GB', 'en-US'].includes(r.accent) || !Number.isFinite(r.rate) || r.rate < 0.5 || r.rate > 1.5 ||
          !r.text?.trim() || r.text.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(r.text))
        throw new ProviderError('INVALID_SPEECH_REQUEST');
      if (!voices.some(v => v.id === r.voiceId && v.accent === r.accent)) throw new ProviderError('VOICE_ACCENT_UNAVAILABLE');
      const result = await json(await request(fetcher, `${base}/api/v1/services/audio/tts/SpeechSynthesizer`, {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: { text: r.text, voice: r.voiceId, format: 'mp3', sample_rate: 24000,
          rate: r.rate, language_hints: ['en'], enable_ssml: false, enable_aigc_tag: true } }),
      }, 60000));
      if (result?.code) throw new ProviderError('TTS_SYNTHESIS_FAILED');
      if (result?.output?.finish_reason !== 'stop') throw new ProviderError('INCOMPLETE_SYNTHESIS', true);
      let audioUrl: URL;
      try { audioUrl = new URL(result.output.audio.url); }
      catch { throw new ProviderError('INVALID_AUDIO_URL'); }
      // Only the documented Beijing result bucket; never forward the API key.
      if (!['http:', 'https:'].includes(audioUrl.protocol) || audioUrl.hostname !== 'dashscope-result-bj.oss-cn-beijing.aliyuncs.com' ||
          audioUrl.username || audioUrl.password || audioUrl.port || audioUrl.hash)
        throw new ProviderError('INVALID_AUDIO_URL');
      audioUrl.protocol = 'https:';
      const audio = await request(fetcher, audioUrl.href, {}, 30000);
      let bytes: Uint8Array;
      try { bytes = new Uint8Array(await audio.arrayBuffer()); }
      catch { throw new ProviderError('UPSTREAM_AUDIO_READ_FAILED', true); }
      // OSS may use application/octet-stream. Verify MP3 ID3/frame header instead.
      const mp3 = bytes.length >= 3 && ((bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) || (bytes[0] === 255 && (bytes[1] & 224) === 224));
      if (!mp3 || bytes.length > 10 * 1024 * 1024) throw new ProviderError('INVALID_AUDIO_RESPONSE', true);
      return { bytes, mimeType: 'audio/mpeg', provider: 'cosyvoice' };
    },
  };
}
// Caller supplies child scope (or an explicitly public dictionary scope), content version,
// and provider/region profile. Provider changes never reuse old audio accidentally.
export function audioCacheKey(scope: string, contentVersion: string, profile: string, r: SpeechRequest): string {
  return createHash('sha256').update(JSON.stringify([scope, contentVersion, profile, r.text, r.accent, r.voiceId, r.rate, 'mp3-24k-cosy-v1'])).digest('hex');
}
