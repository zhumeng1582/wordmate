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
  synthesize(r: SpeechRequest): Promise<{ bytes: Uint8Array; mimeType: 'audio/mpeg'; provider: 'azure' }>;
}
const xml = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
export function createTtsProvider(env: Record<string, string | undefined> = process.env, fetcher: Fetch = fetch): TtsProvider {
  if ((env.TTS_PROVIDER || 'azure') !== 'azure') throw new ProviderError('UNSUPPORTED_TTS_PROVIDER');
  const key = required(env, 'AZURE_SPEECH_KEY');
  // Explicit region endpoint supports global Azure or Azure China; no silent cloud change.
  const base = required(env, 'AZURE_SPEECH_BASE_URL').replace(/\/$/, '');
  const url = new URL(base);
  if (url.protocol !== 'https:' || !/^[a-z0-9]+\.tts\.speech\.(microsoft\.com|azure\.cn)$/.test(url.hostname) ||
      url.pathname !== '/' || url.username || url.password || url.port || url.search || url.hash)
    throw new ProviderError('INVALID_SPEECH_BASE_URL');
  const headers = { 'Ocp-Apim-Subscription-Key': key };
  let cached: Voice[] | undefined;
  let cachedAt = 0;
  const provider: TtsProvider = {
    async listVoices() {
      if (cached && Date.now() - cachedAt < 3600000) return cached.map(v => ({ ...v }));
      const result = await json(await request(fetcher, `${base}/cognitiveservices/voices/list`, { headers }, 15000));
      if (!Array.isArray(result)) throw new ProviderError('INVALID_VOICE_CATALOG', true);
      cached = result.filter(v => ['en-GB', 'en-US'].includes(v.Locale) && v.VoiceType === 'Neural' &&
        typeof v.ShortName === 'string' && !v.ShortName.includes(':') && !v.ShortName.includes('Multilingual') &&
        v.Status === 'GA').map(v => ({ id: v.ShortName, accent: v.Locale, gender: v.Gender }));
      cachedAt = Date.now();
      return cached!.map(v => ({ ...v }));
    },
    async synthesize(r) {
      if (!['en-GB', 'en-US'].includes(r.accent) || !Number.isFinite(r.rate) || r.rate < 0.5 || r.rate > 1.5 ||
          !r.text?.trim() || r.text.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(r.text))
        throw new ProviderError('INVALID_SPEECH_REQUEST');
      const voices = await provider.listVoices();
      if (!voices.some(v => v.id === r.voiceId && v.accent === r.accent)) throw new ProviderError('VOICE_ACCENT_UNAVAILABLE');
      const percent = Math.round((r.rate - 1) * 100);
      const rate = `${percent >= 0 ? '+' : ''}${percent}%`;
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${r.accent}"><voice name="${xml(r.voiceId)}"><prosody rate="${rate}">${xml(r.text)}</prosody></voice></speak>`;
      const result = await request(fetcher, `${base}/cognitiveservices/v1`, { method: 'POST', headers: {
        ...headers, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'wordmate-api',
      }, body: ssml }, 30000);
      let bytes: Uint8Array;
      try { bytes = new Uint8Array(await result.arrayBuffer()); }
      catch { throw new ProviderError('UPSTREAM_AUDIO_READ_FAILED', true); }
      if (!bytes.length || !(result.headers.get('content-type') || '').toLowerCase().startsWith('audio/'))
        throw new ProviderError('INVALID_AUDIO_RESPONSE', true);
      return { bytes, mimeType: 'audio/mpeg', provider: 'azure' };
    },
  };
  return provider;
}
// Caller supplies child scope (or an explicitly public dictionary scope), content version,
// and provider/region profile. Provider changes never reuse old audio accidentally.
export function audioCacheKey(scope: string, contentVersion: string, profile: string, r: SpeechRequest): string {
  return createHash('sha256').update(JSON.stringify([scope, contentVersion, profile, r.text, r.accent, r.voiceId, r.rate, 'mp3-24k-48k'])).digest('hex');
}
