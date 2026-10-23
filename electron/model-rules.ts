/**
 * Rules for fetching a reviewed model artifact.
 *
 * Downloading weights is a different security boundary from inference: the
 * renderer may only name a catalogue id, and every byte that reaches the disk
 * is described here: URL, host, redirect, size, hash and final path. Kryvex
 * never fetches a URL the catalogue does not pin, and never runs what it
 * downloads; the file is handed to the existing `llama-server` path only when
 * the user starts it.
 *
 * Everything in this module is pure so the policy can be tested without a
 * network or a filesystem.
 */
import path from 'node:path';

/** No reviewed starter is anywhere near this; it only bounds a bad response. */
export const MAX_MODEL_BYTES = 8 * 1024 * 1024 * 1024;
export const MAX_REDIRECTS = 3;
/** The only hosts a download may start from or redirect to. */
export const MODEL_HOSTS = ['huggingface.co'];
/**
 * Hugging Face serves artifacts from its own subdomains. The measured hop on
 * 2026-10-22 was `us.aws.cdn.hf.co`; `cdn-lfs.hf.co` is the classic one. Both
 * are covered by `.hf.co`, which cannot match an attacker's `evil-hf.co`.
 */
export const MODEL_HOST_SUFFIXES = ['.hf.co'];
export const STARTER_CONTEXT = 4096;

export interface ModelMemoryEstimate {
  /** Lower bound of the estimate, in bytes. Never a promise. */
  minBytes: number;
  maxBytes: number;
  /** The context length the estimate assumes. */
  contextTokens: number;
}

export interface CatalogueEntry {
  id: string;
  name: string;
  /** First-party product name for the bundled stack, when there is one. */
  productName?: string;
  publisher: string;
  /** `owner/name` on Hugging Face. */
  repository: string;
  /** Immutable commit, never a branch name. */
  revision: string;
  filename: string;
  bytes: number;
  sha256: string;
  licence: string;
  licenceUrl: string;
  quantisation: string;
  architecture: string;
  contextLength: number;
  languages: string[];
  /** Stable ids the UI translates; never sentences from the model card. */
  capabilities: string[];
  limitations: string[];
  memory: ModelMemoryEstimate;
  commercialUse: boolean;
}

export interface InstalledModel {
  id: string;
  name: string;
  filename: string;
  bytes: number;
  sha256: string;
  installedAt: string;
  licence: string;
  revision: string;
}

export type DownloadPhase = 'downloading' | 'verifying' | 'installed' | 'cancelled' | 'failed';

export interface DownloadProgress {
  id: string;
  phase: DownloadPhase;
  received: number;
  total: number;
  error?: string;
}

const MODEL_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const REVISION = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const ARCHITECTURE = /^[a-z][a-z0-9_]{1,31}$/;

export function isSafeModelId(value: unknown): value is string {
  return typeof value === 'string' && MODEL_ID.test(value);
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

export function isAllowedModelHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (MODEL_HOSTS.includes(host)) return true;
  return MODEL_HOST_SUFFIXES.some(suffix => host.endsWith(suffix) && host.length > suffix.length);
}

/**
 * A URL Kryvex is willing to open. HTTPS only, no credentials, no fragment,
 * and the host must be the catalogue host or a pinned CDN suffix.
 */
export function parseModelUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || !raw || raw.length > 4096) return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.hash) return null;
  if (!isAllowedModelHost(url.hostname)) return null;
  return url;
}

/** The one URL a catalogue entry can resolve to. */
export function catalogueUrl(entry: Pick<CatalogueEntry, 'repository' | 'revision' | 'filename'>): string {
  const filename = entry.filename.split('/').map(encodeURIComponent).join('/');
  return `https://huggingface.co/${entry.repository}/resolve/${entry.revision}/${filename}`;
}

/** Follows one hop, or returns null when it leaves the pinned policy. */
export function resolveRedirect(current: string, location: string): string | null {
  let next: URL;
  try {
    next = new URL(location, current);
  } catch {
    return null;
  }
  const allowed = parseModelUrl(next.href);
  return allowed ? allowed.href : null;
}

/** Every field a downloadable entry needs before it may be shown. */
export function validateCatalogueEntry(entry: unknown): string[] {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ['not-an-object'];
  const value = entry as Record<string, unknown>;
  const problems: string[] = [];
  if (!isSafeModelId(value.id)) problems.push('id');
  if (typeof value.name !== 'string' || !value.name.trim()) problems.push('name');
  if (typeof value.publisher !== 'string' || !value.publisher.trim()) problems.push('publisher');
  if (typeof value.repository !== 'string' || !REPOSITORY.test(value.repository)) problems.push('repository');
  if (typeof value.revision !== 'string' || !REVISION.test(value.revision)) problems.push('revision');
  if (typeof value.filename !== 'string' || !/^[\w.-]+\.gguf$/i.test(value.filename)) problems.push('filename');
  if (typeof value.bytes !== 'number' || !Number.isInteger(value.bytes)) problems.push('bytes');
  else if (value.bytes <= 0 || value.bytes > MAX_MODEL_BYTES) problems.push('bytes-range');
  if (!isSha256(value.sha256)) problems.push('sha256');
  if (typeof value.licence !== 'string' || !value.licence.trim()) problems.push('licence');
  if (typeof value.licenceUrl !== 'string' || !/^https:\/\//.test(value.licenceUrl)) problems.push('licence-url');
  if (typeof value.architecture !== 'string' || !ARCHITECTURE.test(value.architecture)) problems.push('architecture');
  if (typeof value.contextLength !== 'number' || value.contextLength < 512) problems.push('context');
  if (!Array.isArray(value.capabilities) || !Array.isArray(value.limitations)) problems.push('copy');
  if (!Array.isArray(value.languages) || value.languages.length === 0) problems.push('languages');
  if (typeof value.commercialUse !== 'boolean') problems.push('commercial-use');
  const memory = value.memory as Record<string, unknown> | undefined;
  if (
    !memory ||
    typeof memory.minBytes !== 'number' ||
    typeof memory.maxBytes !== 'number' ||
    typeof memory.contextTokens !== 'number' ||
    memory.minBytes <= 0 ||
    memory.maxBytes < memory.minBytes ||
    memory.contextTokens < 512
  ) {
    problems.push('memory');
  }
  if (problems.length === 0) {
    const url = parseModelUrl(catalogueUrl(value as unknown as CatalogueEntry));
    if (!url) problems.push('url');
  }
  return problems;
}

/** Deterministic on-disk name; the remote filename is never used as a path. */
export function installedFileName(id: string): string {
  return `${id}.gguf`;
}

export function modelPath(modelsDir: string, id: string): string {
  return path.join(modelsDir, installedFileName(id));
}

/** True only when `candidate` is a child of `dir` (after resolve). */
export function isPathInside(dir: string, candidate: string): boolean {
  const root = path.resolve(dir);
  const target = path.resolve(candidate);
  if (target === root) return false;
  const relative = path.relative(root, target);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export type VerifyFailure = 'size' | 'hash';

export function verifyArtifact(input: {
  receivedBytes: number;
  sha256: string;
  expectedBytes: number;
  expectedSha256: string;
}): { ok: true } | { ok: false; reason: VerifyFailure } {
  if (input.receivedBytes !== input.expectedBytes) return { ok: false, reason: 'size' };
  if (input.sha256.toLowerCase() !== input.expectedSha256.toLowerCase()) {
    return { ok: false, reason: 'hash' };
  }
  return { ok: true };
}

/** A model that is running must be stopped by its owner, never by a delete. */
export function canDeleteModel(entry: InstalledModel | undefined, runningPath: string, modelsDir: string): boolean {
  if (!entry || !isSafeModelId(entry.id)) return false;
  const file = modelPath(modelsDir, entry.id);
  if (!isPathInside(modelsDir, file)) return false;
  return path.resolve(runningPath || '') !== path.resolve(file);
}

export function downloadPercent(received: number, total: number): number {
  if (!Number.isFinite(received) || !Number.isFinite(total) || total <= 0) return 0;
  const percent = Math.floor((received / total) * 100);
  return Math.max(0, Math.min(100, percent));
}

/** How many bytes still have to be free before a download starts. */
export function requiredFreeBytes(entryBytes: number): number {
  return entryBytes + Math.min(512 * 1024 * 1024, Math.ceil(entryBytes * 0.1));
}
