import type { LexiumEngine } from '../types';
import { formatClock, srtTime } from './clock';

export { formatClock };
export { formatTimestamp } from './clock';

/**
 * Lexium rules: the parts of the in-house translator that do not touch the DOM.
 *
 * The app ships no model and no translation engine of its own. Transcription
 * talks to a Whisper server the user runs (local-whisper, whisper.cpp, or any
 * OpenAI-compatible endpoint), translation talks to a LibreTranslate-compatible
 * server with a keyless public fallback, and the image reader uses Tesseract
 * loaded from a CDN. Everything here is pure so it can be tested without any of
 * those services, and so the renderer and the setup guide cannot drift apart.
 */

export interface LexiumLanguage {
  code: string;
  /** English name, used by the picker and by aria labels. */
  name: string;
  /** Endonym, shown next to the English name. */
  label: string;
}

export const LEXIUM_LANGUAGES: LexiumLanguage[] = [
  { code: 'en', name: 'English', label: 'English' },
  { code: 'es', name: 'Spanish', label: 'Español' },
  { code: 'de', name: 'German', label: 'Deutsch' },
  { code: 'fr', name: 'French', label: 'Français' },
  { code: 'it', name: 'Italian', label: 'Italiano' },
  { code: 'pt', name: 'Portuguese', label: 'Português' },
  { code: 'nl', name: 'Dutch', label: 'Nederlands' },
  { code: 'tr', name: 'Turkish', label: 'Türkçe' },
  { code: 'ru', name: 'Russian', label: 'Русский' },
  { code: 'uk', name: 'Ukrainian', label: 'Українська' },
  { code: 'pl', name: 'Polish', label: 'Polski' },
  { code: 'cs', name: 'Czech', label: 'Čeština' },
  { code: 'sk', name: 'Slovak', label: 'Slovenčina' },
  { code: 'ro', name: 'Romanian', label: 'Română' },
  { code: 'hu', name: 'Hungarian', label: 'Magyar' },
  { code: 'bg', name: 'Bulgarian', label: 'Български' },
  { code: 'el', name: 'Greek', label: 'Ελληνικά' },
  { code: 'ar', name: 'Arabic', label: 'العربية' },
  { code: 'he', name: 'Hebrew', label: 'עברית' },
  { code: 'fa', name: 'Persian', label: 'فارسی' },
  { code: 'hi', name: 'Hindi', label: 'हिन्दी' },
  { code: 'bn', name: 'Bengali', label: 'বাংলা' },
  { code: 'zh', name: 'Chinese', label: '中文' },
  { code: 'ja', name: 'Japanese', label: '日本語' },
  { code: 'ko', name: 'Korean', label: '한국어' },
  { code: 'vi', name: 'Vietnamese', label: 'Tiếng Việt' },
  { code: 'th', name: 'Thai', label: 'ไทย' },
  { code: 'id', name: 'Indonesian', label: 'Bahasa Indonesia' },
  { code: 'sv', name: 'Swedish', label: 'Svenska' },
  { code: 'da', name: 'Danish', label: 'Dansk' },
  { code: 'fi', name: 'Finnish', label: 'Suomi' },
  { code: 'no', name: 'Norwegian', label: 'Norsk' },
  { code: 'sr', name: 'Serbian', label: 'Српски' },
  { code: 'hr', name: 'Croatian', label: 'Hrvatski' },
];

const CODES = new Set(LEXIUM_LANGUAGES.map(language => language.code));

export function findLanguage(code: string): LexiumLanguage | undefined {
  return LEXIUM_LANGUAGES.find(language => language.code === code);
}

/** 'auto' and unknown values never reach a server as a bogus language. */
export function cleanLanguage(value: unknown, fallback = 'auto'): string {
  if (typeof value !== 'string') return fallback;
  const code = value.trim().toLowerCase().slice(0, 8);
  return CODES.has(code) ? code : fallback;
}

export function languageName(code: string): string {
  if (code === 'auto') return 'Detect';
  return findLanguage(code)?.name ?? code.toUpperCase();
}

export function languageLabel(code: string): string {
  if (code === 'auto') return 'Detect';
  const language = findLanguage(code);
  return language ? `${language.name} · ${language.label}` : code.toUpperCase();
}

/* ------------------------------------------------------------- detection --- */

/**
 * Offline script detection plus a small stop-word voting table. It is not a
 * classifier and does not pretend to be one: it decides which source language
 * to send when the user leaves the field on automatic, and it labels a
 * transcript. The server's own detection wins whenever it answers.
 */
const STOP_WORDS: Record<string, string[]> = {
  en: ['the', 'and', 'you', 'that', 'have', 'for', 'not', 'with', 'this', 'what', 'is', 'to', 'hello', 'thanks', 'please', 'good', 'morning'],
  es: ['el', 'la', 'que', 'de', 'y', 'en', 'los', 'por', 'para', 'con', 'una', 'es', 'no', 'hola', 'gracias', 'buenos'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ich', 'mit', 'für', 'ein', 'auf', 'zu', 'hallo', 'danke', 'bitte'],
  fr: ['le', 'la', 'les', 'et', 'est', 'que', 'pour', 'vous', 'avec', 'une', 'pas', 'dans', 'bonjour', 'merci', 'salut'],
  it: ['il', 'la', 'che', 'di', 'non', 'per', 'una', 'sono', 'con', 'questo', 'gli', 'è', 'ciao', 'grazie'],
  pt: ['o', 'que', 'não', 'uma', 'para', 'com', 'os', 'está', 'por', 'mais', 'como', 'você', 'olá', 'obrigado'],
  nl: ['de', 'het', 'een', 'en', 'niet', 'van', 'dat', 'met', 'voor', 'zijn', 'maar', 'ik', 'hallo', 'dank'],
  tr: [
    'bir', 've', 'bu', 'için', 'çok', 'ile', 'değil', 'ama', 'ben', 'sen', 'ne', 'nasıl',
    'merhaba', 'teşekkür', 'teşekkürler', 'günaydın', 'görüşürüz', 'tamam', 'evet', 'hayır',
  ],
  id: ['yang', 'dan', 'tidak', 'untuk', 'dengan', 'ini', 'itu', 'saya', 'kamu', 'apa', 'bisa', 'halo', 'terima'],
  pl: ['nie', 'jest', 'się', 'oraz', 'dla', 'ale', 'tak', 'jak', 'to', 'na', 'z', 'co'],
  sv: ['och', 'att', 'det', 'inte', 'som', 'för', 'med', 'jag', 'är', 'på', 'en', 'har'],
  da: ['og', 'ikke', 'det', 'som', 'for', 'med', 'jeg', 'er', 'på', 'en', 'har', 'til'],
  fi: ['ja', 'on', 'ei', 'että', 'se', 'kun', 'mutta', 'minä', 'sinä', 'mitä', 'tämä', 'voi'],
  no: ['og', 'ikke', 'det', 'som', 'for', 'med', 'jeg', 'er', 'på', 'en', 'har', 'til'],
  ro: ['și', 'este', 'nu', 'care', 'pentru', 'cu', 'un', 'o', 'să', 'pe', 'din', 'la'],
  hr: ['je', 'nije', 'da', 'koji', 'za', 'sa', 'na', 'se', 'to', 'ali', 'ili', 'kako'],
};

const SCRIPTS: Array<{ code: string; test: RegExp }> = [
  { code: 'ja', test: /[\u3040-\u30ff]/ },
  { code: 'ko', test: /[\uac00-\ud7af\u1100-\u11ff]/ },
  { code: 'zh', test: /[\u4e00-\u9fff]/ },
  { code: 'ar', test: /[\u0600-\u06ff]/ },
  { code: 'he', test: /[\u0590-\u05ff]/ },
  { code: 'el', test: /[\u0370-\u03ff]/ },
  { code: 'hi', test: /[\u0900-\u097f]/ },
  { code: 'bn', test: /[\u0980-\u09ff]/ },
  { code: 'th', test: /[\u0e00-\u0e7f]/ },
  { code: 'ru', test: /[\u0400-\u04ff]/ },
];

export function guessLanguage(text: string): string {
  const sample = (text ?? '').slice(0, 4000);
  if (!sample.trim()) return 'und';

  if (SCRIPTS[0]!.test.test(sample)) return 'ja';
  if (SCRIPTS[1]!.test.test(sample)) return 'ko';
  if (SCRIPTS[2]!.test.test(sample)) return 'zh';
  if (SCRIPTS[3]!.test.test(sample)) return /\u067e|\u0686|\u0698|\u06af|\u06cc/.test(sample) ? 'fa' : 'ar';
  if (SCRIPTS[4]!.test.test(sample)) return 'he';
  if (SCRIPTS[5]!.test.test(sample)) return 'el';
  if (SCRIPTS[6]!.test.test(sample)) return 'hi';
  if (SCRIPTS[7]!.test.test(sample)) return 'bn';
  if (SCRIPTS[8]!.test.test(sample)) return 'th';
  if (SCRIPTS[9]!.test.test(sample)) {
    return /[іїєґ]/i.test(sample) ? 'uk' : /[\u0402-\u045f]/.test(sample) && /[ђћџ]/i.test(sample) ? 'sr' : 'ru';
  }

  const words = sample.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  if (words.length === 0) return 'und';
  const set = new Set(words);
  let best = 'en';
  let bestScore = 0;
  for (const [code, list] of Object.entries(STOP_WORDS)) {
    let score = 0;
    for (const word of list) if (set.has(word)) score += 1;
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }
  // Two or more matches, or a single unmistakable function word.
  if (bestScore === 0) {
    if (/[ığşçİ]/.test(sample)) return 'tr';
    if (/[őű]/.test(sample)) return 'hu';
    if (/[ãõ]/.test(sample)) return 'pt';
    return /[a-z]/i.test(sample) ? 'en' : 'und';
  }
  return best;
}

/* ------------------------------------------------------------------ text --- */

export const MYMEMORY_LIMIT = 460;
export const TRANSLATION_LIMIT = 20000;

/** Sentence-aware chunks so a long message can go through a 500-byte API. */
export function chunkText(text: string, limit = MYMEMORY_LIMIT): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= limit) return [clean];

  const chunks: string[] = [];
  let rest = clean;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const at = Math.max(
      window.lastIndexOf('\n'),
      window.lastIndexOf('. '),
      window.lastIndexOf('! '),
      window.lastIndexOf('? '),
      window.lastIndexOf(', '),
      window.lastIndexOf(' '),
    );
    const cut = at > limit * 0.4 ? at + 1 : limit;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

/* ----------------------------------------------------------------- audio --- */

export const AUDIO_EXTENSIONS = [
  'mp3',
  'wav',
  'm4a',
  'aac',
  'ogg',
  'oga',
  'opus',
  'flac',
  'webm',
  'mp4',
  'mov',
  'm4v',
] as const;

export const AUDIO_ACCEPT = AUDIO_EXTENSIONS.map(extension => `.${extension}`).join(',');

export const MAX_AUDIO_BYTES = 150 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export function audioValidation(name: string, size: number): string | null {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (!(AUDIO_EXTENSIONS as readonly string[]).includes(extension)) {
    return 'Choose an audio file Kryvex can decode: MP3, WAV, M4A, AAC, OGG, Opus, FLAC, WebM or MP4.';
  }
  if (size <= 0) return 'That file is empty.';
  if (size > MAX_AUDIO_BYTES) return 'Keep audio files under 150 MB.';
  return null;
}

export function imageValidation(name: string, size: number): string | null {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (!['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(extension)) {
    return 'Choose a PNG, JPEG, WebP, BMP or GIF image.';
  }
  if (size <= 0) return 'That image is empty.';
  if (size > MAX_IMAGE_BYTES) return 'Keep images under 20 MB.';
  return null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

/** Peak buckets for the waveform strip; values are 0–1. */
export function waveformPeaks(samples: Float32Array, buckets = 96): number[] {
  if (samples.length === 0 || buckets <= 0) return [];
  const step = Math.max(1, Math.floor(samples.length / buckets));
  const peaks: number[] = [];
  let loudest = 0;
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    let peak = 0;
    const start = bucket * step;
    const end = Math.min(samples.length, start + step);
    for (let index = start; index < end; index += 1) {
      const value = Math.abs(samples[index] ?? 0);
      if (value > peak) peak = value;
    }
    peaks.push(peak);
    if (peak > loudest) loudest = peak;
  }
  if (loudest === 0) return peaks;
  return peaks.map(peak => Math.min(1, peak / loudest));
}

export function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0]!;
  const length = Math.min(...channels.map(channel => channel.length));
  const mix = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    let sum = 0;
    for (const channel of channels) sum += channel[index] ?? 0;
    mix[index] = sum / channels.length;
  }
  return mix;
}

/** Linear resampling. Speech models want 16 kHz mono, not 48 kHz stereo. */
export function resample(input: Float32Array, fromRate: number, toRate = 16000): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  if (!Number.isFinite(fromRate) || fromRate <= 0 || toRate <= 0) return input;
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(input.length - 1, left + 1);
    const fraction = position - left;
    output[index] = (input[left] ?? 0) * (1 - fraction) + (input[right] ?? 0) * fraction;
  }
  return output;
}

/** 16-bit mono PCM WAV: the one container every Whisper server accepts. */
export function encodeWav(samples: Float32Array, sampleRate = 16000): ArrayBuffer {
  const bytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, bytes, true);
  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

/* --------------------------------------------------------------- servers --- */

export const ENGINE_LABELS: Record<LexiumEngine, string> = {
  'local-whisper': 'local-whisper',
  'whisper-cpp': 'whisper.cpp server',
  openai: 'OpenAI-compatible',
};

export const WHISPER_MODELS = ['tiny', 'base', 'small', 'medium', 'turbo'] as const;

/** Strips a trailing slash and rejects anything that is not http(s). */
export function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return '';
  }
}

export function transcriptionEndpoint(engine: LexiumEngine, baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return '';
  if (engine === 'whisper-cpp') return `${base}/inference`;
  if (engine === 'openai') return base.endsWith('/v1') ? `${base}/audio/transcriptions` : `${base}/v1/audio/transcriptions`;
  return `${base}/transcribe`;
}

export function translationEndpoint(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  return base ? `${base}/translate` : '';
}

export function healthEndpoint(engine: LexiumEngine, baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return '';
  if (engine === 'local-whisper') return `${base}/health`;
  return base;
}

/* --------------------------------------------------------------- parsing --- */

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  text: string;
  language: string;
  segments: TranscriptSegment[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  const record = asRecord(value);
  if (!record) return '';
  for (const key of ['text', 'transcript', 'transcription', 'result']) {
    const next = record[key];
    if (typeof next === 'string' && next.trim()) return next.trim();
    const nested = asRecord(next);
    if (nested) {
      const inner = readText(nested);
      if (inner) return inner;
    }
  }
  const segments = record.segments;
  if (Array.isArray(segments)) {
    return segments
      .map(item => (asRecord(item)?.text as string | undefined) ?? '')
      .join(' ')
      .trim();
  }
  return '';
}

function readSeconds(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function readSegments(value: unknown): TranscriptSegment[] {
  if (!Array.isArray(value)) return [];
  const segments: TranscriptSegment[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const text = typeof record.text === 'string' ? record.text.trim() : '';
    if (!text) continue;
    const offsets = asRecord(record.offsets);
    // whisper.cpp reports milliseconds in `offsets`, everybody else seconds.
    const start = offsets ? readSeconds(offsets.from) / 1000 : readSeconds(record.start);
    const end = offsets ? readSeconds(offsets.to) / 1000 : readSeconds(record.end);
    segments.push({ start, end: end >= start ? end : start, text });
  }
  return segments;
}

/**
 * Every supported server returns a slightly different envelope. This reads the
 * transcript out of all of them and never throws on an unexpected shape.
 */
export function parseTranscription(payload: unknown): Transcript {
  if (typeof payload === 'string') {
    return { text: payload.trim(), language: '', segments: [] };
  }
  const record = asRecord(payload);
  if (!record) return { text: '', language: '', segments: [] };
  const text = readText(record);
  const segments = readSegments(record.segments ?? asRecord(record.result)?.segments);
  const language =
    typeof record.language === 'string'
      ? record.language
      : typeof asRecord(record.result)?.language === 'string'
        ? (asRecord(record.result)?.language as string)
        : typeof record.detected_language === 'string'
          ? record.detected_language
          : '';
  return { text, language: cleanLanguage(language, ''), segments };
}

export function parseLibreTranslation(payload: unknown): { text: string; detected: string } {
  const record = asRecord(payload);
  if (!record) return { text: '', detected: '' };
  const text =
    typeof record.translatedText === 'string'
      ? record.translatedText
      : typeof record.translation === 'string'
        ? record.translation
        : '';
  const detected = typeof record.detectedLanguage === 'string' ? record.detectedLanguage : '';
  return { text: text.trim(), detected: cleanLanguage(detected, '') };
}

export function parseLibreDetection(payload: unknown): string {
  if (Array.isArray(payload)) {
    const first = asRecord(payload[0]);
    if (first && typeof first.language === 'string') return cleanLanguage(first.language, '');
  }
  const record = asRecord(payload);
  if (record && typeof record.language === 'string') return cleanLanguage(record.language, '');
  return '';
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export function parseMyMemory(payload: unknown): string {
  const record = asRecord(payload);
  if (!record) return '';
  const data = asRecord(record.responseData);
  if (!data) return '';
  const text = typeof data.translatedText === 'string' ? data.translatedText : '';
  const status = Number(record.responseStatus ?? 200);
  if (status >= 400) return '';
  return decodeEntities(text).trim();
}

/* --------------------------------------------------------------- clients --- */

export type LexiumFailure = 'invalid' | 'offline' | 'http' | 'empty' | 'unsupported';

export interface TranslationSuccess {
  ok: true;
  text: string;
  source: string;
  provider: 'libre' | 'mymemory';
}
export interface TranslationFailure {
  ok: false;
  error: LexiumFailure;
  status?: number;
}

export interface TranslationRequest {
  text: string;
  source: string;
  target: string;
  /** LibreTranslate base URL; empty means go straight to the public fallback. */
  baseUrl: string;
  apiKey?: string;
  allowFallback?: boolean;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

async function postJson(
  url: string,
  body: unknown,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { ok: response.ok, status: response.status, payload };
}

async function translateWithLibre(
  request: TranslationRequest,
): Promise<TranslationSuccess | TranslationFailure> {
  const endpoint = translationEndpoint(request.baseUrl);
  if (!endpoint) return { ok: false, error: 'invalid' };
  const fetchImpl = request.fetchImpl ?? fetch;
  try {
    const body: Record<string, string> = {
      q: request.text,
      source: request.source || 'auto',
      target: request.target,
      format: 'text',
    };
    if (request.apiKey) body.api_key = request.apiKey;
    const result = await postJson(endpoint, body, request.signal, fetchImpl);
    if (!result.ok) {
      if (result.status >= 500) return { ok: false, error: 'http', status: result.status };
      return { ok: false, error: 'unsupported', status: result.status };
    }
    const parsed = parseLibreTranslation(result.payload);
    if (!parsed.text) return { ok: false, error: 'empty' };
    return { ok: true, text: parsed.text, source: parsed.detected, provider: 'libre' };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

async function translateWithMyMemory(
  request: TranslationRequest,
): Promise<TranslationSuccess | TranslationFailure> {
  const fetchImpl = request.fetchImpl ?? fetch;
  const source = cleanLanguage(request.source, '');
  // MyMemory cannot infer a language from `auto`. Send the local guess when it
  // is specific, and fall back to its `autodetect` literal only when the text
  // is ambiguous or already looks like the target: its own detector answered
  // `ha` for all-caps Turkish, so a guess is the better first choice.
  const guessed = guessLanguage(request.text);
  const unsure = guessed === 'und' || guessed === request.target;
  const from = source || (unsure ? 'autodetect' : guessed);
  const chunks = chunkText(request.text);
  if (chunks.length === 0) return { ok: false, error: 'empty' };
  const pieces: string[] = [];
  for (const chunk of chunks) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${encodeURIComponent(
      `${from}|${request.target}`,
    )}`;
    try {
      const response = await fetchImpl(url, { signal: request.signal });
      const payload: unknown = await response.json().catch(() => null);
      const text = parseMyMemory(payload);
      if (!response.ok) return { ok: false, error: 'http', status: response.status };
      if (!text) return { ok: false, error: 'empty' };
      pieces.push(text);
    } catch {
      return { ok: false, error: 'offline' };
    }
  }
  const detected = source || (unsure ? '' : guessed);
  return { ok: true, text: pieces.join(' '), source: detected, provider: 'mymemory' };
}

/**
 * Translate through the configured LibreTranslate server; if it is unreachable
 * and fallback is allowed, use the keyless MyMemory API and say so in the
 * result, so the UI can label which engine answered.
 */
export async function translateText(
  request: TranslationRequest,
): Promise<TranslationSuccess | TranslationFailure> {
  const text = (request.text ?? '').trim();
  if (!text) return { ok: false, error: 'empty' };
  if (text.length > TRANSLATION_LIMIT) return { ok: false, error: 'invalid' };
  const target = cleanLanguage(request.target, '');
  if (!target) return { ok: false, error: 'invalid' };

  const libre = await translateWithLibre({ ...request, text, target });
  if (libre.ok) return libre;
  if (request.allowFallback === false) return libre;
  if (libre.error === 'unsupported' || libre.error === 'empty') return libre;
  return translateWithMyMemory({ ...request, text, target });
}

/* ----------------------------------------------------------- transcription --- */

export interface TranscriptionRequest {
  engine: LexiumEngine;
  baseUrl: string;
  model?: string;
  language?: string;
  /** 16 kHz mono WAV produced by `encodeWav`. */
  audio: Blob;
  filename?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export async function transcribeAudio(
  request: TranscriptionRequest,
): Promise<{ ok: true; transcript: Transcript } | { ok: false; error: LexiumFailure; status?: number }> {
  const endpoint = transcriptionEndpoint(request.engine, request.baseUrl);
  if (!endpoint) return { ok: false, error: 'invalid' };
  const fetchImpl = request.fetchImpl ?? fetch;
  const form = new FormData();
  form.append('file', request.audio, request.filename ?? 'audio.wav');
  if (request.engine === 'local-whisper') {
    form.append('model', request.model || 'base');
    form.append('language', request.language || 'auto');
    form.append('task', 'transcribe');
  } else if (request.engine === 'openai') {
    form.append('model', request.model || 'whisper-1');
    if (request.language) form.append('language', request.language);
    form.append('response_format', 'verbose_json');
  } else {
    if (request.language) form.append('language', request.language);
    form.append('response_format', 'verbose_json');
  }

  let response: Response;
  try {
    response = await fetchImpl(endpoint, { method: 'POST', body: form, signal: request.signal });
  } catch {
    return { ok: false, error: 'offline' };
  }
  if (!response.ok) return { ok: false, error: 'http', status: response.status };

  let payload: unknown = null;
  const type = response.headers.get('content-type') ?? '';
  try {
    payload = type.includes('json') ? await response.json() : await response.text();
  } catch {
    return { ok: false, error: 'empty' };
  }
  const transcript = parseTranscription(payload);
  if (!transcript.text) return { ok: false, error: 'empty' };
  if (!transcript.language) {
    transcript.language = cleanLanguage(request.language, '') || guessLanguage(transcript.text);
  }
  return { ok: true, transcript };
}

/** Plain text, or subtitles when the engine returned timed segments. */
export function transcriptAsText(transcript: Transcript): string {
  return transcript.text.trim();
}

export function transcriptAsSrt(transcript: Transcript): string {
  if (transcript.segments.length === 0) {
    return `1\n00:00:00,000 --> 00:00:10,000\n${transcript.text.trim()}\n`;
  }
  return transcript.segments
    .map((segment, index) => {
      const start = srtTime(segment.start);
      const end = srtTime(segment.end);
      return `${index + 1}\n${start} --> ${end}\n${segment.text.trim()}\n`;
    })
    .join('\n');
}

/* ------------------------------------------------------------------- OCR --- */

export const OCR_LANGUAGES: Array<{ code: string; name: string }> = [
  { code: 'eng', name: 'English' },
  { code: 'tur', name: 'Turkish' },
  { code: 'deu', name: 'German' },
  { code: 'fra', name: 'French' },
  { code: 'spa', name: 'Spanish' },
  { code: 'ita', name: 'Italian' },
  { code: 'por', name: 'Portuguese' },
  { code: 'nld', name: 'Dutch' },
  { code: 'rus', name: 'Russian' },
  { code: 'ukr', name: 'Ukrainian' },
  { code: 'pol', name: 'Polish' },
  { code: 'ron', name: 'Romanian' },
  { code: 'ell', name: 'Greek' },
  { code: 'ara', name: 'Arabic' },
  { code: 'heb', name: 'Hebrew' },
  { code: 'hin', name: 'Hindi' },
  { code: 'jpn', name: 'Japanese' },
  { code: 'kor', name: 'Korean' },
  { code: 'chi_sim', name: 'Chinese (simplified)' },
  { code: 'chi_tra', name: 'Chinese (traditional)' },
  { code: 'vie', name: 'Vietnamese' },
  { code: 'tha', name: 'Thai' },
  { code: 'ind', name: 'Indonesian' },
  { code: 'swe', name: 'Swedish' },
  { code: 'dan', name: 'Danish' },
  { code: 'fin', name: 'Finnish' },
  { code: 'nor', name: 'Norwegian' },
  { code: 'ces', name: 'Czech' },
  { code: 'hun', name: 'Hungarian' },
  { code: 'bul', name: 'Bulgarian' },
  { code: 'srp', name: 'Serbian' },
  { code: 'hrv', name: 'Croatian' },
  { code: 'slk', name: 'Slovak' },
];

/** UMD build: the reader injects it as a no-credentials script tag. */
export const OCR_SCRIPT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

export function cleanOcrLanguage(value: unknown): string {
  if (typeof value !== 'string') return 'eng';
  const code = value.trim().toLowerCase();
  return OCR_LANGUAGES.some(language => language.code === code) ? code : 'eng';
}
