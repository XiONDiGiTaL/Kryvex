import type { LexiumEngine } from '../types';
import { parseTranscription, type LexiumFailure, type Transcript } from './lexium';

/**
 * Transcription through the main process.
 *
 * A browser renderer can only call the user's Whisper server if that server
 * sends CORS headers; a `file://` shell presents `Origin: null`, which many
 * local servers reject. The main process has no origin and no preflight, so the
 * upload works there even when the same request fails from the page. This is the
 * path the desktop app takes; the web build keeps the direct fetch.
 */

export interface BridgeRequest {
  engine: LexiumEngine;
  baseUrl: string;
  model?: string;
  language?: string;
  audio: Blob;
  filename?: string;
}

export interface BridgeOutcome {
  ok: boolean;
  transcript?: Transcript;
  error?: LexiumFailure;
  status?: number;
  detail?: string;
  /**
   * The in-box engine's own judgement of its answer. A server does not report
   * one, so the field is absent there and the interface stays quiet.
   */
  verdict?: 'ok' | 'uncertain' | 'empty';
}

/** Base64 in slices: `String.fromCharCode(...bytes)` overflows the stack. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export async function transcribeWithBridge(
  bridge: NonNullable<Window['kryvex']>,
  request: BridgeRequest,
): Promise<BridgeOutcome> {
  let audio: string;
  try {
    audio = await blobToBase64(request.audio);
  } catch {
    return { ok: false, error: 'invalid' };
  }
  let answer: Awaited<ReturnType<NonNullable<Window['kryvex']>['lexiumTranscribe']>>;
  try {
    answer = await bridge.lexiumTranscribe({
      engine: request.engine,
      baseUrl: request.baseUrl,
      model: request.model ?? '',
      language: request.language ?? '',
      filename: request.filename ?? 'audio.wav',
      audio,
    });
  } catch {
    return { ok: false, error: 'offline' };
  }
  if (!answer || typeof answer !== 'object') return { ok: false, error: 'offline' };
  const result = answer as {
    ok?: boolean;
    error?: LexiumFailure;
    status?: number;
    detail?: string;
    payload?: unknown;
  };
  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? 'http',
      status: result.status,
      detail: result.detail,
    };
  }
  const transcript = parseTranscription(result.payload);
  if (!transcript.text) return { ok: false, error: 'empty' };

  // The in-box engine answers with its own culture and verdict; use them so a
  // transcript from this PC is labelled with the language that was actually
  // recognised, and one the engine was unsure of is not presented as settled.
  const meta = result.payload && typeof result.payload === 'object'
    ? (result.payload as { verdict?: unknown; language?: unknown })
    : null;
  if (!transcript.language && typeof meta?.language === 'string' && meta.language) {
    transcript.language = meta.language;
  }
  const verdict = meta?.verdict === 'uncertain' ? 'uncertain' : 'ok';
  return { ok: true, transcript, verdict };
}
