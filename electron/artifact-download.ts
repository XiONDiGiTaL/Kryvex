/**
 * One verified download, and nothing else.
 *
 * The model manager has its own copy of this loop because it is tied to its
 * library and its catalogue; the speech runtime needs the same guarantees for
 * two more artifacts (a release archive and a model file) without either of
 * them becoming a model. Both share the policy in `model-rules.ts`, so the
 * hosts, the redirect rule and the hash comparison have one definition.
 *
 * The transfer is streamed into `<target>.part`, re-read and hashed, and only
 * the caller may rename it into place. A cancelled, short or altered response
 * never leaves a file that looks installed.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAX_REDIRECTS,
  parseModelUrl,
  requiredFreeBytes,
  resolveRedirect,
  verifyArtifact,
} from './model-rules';

export type ArtifactFailure = 'network' | 'size' | 'hash' | 'cancelled' | 'write' | 'disk-space';

export type ArtifactResult = { ok: true; bytes: number } | { ok: false; error: ArtifactFailure };

/** Progress is reported per chunk, throttled so the renderer is not flooded. */
const PROGRESS_EVERY_MS = 160;
const PROGRESS_EVERY_BYTES = 4 * 1024 * 1024;

export async function freeBytesFor(target: string): Promise<number | null> {
  try {
    const stats = fs.statfsSync(path.dirname(target));
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
}

/**
 * Downloads `url` to `part`, then proves the bytes are the pinned ones.
 *
 * `part` is always in the directory the finished file will live in, so the
 * rename the caller performs cannot cross a volume.
 */
export async function downloadArtifact(input: {
  url: string;
  bytes: number;
  sha256: string;
  part: string;
  signal: AbortSignal;
  onProgress?: (received: number, total: number) => void;
  onVerifying?: () => void;
  /** The verify phase re-reads the file; a long one may be worth a note. */
  userAgent?: string;
}): Promise<ArtifactResult> {
  const start = parseModelUrl(input.url);
  if (!start) return { ok: false, error: 'network' };

  const free = await freeBytesFor(input.part);
  if (free !== null && free < requiredFreeBytes(input.bytes)) {
    return { ok: false, error: 'disk-space' };
  }

  try {
    await fs.promises.mkdir(path.dirname(input.part), { recursive: true });
    await fs.promises.rm(input.part, { force: true });
  } catch {
    return { ok: false, error: 'write' };
  }

  try {
    const response = await open(start.href, input.signal, input.userAgent);
    await writeBody(response, input, input.part);
  } catch (error) {
    await fs.promises.rm(input.part, { force: true }).catch(() => undefined);
    return { ok: false, error: failureOf(error, input.signal) };
  }

  input.onVerifying?.();
  let sha256: string;
  let received: number;
  try {
    sha256 = await hashFile(input.part, input.bytes, input.signal);
    received = fs.statSync(input.part).size;
  } catch (error) {
    await fs.promises.rm(input.part, { force: true }).catch(() => undefined);
    return { ok: false, error: failureOf(error, input.signal) };
  }

  const verdict = verifyArtifact({
    receivedBytes: received,
    sha256,
    expectedBytes: input.bytes,
    expectedSha256: input.sha256,
  });
  if (!verdict.ok) {
    await fs.promises.rm(input.part, { force: true }).catch(() => undefined);
    return { ok: false, error: verdict.reason };
  }
  return { ok: true, bytes: received };
}

class ArtifactError extends Error {
  constructor(public readonly code: ArtifactFailure) {
    super(code);
  }
}

function failureOf(error: unknown, signal: AbortSignal): ArtifactFailure {
  if (error instanceof ArtifactError) return error.code;
  return signal.aborted ? 'cancelled' : 'network';
}

/** One request, following only the redirects the policy allows. */
async function open(url: string, signal: AbortSignal, userAgent?: string): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const parsed = parseModelUrl(current);
    if (!parsed) throw new ArtifactError('network');
    const response = await fetch(parsed.href, {
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': userAgent ?? 'Kryvex speech runtime' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new ArtifactError('network');
      const next = resolveRedirect(current, location);
      if (!next) throw new ArtifactError('network');
      current = next;
      continue;
    }
    if (!response.ok || !response.body) throw new ArtifactError('network');
    return response;
  }
  throw new ArtifactError('network');
}

async function writeBody(
  response: Response,
  input: { bytes: number; signal: AbortSignal; onProgress?: (received: number, total: number) => void },
  part: string,
): Promise<void> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > 0 && declared !== input.bytes) {
    throw new ArtifactError('size');
  }
  const handle = await fs.promises.open(part, 'w');
  let received = 0;
  let lastEmit = 0;
  let lastBytes = 0;
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      if (input.signal.aborted) throw new ArtifactError('cancelled');
      const buffer = Buffer.from(chunk);
      received += buffer.length;
      if (received > input.bytes) throw new ArtifactError('size');
      await handle.write(buffer);
      const now = Date.now();
      if (now - lastEmit > PROGRESS_EVERY_MS || received - lastBytes > PROGRESS_EVERY_BYTES) {
        lastEmit = now;
        lastBytes = received;
        input.onProgress?.(received, input.bytes);
      }
    }
  } finally {
    await handle.close();
  }
  if (received !== input.bytes) throw new ArtifactError('size');
  input.onProgress?.(received, input.bytes);
}

/** Re-reads what actually landed; a stream hash is not trusted across a close. */
export async function hashFile(file: string, expectedBytes: number, signal: AbortSignal): Promise<string> {
  const hash = createHash('sha256');
  const stream = fs.createReadStream(file);
  let read = 0;
  for await (const chunk of stream) {
    if (signal.aborted) throw new ArtifactError('cancelled');
    read += chunk.length;
    if (read > expectedBytes) throw new ArtifactError('size');
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}
