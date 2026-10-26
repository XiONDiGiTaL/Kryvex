import {
  MAX_AUDIO_BYTES,
  isLexiumEngine,
  isLocalSpeechEngine,
  lexiumEndpoint,
  lexiumFields,
  lexiumFilename,
  lexiumHealthEndpoint,
  type LexiumEngine,
} from './lexium-rules';
import { speechProbe, speechTranscribe } from './lexium-speech';
import type { LexiumProxyResult } from './types';

/**
 * Transcription and health checks for the local Whisper server, performed in
 * the main process.
 *
 * A renderer loaded from `file://` presents `Origin: null`; a server without a
 * CORS policy rejects that preflight, and the failure looks identical to "the
 * server is not running". Electron's main-process fetch has no origin and no
 * preflight, so it can talk to `http://localhost:8000` directly.
 *
 * Only the configured address is contacted. The audio never leaves the machine
 * unless the user has pointed the address at a remote host themselves.
 */

const TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 6_000;

function decodeAudio(value: unknown): Buffer | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  // A base64 body is ~4/3 the byte size; the cap keeps a wrong value from
  // allocating a gigabyte before it is rejected.
  if (value.length > (MAX_AUDIO_BYTES * 4) / 3 + 1024) return null;
  try {
    return Buffer.from(value, 'base64');
  } catch {
    return null;
  }
}

export async function transcribe(
  request: unknown,
): Promise<LexiumProxyResult> {
  const payload = (request ?? {}) as Record<string, unknown>;
  const engine = payload.engine;
  if (!isLexiumEngine(engine)) {
    return { ok: false, error: 'invalid' };
  }
  const bytes = decodeAudio(payload.audio);
  if (!bytes || bytes.length === 0) return { ok: false, error: 'invalid' };

  // The engine this machine already has needs no address and no upload: the
  // recogniser is run here, on the file the renderer produced.
  if (isLocalSpeechEngine(engine)) {
    const answer = await speechTranscribe(bytes, String(payload.language ?? ''));
    if (!answer.ok) {
      return {
        ok: false,
        error: answer.reason === 'unsupported' ? 'unsupported' : 'offline',
        detail: answer.reason ?? 'unknown',
      };
    }
    return { ok: true, status: 200, payload: { text: answer.text } };
  }

  const endpoint = lexiumEndpoint(engine, String(payload.baseUrl ?? ''));
  if (!endpoint) return { ok: false, error: 'invalid' };

  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }),
    lexiumFilename(payload.filename),
  );
  for (const [key, value] of Object.entries(
    lexiumFields(
      engine as LexiumEngine,
      String(payload.model ?? ''),
      String(payload.language ?? ''),
    ),
  )) {
    form.append(key, value);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // A name resolution or connection failure is offline; a timeout is too.
    const name = (error as { name?: string } | null)?.name;
    return { ok: false, error: name === 'TimeoutError' ? 'http' : 'offline' };
  }

  const text = await response.text().catch(() => '');
  let payloadJson: unknown = null;
  try {
    payloadJson = text ? JSON.parse(text) : null;
  } catch {
    payloadJson = text ? text.slice(0, 200_000) : null;
  }
  if (!response.ok) {
    // Keep the server's own words when it sent any: "model not found" is far
    // more useful than a bare 400.
    return {
      ok: false,
      error: 'http',
      status: response.status,
      detail: typeof payloadJson === 'string' ? payloadJson.slice(0, 300) : '',
    };
  }
  return { ok: true, status: response.status, payload: payloadJson };
}

export async function probe(request: unknown): Promise<LexiumProxyResult> {
  const payload = (request ?? {}) as Record<string, unknown>;
  const engine = payload.engine;
  if (!isLexiumEngine(engine)) return { ok: false, error: 'invalid' };
  if (isLocalSpeechEngine(engine)) {
    const answer = await speechProbe();
    // The reason is what the interface turns into words: "no recogniser" and
    // "this build cannot run one" are different problems with different fixes.
    return answer.ok
      ? { ok: true, status: 200, detail: (answer.cultures ?? []).join(', ') }
      : { ok: false, error: 'offline', detail: answer.reason ?? 'unknown' };
  }
  const endpoint = lexiumHealthEndpoint(engine, String(payload.baseUrl ?? ''));
  if (!endpoint) return { ok: false, error: 'invalid' };
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, error: 'offline' };
  }
}
