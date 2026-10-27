/**
 * The local Whisper server: install it once, then start and stop it.
 *
 * This is the answer to "nothing answered at http://localhost:8000". Lexium
 * has always been a client, so a first-time user had to know that a speech
 * server exists, find a build, find a model and run a command before the first
 * transcription worked. This module does that for them, and only that: it
 * downloads the pinned build of `whisper-server` and one pinned model, checks
 * both against their SHA-256, unpacks the archive with the app's own hardened
 * reader, and runs the executable on loopback.
 *
 * Boundaries kept deliberately narrow:
 *
 * - Nothing is downloaded unless the interface asks, and only from the pinned
 *   URLs in `speech-catalogue.ts`. The renderer can name a model id and
 *   nothing else; it cannot name a URL, a host or a path.
 * - The server is bound to `127.0.0.1` on a port this module chose, so it is
 *   never reachable from the network, and the model path handed to the child
 *   is one this module composed.
 * - The child is killed on stop, on quit, and when a start fails part way, and
 *   no partial download is ever left where it could be mistaken for an
 *   installed file.
 * - Electron is not imported here. The runtime takes its root directory and a
 *   progress callback, so the whole install-and-transcribe path can be tested
 *   from a plain Node script (see `scripts/verify-speech-runtime.cjs`).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { downloadArtifact, type ArtifactFailure } from './artifact-download';
import { extractZip } from './zip-extract';
import {
  DEFAULT_SPEECH_MODEL,
  SPEECH_BUILD,
  SPEECH_MODELS,
  SPEECH_PORT,
  speechModelEntry,
} from './speech-catalogue';
import {
  buildSpeechArgs,
  installableArchiveEntry,
  isSafeSpeechModelId,
  shouldAutostart,
  speechLayout,
  speechModelPath,
  speechThreads,
  validateSpeechArtifacts,
  type SpeechLayout,
  type SpeechModelEntry,
} from './speech-runtime-rules';

export type SpeechPhase = 'idle' | 'installing' | 'stopped' | 'starting' | 'running' | 'error';

/** Stable ids: the interface turns them into words in the user's language. */
export type SpeechFailure =
  | 'platform'
  | 'invalid-artifacts'
  | 'network'
  | 'disk-space'
  | 'hash'
  | 'size'
  | 'cancelled'
  | 'write'
  | 'extract'
  | 'spawn'
  | 'timeout'
  | 'exit'
  | 'not-installed'
  | 'busy';

export interface SpeechModelRow {
  id: string;
  name: string;
  size: string;
  bytes: number;
  licence: string;
  present: boolean;
  installedAt: string;
}

export interface SpeechBinaryRow {
  tag: string;
  bytes: number;
  sha256: string;
  licence: string;
  installedAt: string;
}

export interface SpeechRuntimeStatus {
  supported: boolean;
  phase: SpeechPhase;
  /** The build is unpacked and hashed as the pinned one. */
  installed: boolean;
  binary: SpeechBinaryRow | null;
  models: SpeechModelRow[];
  /** The model that would be used, installed or not. */
  model: string;
  /** Loopback address, present while running or once a port has been used. */
  baseUrl: string;
  port: number | null;
  pid: number | null;
  startedAt: number | null;
  /** Progress of an install in flight, so a reopened panel can resume reading. */
  progress: SpeechInstallProgress | null;
  /** The user asked the engine to start with Kryvex. */
  autostart: boolean;
  /**
   * This session's engine came up from that switch, not from a button press.
   * Lexium adopts the address of an engine Kryvex started for it; one the user
   * started by hand is theirs to point at.
   */
  autostarted: boolean;
  /** The last failure, as an id, never as a sentence. */
  error?: SpeechFailure;
  /** The tail of the server's own output, for the diagnostics line. */
  log: string;
}

export interface SpeechInstallProgress {
  model: string;
  step: 'build' | 'model';
  phase: 'downloading' | 'verifying' | 'extracting' | 'installed' | 'cancelled' | 'failed';
  received: number;
  total: number;
  error?: SpeechFailure;
}

interface SpeechConfig {
  binary: SpeechBinaryRow | null;
  models: Array<{ id: string; bytes: number; sha256: string; installedAt: string }>;
  model: string;
  port: number;
  /** Start the server when Kryvex starts, and stop it when Kryvex quits. */
  autostart: boolean;
}

const START_TIMEOUT_MS = 180_000;
const HEALTH_TIMEOUT_MS = 10_000;
const STOP_GRACE_MS = 4_000;
const LOG_LINES = 40;

function emptyConfig(): SpeechConfig {
  return { binary: null, models: [], model: DEFAULT_SPEECH_MODEL, port: 0, autostart: false };
}

/** Splits a chunk into the last few lines, as the diagnostics panel shows them. */
function tailLog(lines: string[], incoming: string): string[] {
  const merged = `${lines.join('\n')}\n${incoming}`.split(/\r?\n/);
  return merged.slice(Math.max(0, merged.length - LOG_LINES));
}

function logText(lines: string[]): string {
  return lines.join('\n').trim();
}

function freePort(): Promise<number> {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', () => resolve(0));
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/** True when the port is free on loopback right now. */
function portAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

export class SpeechRuntime {
  private readonly layout: SpeechLayout;
  private config: SpeechConfig = emptyConfig();
  private child: ChildProcess | null = null;
  private port: number | null = null;
  private phase: SpeechPhase = 'idle';
  private failure: SpeechFailure | undefined;
  private log: string[] = [];
  private startedAt: number | null = null;
  private starting: Promise<SpeechRuntimeStatus> | null = null;
  private installing = false;
  private progress: SpeechInstallProgress | null = null;
  private stopping = false;
  private abort: AbortController | null = null;
  private autostarted = false;
  private artifacts: SpeechModelEntry[] = [];

  constructor(
    private readonly root: string,
    private readonly notify?: (progress: SpeechInstallProgress) => void,
  ) {
    this.layout = speechLayout(root);
  }

  init(): void {
    try {
      fs.mkdirSync(this.layout.models, { recursive: true });
    } catch {
      /* a read-only profile reports the failure when something is installed */
    }
    this.config = this.readConfig();
    // The catalogue is validated before anything can be offered: a mistyped
    // hash or a host outside the allowlist must fail here, not after a
    // download the user waited for.
    this.artifacts = validateSpeechArtifacts({ build: SPEECH_BUILD, models: SPEECH_MODELS }).length
      ? []
      : SPEECH_MODELS;
    this.sweep();
    this.phase = this.installed() ? 'stopped' : 'idle';
  }

  /** A `.part` file or a staging folder is never an install; drop the leftovers. */
  private sweep(): void {
    for (const dir of [this.layout.root, this.layout.models]) {
      try {
        for (const name of fs.readdirSync(dir)) {
          const full = path.join(dir, name);
          if (name.endsWith('.part') || name.startsWith('.unpack-')) {
            fs.rmSync(full, { recursive: true, force: true });
          }
        }
      } catch {
        /* a missing directory is created on first install */
      }
    }
  }

  private readConfig(): SpeechConfig {
    try {
      const raw = JSON.parse(fs.readFileSync(this.layout.config, 'utf8')) as Record<string, unknown>;
      const binary = raw.binary as SpeechBinaryRow | null;
      const models = Array.isArray(raw.models) ? raw.models : [];
      return {
        binary:
          binary && typeof binary === 'object' && typeof binary.tag === 'string' ? binary : null,
        models: models
          .filter((row): row is SpeechConfig['models'][number] => {
            if (!row || typeof row !== 'object') return false;
            const value = row as Record<string, unknown>;
            return (
              isSafeSpeechModelId(value.id) &&
              typeof value.bytes === 'number' &&
              typeof value.sha256 === 'string' &&
              typeof value.installedAt === 'string'
            );
          })
          .slice(0, SPEECH_MODELS.length),
        model: isSafeSpeechModelId(raw.model) ? raw.model : DEFAULT_SPEECH_MODEL,
        port: typeof raw.port === 'number' && raw.port > 0 && raw.port < 65_536 ? raw.port : 0,
        autostart: raw.autostart === true,
      };
    } catch {
      return emptyConfig();
    }
  }

  private saveConfig(): void {
    const target = this.layout.config;
    const tmp = `${target}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(this.config, null, 2), 'utf8');
      fs.renameSync(tmp, target);
    } catch {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* nothing to clean */
      }
    }
  }

  private installed(): boolean {
    return Boolean(this.config.binary && fs.existsSync(this.layout.binary));
  }

  private modelPresent(id: string): boolean {
    try {
      const stats = fs.statSync(speechModelPath(this.layout, id));
      const record = this.config.models.find(row => row.id === id);
      return Boolean(record && stats.size === record.bytes);
    } catch {
      return false;
    }
  }

  private emit(progress: SpeechInstallProgress): void {
    this.progress = progress.phase === 'installed' || progress.phase === 'failed' ? null : progress;
    try {
      this.notify?.(progress);
    } catch {
      /* the window may be closing */
    }
  }

  status(): SpeechRuntimeStatus {
    return {
      supported: this.supported(),
      phase: this.phase,
      installed: this.installed(),
      binary: this.config.binary,
      models: this.artifacts.map(entry => {
        const record = this.config.models.find(row => row.id === entry.id);
        return {
          id: entry.id,
          name: entry.name,
          size: entry.size,
          bytes: entry.bytes,
          licence: entry.licence,
          present: this.modelPresent(entry.id),
          installedAt: record?.installedAt ?? '',
        };
      }),
      model: this.config.model,
      baseUrl: this.port ? this.baseUrl(this.port) : this.config.port ? this.baseUrl(this.config.port) : '',
      port: this.port ?? (this.config.port || null),
      pid: this.child?.pid ?? null,
      startedAt: this.startedAt,
      progress: this.progress,
      autostart: this.config.autostart,
      autostarted: this.autostarted,
      // A failure is only reported while the runtime is in the failing state:
      // the last error must not follow a healthy status into the panel.
      ...(this.failure && this.phase === 'error' ? { error: this.failure } : {}),
      log: logText(this.log),
    };
  }

  private baseUrl(port: number): string {
    return `http://127.0.0.1:${port}`;
  }

  supported(): boolean {
    return process.platform === 'win32' && process.arch === 'x64';
  }

  catalogue(): SpeechModelEntry[] {
    return this.artifacts;
  }

  private fail(failure: SpeechFailure): SpeechRuntimeStatus {
    this.failure = failure;
    this.phase = 'error';
    return this.status();
  }

  /**
   * The one-click path: make sure the build and the model are here, then start
   * the server. Downloading a model is also the moment the engine becomes the
   * user's choice, so the status it returns carries the address to use.
   */
  async install(rawModel: unknown): Promise<SpeechRuntimeStatus> {
    if (!this.supported()) return this.fail('platform');
    if (this.artifacts.length === 0) return this.fail('invalid-artifacts');
    // A second press while a download is running has nothing to add: the panel
    // is already showing its progress, so it just reads the current state.
    if (this.installing) return this.status();
    const entry =
      (isSafeSpeechModelId(rawModel) ? speechModelEntry(rawModel) : undefined) ??
      speechModelEntry(DEFAULT_SPEECH_MODEL);
    if (!entry) return this.fail('invalid-artifacts');

    // Never swap the files under a running server: stop it, then install.
    await this.stop();
    this.installing = true;
    this.failure = undefined;
    this.phase = 'installing';
    this.abort = new AbortController();
    const signal = this.abort.signal;
    try {
      if (!this.installed()) {
        const failure = await this.installBinary(entry, signal);
        if (failure) return this.fail(failure);
      }
      if (!this.modelPresent(entry.id)) {
        const failure = await this.installModel(entry, signal);
        if (failure) return this.fail(failure);
      }
      this.config.model = entry.id;
      this.saveConfig();
    } finally {
      this.installing = false;
      this.abort = null;
    }
    return this.start(entry.id);
  }

  private async installBinary(
    entry: SpeechModelEntry,
    signal: AbortSignal,
  ): Promise<SpeechFailure | null> {
    const staging = path.join(this.root, `.unpack-${randomUUID()}`);
    const archive = path.join(this.root, `whisper-${SPEECH_BUILD.tag}.zip`);
    const part = `${archive}.part`;
    const progress = (phase: SpeechInstallProgress['phase'], received: number) =>
      this.emit({
        model: entry.id,
        step: 'build',
        phase,
        received,
        total: SPEECH_BUILD.bytes,
      });

    progress('downloading', 0);
    const result = await downloadArtifact({
      url: SPEECH_BUILD.url,
      bytes: SPEECH_BUILD.bytes,
      sha256: SPEECH_BUILD.sha256,
      part,
      signal,
      onProgress: received => progress('downloading', received),
      onVerifying: () => progress('verifying', SPEECH_BUILD.bytes),
    });
    if (!result.ok) {
      const failure = this.mapFailure(result.error);
      progress('failed', 0);
      return failure;
    }

    progress('extracting', SPEECH_BUILD.bytes);
    try {
      await fs.promises.rename(part, archive);
      const buffer = await fs.promises.readFile(archive);
      // Staged, then moved: the archive reader refuses to overwrite anything,
      // and a half-unpacked `bin` must never be mistaken for a working build.
      await fs.promises.rm(staging, { recursive: true, force: true });
      extractZip(buffer, staging);
      const source = path.join(staging, SPEECH_BUILD.archivePrefix.replace(/\/$/, ''));
      const names = await fs.promises.readdir(source).catch(() => [] as string[]);
      const files = names
        .map(name => ({ name, target: installableArchiveEntry(`${SPEECH_BUILD.archivePrefix}${name}`, SPEECH_BUILD.archivePrefix) }))
        .filter((row): row is { name: string; target: string } => row.target !== null);
      if (!files.some(row => row.target === SPEECH_BUILD.binary)) {
        progress('failed', 0);
        return 'extract';
      }
      await fs.promises.rm(this.layout.bin, { recursive: true, force: true });
      await fs.promises.mkdir(this.layout.bin, { recursive: true });
      for (const file of files) {
        await fs.promises.copyFile(path.join(source, file.name), path.join(this.layout.bin, file.target));
      }
      this.config.binary = {
        tag: SPEECH_BUILD.tag,
        bytes: SPEECH_BUILD.bytes,
        sha256: SPEECH_BUILD.sha256,
        licence: SPEECH_BUILD.licence,
        installedAt: new Date().toISOString(),
      };
      this.saveConfig();
      progress('installed', SPEECH_BUILD.bytes);
      return null;
    } catch {
      progress('failed', 0);
      return 'extract';
    } finally {
      await fs.promises.rm(part, { force: true }).catch(() => undefined);
      await fs.promises.rm(archive, { force: true }).catch(() => undefined);
      await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async installModel(
    entry: SpeechModelEntry,
    signal: AbortSignal,
  ): Promise<SpeechFailure | null> {
    const target = speechModelPath(this.layout, entry.id);
    const part = `${target}.part`;
    const progress = (phase: SpeechInstallProgress['phase'], received: number) =>
      this.emit({ model: entry.id, step: 'model', phase, received, total: entry.bytes });

    progress('downloading', 0);
    const result = await downloadArtifact({
      url: entry.url,
      bytes: entry.bytes,
      sha256: entry.sha256,
      part,
      signal,
      onProgress: received => progress('downloading', received),
      onVerifying: () => progress('verifying', entry.bytes),
    });
    if (!result.ok) {
      const failure = this.mapFailure(result.error);
      progress('failed', 0);
      return failure;
    }
    try {
      await fs.promises.mkdir(this.layout.models, { recursive: true });
      await fs.promises.rm(target, { force: true });
      await fs.promises.rename(part, target);
    } catch {
      progress('failed', 0);
      return 'write';
    }
    this.config.models = [
      { id: entry.id, bytes: entry.bytes, sha256: entry.sha256, installedAt: new Date().toISOString() },
      ...this.config.models.filter(row => row.id !== entry.id),
    ];
    this.saveConfig();
    progress('installed', entry.bytes);
    return null;
  }

  private mapFailure(error: ArtifactFailure): SpeechFailure {
    if (error === 'cancelled') return 'cancelled';
    return error;
  }

  /** Cancels a download in flight; the partial file is removed by its owner. */
  cancel(): boolean {
    if (!this.abort) return false;
    this.abort.abort();
    return true;
  }

  /**
   * The launch path: start the engine when the user asked for that.
   *
   * A fresh profile, a platform without the pinned build or a removed model all
   * mean the same thing here — there is nothing to start — and none of them is
   * a failure to report at startup.
   */
  async resume(): Promise<SpeechRuntimeStatus> {
    if (this.starting || this.installing) return this.status();
    const wanted = shouldAutostart({
      enabled: this.config.autostart,
      supported: this.supported(),
      installed: this.installed(),
      modelPresent: this.modelPresent(this.config.model),
    });
    if (!wanted) return this.status();
    const answer = await this.start(this.config.model);
    this.autostarted = answer.phase === 'running';
    return answer;
  }

  /**
   * Turns "start with Kryvex" on or off.
   *
   * Enabling also starts the engine now, because that is the state the next
   * launch will be in and an empty promise is worse than a working one;
   * disabling stops it, because a switch that leaves a server running says
   * something it does not mean.
   */
  async setAutostart(value: unknown): Promise<SpeechRuntimeStatus> {
    if (typeof value !== 'boolean') return this.status();
    this.config.autostart = value;
    this.saveConfig();
    if (!value) return this.stop();
    if (!this.supported() || !this.installed() || !this.modelPresent(this.config.model)) {
      return this.status();
    }
    if (this.child && this.phase === 'running') return this.status();
    return this.start(this.config.model);
  }

  async start(rawModel?: unknown): Promise<SpeechRuntimeStatus> {
    if (this.starting) return this.starting;
    this.starting = this.doStart(rawModel).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async doStart(rawModel?: unknown): Promise<SpeechRuntimeStatus> {
    if (!this.supported()) return this.fail('platform');
    if (this.installing) return this.status();
    const entry =
      (isSafeSpeechModelId(rawModel) ? speechModelEntry(rawModel) : undefined) ??
      speechModelEntry(this.config.model) ??
      speechModelEntry(DEFAULT_SPEECH_MODEL);
    if (!entry) return this.fail('invalid-artifacts');
    if (!this.installed()) return this.fail('not-installed');
    if (!this.modelPresent(entry.id)) return this.fail('not-installed');

    await this.stop();
    this.failure = undefined;
    this.log = [];
    this.stopping = false;
    this.phase = 'starting';
    this.startedAt = Date.now();

    const port = (await portAvailable(SPEECH_PORT)) ? SPEECH_PORT : await freePort();
    if (!port) return this.fail('spawn');

    const args = buildSpeechArgs({
      modelPath: speechModelPath(this.layout, entry.id),
      port,
      threads: speechThreads(os.cpus().length),
    });

    let child: ChildProcess;
    try {
      child = spawn(this.layout.binary, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: this.layout.bin,
      });
    } catch {
      return this.fail('spawn');
    }

    this.child = child;
    this.port = port;
    child.stdout?.on('data', (chunk: Buffer) => {
      this.log = tailLog(this.log, chunk.toString('utf8'));
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      this.log = tailLog(this.log, chunk.toString('utf8'));
    });
    child.on('error', () => {
      if (this.child !== child) return;
      this.child = null;
      this.port = null;
      this.fail('spawn');
    });
    child.on('exit', (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      this.port = null;
      this.startedAt = null;
      if (this.stopping) {
        this.phase = 'stopped';
        return;
      }
      this.failure = 'exit';
      this.phase = 'error';
      this.log = tailLog(
        this.log,
        `exited (${signal ?? `code ${code ?? 'unknown'}`})`,
      );
    });

    const ready = await this.waitReady(this.baseUrl(port));
    if (!ready) {
      // Captured before the cleanup: stopping clears the failure, and the
      // reason the start did not work is what the panel has to show.
      const failure = this.failure ?? 'timeout';
      await this.stop();
      return this.fail(failure);
    }

    this.failure = undefined;
    this.config.model = entry.id;
    this.config.port = port;
    this.saveConfig();
    this.phase = 'running';
    return this.status();
  }

  private async waitReady(baseUrl: string): Promise<boolean> {
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!this.child) return false;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
        const response = await fetch(`${baseUrl}/`, { signal: controller.signal });
        clearTimeout(timer);
        // The server answers its index page on `/`; anything it sends means the
        // listener is up and the model loaded.
        if (response.ok) return true;
      } catch {
        /* still loading the model */
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
  }

  async stop(): Promise<SpeechRuntimeStatus> {
    const child = this.child;
    if (!child) {
      if (this.phase === 'running' || this.phase === 'starting') this.phase = 'stopped';
      this.port = null;
      this.startedAt = null;
      if (this.phase === 'stopped') this.failure = undefined;
      return this.status();
    }
    this.stopping = true;
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
        resolve();
      }, STOP_GRACE_MS);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        child.kill();
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
    this.child = null;
    this.port = null;
    this.startedAt = null;
    this.autostarted = false;
    this.phase = this.installed() ? 'stopped' : 'idle';
    this.stopping = false;
    this.failure = undefined;
    return this.status();
  }

  /** Frees disk space. The build and the other models are untouched. */
  async remove(rawModel: unknown): Promise<SpeechRuntimeStatus> {
    if (!isSafeSpeechModelId(rawModel)) return this.status();
    const entry = speechModelEntry(rawModel);
    if (!entry) return this.status();
    // Only a model the running server has loaded is protected; a model that is
    // merely the last one used is fine to delete.
    if (this.config.model === entry.id && this.child) {
      return this.fail('busy');
    }
    try {
      await fs.promises.rm(speechModelPath(this.layout, entry.id), { force: true });
    } catch {
      return this.fail('write');
    }
    this.config.models = this.config.models.filter(row => row.id !== entry.id);
    this.saveConfig();
    this.failure = undefined;
    if (this.phase === 'error') this.phase = this.installed() ? 'stopped' : 'idle';
    return this.status();
  }

  async dispose(): Promise<void> {
    this.abort?.abort();
    await this.stop();
  }
}
