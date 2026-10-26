/**
 * Rules for the transcription proxy.
 *
 * The renderer cannot always reach a local Whisper server: a `file://` shell
 * sends `Origin: null`, and a server that does not answer a CORS preflight makes
 * the browser reject the request before it is sent, which reads as "the server
 * cannot be reached" while the server is running fine. The main process has no
 * such restriction, so it performs the upload instead.
 *
 * This module is pure so the endpoint shapes and the field names can be tested
 * without Electron.
 */

/**
 * `windows-speech` is not an address: it is the recogniser Windows already
 * ships, run by the main process. It has no endpoint to build, which is why the
 * two functions below return an empty string for it.
 */
export type LexiumEngine = 'windows-speech' | 'local-whisper' | 'whisper-cpp' | 'openai';

const ENGINES: LexiumEngine[] = ['windows-speech', 'local-whisper', 'whisper-cpp', 'openai'];

export function isLocalSpeechEngine(engine: LexiumEngine): boolean {
  return engine === 'windows-speech';
}

export function isLexiumEngine(value: unknown): value is LexiumEngine {
  return typeof value === 'string' && (ENGINES as string[]).includes(value);
}

/** Strips a trailing slash and rejects anything that is not http(s). */
export function lexiumBaseUrl(value: unknown): string {
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

export function lexiumEndpoint(engine: LexiumEngine, baseUrl: string): string {
  if (isLocalSpeechEngine(engine)) return '';
  const base = lexiumBaseUrl(baseUrl);
  if (!base) return '';
  if (engine === 'whisper-cpp') return `${base}/inference`;
  if (engine === 'openai') {
    return base.endsWith('/v1') ? `${base}/audio/transcriptions` : `${base}/v1/audio/transcriptions`;
  }
  return `${base}/transcribe`;
}

export function lexiumHealthEndpoint(engine: LexiumEngine, baseUrl: string): string {
  if (isLocalSpeechEngine(engine)) return '';
  const base = lexiumBaseUrl(baseUrl);
  if (!base) return '';
  return engine === 'local-whisper' ? `${base}/health` : base;
}

/**
 * The multipart fields each server expects. The audio part is added by the
 * caller because it carries the bytes.
 */
export function lexiumFields(
  engine: LexiumEngine,
  model: string,
  language: string,
): Record<string, string> {
  if (engine === 'local-whisper') {
    return {
      model: model || 'base',
      language: language || 'auto',
      task: 'transcribe',
    };
  }
  if (engine === 'openai') {
    return {
      model: model || 'whisper-1',
      ...(language ? { language } : {}),
      response_format: 'verbose_json',
    };
  }
  return {
    ...(language ? { language } : {}),
    response_format: 'verbose_json',
  };
}

/** A filename the form can carry without breaking the header quoting rules. */
export function lexiumFilename(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  const clean = raw.replace(/[^\w.\-]+/g, '_').slice(-80);
  return clean && /\.[a-z0-9]{2,5}$/i.test(clean) ? clean : 'audio.wav';
}

export const MAX_AUDIO_BYTES = 160 * 1024 * 1024;
