/**
 * Rules for the local speech server Kryvex can install and run.
 *
 * `whisper-server` is a program the app starts on this machine, so everything
 * that decides what may be downloaded, where it may be written, and how it is
 * launched is kept here instead of inside the process manager. Each function
 * below is pure: the policy can be tested without a network, a disk or a child
 * process.
 *
 * The download host policy is not duplicated. `parseModelUrl` in
 * `model-rules.ts` already pins the hosts Kryvex will open for an artifact
 * (GitHub and Hugging Face, HTTPS only), and a build or model added here is
 * checked against it by `validateSpeechArtifacts`.
 */
import path from 'node:path';
import { isSha256, parseModelUrl } from './model-rules';

/** No reviewed speech model is close to this; it only bounds a bad response. */
export const MAX_SPEECH_BYTES = 8 * 1024 * 1024 * 1024;

/** A model the panel may offer. Every field is measured, never guessed. */
export interface SpeechModelEntry {
  /** Stable id, also the settings value and the on-disk name. */
  id: string;
  /** Display name; the interface never translates these. */
  name: string;
  size: 'tiny' | 'base' | 'small';
  /** The upstream file name, kept as provenance. Never used as a path. */
  filename: string;
  url: string;
  bytes: number;
  sha256: string;
  /**
   * True for the multilingual conversion. A `*.en` file would answer a
   * foreign recording in English, which is the failure this feature exists to
   * avoid, so an entry that is not multilingual is refused.
   */
  multilingual: boolean;
  licence: string;
  licenceUrl: string;
}

export interface SpeechLayout {
  root: string;
  bin: string;
  models: string;
  config: string;
  binary: string;
}

export function speechLayout(root: string): SpeechLayout {
  const bin = path.join(root, 'bin');
  const models = path.join(root, 'models');
  return {
    root,
    bin,
    models,
    config: path.join(root, 'kryvex-speech.json'),
    binary: path.join(bin, 'whisper-server.exe'),
  };
}

export function speechModelPath(layout: SpeechLayout, id: string): string {
  return path.join(layout.models, `${id}.bin`);
}

const MODEL_ID = /^[a-z0-9][a-z0-9._-]{1,31}$/;

export function isSafeSpeechModelId(value: unknown): value is string {
  return typeof value === 'string' && MODEL_ID.test(value);
}

/** A filename the file system will accept and the panel can show. */
const SPEECH_FILE = /^[\w.-]{1,96}\.bin$/i;

/**
 * Every field a downloadable model needs before it may be shown or fetched.
 * Returns the list of problems, empty when the entry is sound.
 */
export function validateSpeechModel(entry: unknown): string[] {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ['not-an-object'];
  const value = entry as Record<string, unknown>;
  const problems: string[] = [];
  if (!isSafeSpeechModelId(value.id)) problems.push('id');
  if (typeof value.name !== 'string' || !value.name.trim()) problems.push('name');
  if (!['tiny', 'base', 'small'].includes(String(value.size))) problems.push('size');
  if (typeof value.filename !== 'string' || !SPEECH_FILE.test(value.filename)) problems.push('filename');
  if (typeof value.bytes !== 'number' || !Number.isInteger(value.bytes)) problems.push('bytes');
  else if (value.bytes <= 0 || value.bytes > MAX_SPEECH_BYTES) problems.push('bytes-range');
  if (!isSha256(value.sha256)) problems.push('sha256');
  if (value.multilingual !== true) problems.push('multilingual');
  if (typeof value.licence !== 'string' || !value.licence.trim()) problems.push('licence');
  if (typeof value.licenceUrl !== 'string' || !/^https:\/\//.test(value.licenceUrl)) {
    problems.push('licence-url');
  }
  // The pinned URL must be one `parseModelUrl` would open: HTTPS, no
  // credentials, no fragment, and a host on the artifact allowlist.
  const url = typeof value.url === 'string' ? parseModelUrl(value.url) : null;
  if (!url) problems.push('url');
  else if (value.filename && !url.pathname.endsWith(`/${String(value.filename)}`)) {
    problems.push('url');
  }
  return problems;
}

export interface SpeechBuildEntry {
  tag: string;
  url: string;
  bytes: number;
  sha256: string;
  binary: string;
  archivePrefix: string;
  licence: string;
  licenceUrl: string;
}

export function validateSpeechBuild(entry: unknown): string[] {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ['not-an-object'];
  const value = entry as Record<string, unknown>;
  const problems: string[] = [];
  if (typeof value.tag !== 'string' || !/^b\d+$/.test(value.tag)) problems.push('tag');
  if (typeof value.bytes !== 'number' || !Number.isInteger(value.bytes) || value.bytes <= 0) {
    problems.push('bytes');
  }
  if (!isSha256(value.sha256)) problems.push('sha256');
  if (typeof value.binary !== 'string' || !/^[\w.-]+\.exe$/i.test(value.binary)) {
    problems.push('binary');
  }
  if (typeof value.archivePrefix !== 'string' || !/^[A-Za-z0-9._-]+\/$/.test(value.archivePrefix)) {
    problems.push('archive-prefix');
  }
  if (typeof value.licence !== 'string' || !value.licence.trim()) problems.push('licence');
  if (typeof value.licenceUrl !== 'string' || !/^https:\/\//.test(value.licenceUrl)) {
    problems.push('licence-url');
  }
  const url = typeof value.url === 'string' ? parseModelUrl(value.url) : null;
  if (!url) problems.push('url');
  else if (value.tag && !url.pathname.endsWith(`/${String(value.tag)}/${path.posix.basename(url.pathname)}`)) {
    problems.push('url');
  }
  return problems;
}

/** What is wrong with the reviewed artifacts, if anything. Never empty in a
 *  shipped build: the runtime refuses to install while this reports a problem. */
export function validateSpeechArtifacts(input: {
  build: unknown;
  models: unknown[];
}): string[] {
  const problems = validateSpeechBuild(input.build).map(problem => `build:${problem}`);
  if (!Array.isArray(input.models) || input.models.length === 0) return [...problems, 'models'];
  for (const model of input.models) {
    const id = model && typeof model === 'object' ? String((model as { id?: unknown }).id) : '?';
    problems.push(...validateSpeechModel(model).map(problem => `${id}:${problem}`));
  }
  return problems;
}

/**
 * The name an archive entry is installed under, or null when it is not one of
 * the files the server needs.
 *
 * The archive is upstream's own layout (`Release/whisper-server.exe` beside
 * its DLLs), and it is flattened into one folder, which is where a Windows
 * executable looks for its libraries. Anything outside `Release/`, anything
 * nested deeper, and anything that is not an executable or a library is
 * skipped rather than written somewhere else.
 */
export function installableArchiveEntry(entryPath: string, prefix: string): string | null {
  if (typeof entryPath !== 'string' || !entryPath.startsWith(prefix)) return null;
  const rest = entryPath.slice(prefix.length);
  if (!rest || rest.includes('/') || rest.includes('\\')) return null;
  if (!/\.(exe|dll)$/i.test(rest)) return null;
  if (rest === '.' || rest === '..' || rest.length > 96) return null;
  if (/[\u0000-\u001f\u007f]/.test(rest)) return null;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(rest)) return null;
  return rest;
}

/** Half the cores, clamped: past a few threads a small model stops gaining. */
export function speechThreads(cpus: number): number {
  if (!Number.isFinite(cpus) || cpus < 1) return 2;
  return Math.max(1, Math.min(8, Math.floor(cpus / 2) || 1));
}

/**
 * The server's own arguments. The address is loopback and the port is chosen
 * by the runtime, so the engine is never reachable from the network, and the
 * model path is the only value that comes from disk.
 */
export function buildSpeechArgs(input: {
  modelPath: string;
  port: number;
  threads: number;
}): string[] {
  return [
    '--model',
    input.modelPath,
    '--host',
    '127.0.0.1',
    '--port',
    String(input.port),
    '--threads',
    String(input.threads),
  ];
}

export function speechPercent(received: number, total: number): number {
  if (!Number.isFinite(received) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((received / total) * 100)));
}
