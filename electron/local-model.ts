import { app, type BrowserWindow, dialog } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {
  DEFAULT_CONTEXT,
  DEFAULT_GPU_LAYERS,
  MAX_MODEL_PATH,
  START_TIMEOUT_MS,
  binaryCandidates,
  buildServerArgs,
  clampContext,
  clampGpuLayers,
  isGgufPath,
  isScriptRuntime,
  logText,
  modelName,
  serverBaseUrl,
  tailLog,
} from './local-model-rules';
import type { LocalModelStatus } from './types';

/**
 * Runs a GGUF file the user already has.
 *
 * The runtime is llama.cpp's `llama-server`, which exposes the same
 * OpenAI-compatible `/v1` surface Vexium already speaks. Kryvex does not ship
 * or download weights; it starts the server on loopback with the chosen file,
 * watches it until `/v1/models` answers, and stops it on quit. Everything about
 * the model stays on this machine.
 */
interface LocalModelConfig {
  path: string;
  binary: string;
  ctxSize: number;
  gpuLayers: number;
}

const DEFAULT_CONFIG: LocalModelConfig = {
  path: '',
  binary: '',
  ctxSize: DEFAULT_CONTEXT,
  gpuLayers: DEFAULT_GPU_LAYERS,
};

const STOP_GRACE_MS = 4_000;
const HEALTH_TIMEOUT_MS = 2_000;

function configPath(): string {
  return path.join(app.getPath('userData'), 'kryvex-local-model.json');
}

function readConfig(): LocalModelConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8')) as Partial<LocalModelConfig>;
    return {
      path: typeof raw.path === 'string' && raw.path.length <= MAX_MODEL_PATH ? raw.path : '',
      binary: typeof raw.binary === 'string' && raw.binary.length <= MAX_MODEL_PATH ? raw.binary : '',
      ctxSize: clampContext(raw.ctxSize),
      gpuLayers: clampGpuLayers(raw.gpuLayers),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(config: LocalModelConfig): void {
  const target = configPath();
  const tmp = `${target}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(config), 'utf8');
    fs.renameSync(tmp, target);
  } catch {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Asks the OS for a free loopback port, then gives it straight back. */
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

class LocalModel {
  private config: LocalModelConfig = { ...DEFAULT_CONFIG };
  private child: ChildProcess | null = null;
  private port: number | null = null;
  private phase: LocalModelStatus['phase'] = 'idle';
  private error: string | undefined;
  private log: string[] = [];
  private startedAt: number | null = null;
  private starting: Promise<LocalModelStatus> | null = null;
  private stopping = false;

  init(): void {
    this.config = readConfig();
    this.phase = this.config.path ? 'stopped' : 'idle';
  }

  status(): LocalModelStatus {
    const binary = this.binaryPath();
    return {
      phase: this.phase,
      path: this.config.path,
      name: this.config.path ? modelName(this.config.path) : '',
      baseUrl: this.port ? serverBaseUrl(this.port) : '',
      port: this.port,
      binary,
      binaryFound: Boolean(binary && fs.existsSync(binary)),
      pid: this.child?.pid ?? null,
      startedAt: this.startedAt,
      ctxSize: this.config.ctxSize,
      gpuLayers: this.config.gpuLayers,
      log: logText(this.log),
      ...(this.error ? { error: this.error } : {}),
    };
  }

  /** The runtime the app would launch: the user's choice, then bundled, then PATH. */
  private binaryPath(): string {
    if (this.config.binary && fs.existsSync(this.config.binary)) return this.config.binary;
    const dirs = [path.join(app.getPath('userData'), 'bin')];
    try {
      dirs.push(path.join(process.resourcesPath, 'bin'));
    } catch {
      /* development runs have no resources path */
    }
    for (const candidate of binaryCandidates(process.platform, dirs)) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  }

  /** Keeps the path, context or GPU choice the user last set. */
  configure(raw: unknown): LocalModelStatus {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return this.status();
    const input = raw as Record<string, unknown>;
    if (typeof input.path === 'string') {
      const value = input.path.trim();
      if (!value) this.config.path = '';
      else if (isGgufPath(value)) this.config.path = value;
    }
    if (typeof input.binary === 'string') {
      const value = input.binary.trim();
      if (value.length <= MAX_MODEL_PATH && !/[\u0000-\u001f]/.test(value)) this.config.binary = value;
    }
    if (input.ctxSize !== undefined) this.config.ctxSize = clampContext(input.ctxSize);
    if (input.gpuLayers !== undefined) this.config.gpuLayers = clampGpuLayers(input.gpuLayers);
    writeConfig(this.config);
    if (this.phase === 'idle' && this.config.path) this.phase = 'stopped';
    return this.status();
  }

  /** Opens a file picker; only a real `.gguf` path is ever stored. */
  async chooseModel(win: BrowserWindow | null): Promise<LocalModelStatus> {
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a model file',
      properties: ['openFile'],
      filters: [
        { name: 'GGUF models', extensions: ['gguf'] },
        { name: 'All files', extensions: ['*'] },
      ],
    };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const file = picked.canceled ? undefined : picked.filePaths[0];
    if (!file) return this.status();
    if (!isGgufPath(file)) {
      this.error = 'That file is not a .gguf model. Download a GGUF build of the model first.';
      return this.status();
    }
    await this.stop();
    this.error = undefined;
    this.config.path = file;
    writeConfig(this.config);
    this.phase = 'stopped';
    return this.status();
  }

  async chooseBinary(win: BrowserWindow | null): Promise<LocalModelStatus> {
    const options: Electron.OpenDialogOptions = {
      title: 'Choose the llama.cpp server executable',
      properties: ['openFile'],
      filters:
        process.platform === 'win32'
          ? [
              { name: 'Programs', extensions: ['exe', 'cmd', 'bat', 'js', 'mjs', 'cjs'] },
              { name: 'All files', extensions: ['*'] },
            ]
          : [{ name: 'All files', extensions: ['*'] }],
    };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const file = picked.canceled ? undefined : picked.filePaths[0];
    if (!file) return this.status();
    this.config.binary = file;
    writeConfig(this.config);
    return this.status();
  }

  async start(): Promise<LocalModelStatus> {
    if (this.starting) return this.starting;
    this.starting = this.doStart().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async doStart(): Promise<LocalModelStatus> {
    if (!isGgufPath(this.config.path)) {
      this.phase = 'error';
      this.error = 'Choose a .gguf model file first.';
      return this.status();
    }
    if (!fs.existsSync(this.config.path)) {
      this.phase = 'error';
      this.error = 'That model file is no longer on disk. Choose it again.';
      return this.status();
    }
    await this.stop();
    this.error = undefined;
    this.log = [];
    this.stopping = false;
    this.phase = 'starting';
    this.startedAt = Date.now();

    const port = await freePort();
    if (!port) {
      this.phase = 'error';
      this.error = 'No free loopback port was available.';
      return this.status();
    }
    const binary = this.binaryPath();
    const args = buildServerArgs({
      modelPath: this.config.path,
      port,
      ctxSize: this.config.ctxSize,
      gpuLayers: this.config.gpuLayers,
    });

    // A script runtime runs on the Node embedded in Electron, so a wrapper
    // needs no second install. A compiled server is spawned directly.
    const script = isScriptRuntime(binary);
    const command = script ? process.execPath : binary;
    const commandArgs = script ? [binary, ...args] : args;

    let child: ChildProcess;
    try {
      child = spawn(command, commandArgs, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: path.dirname(binary),
        env: script ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env,
      });
    } catch (error) {
      this.phase = 'error';
      this.error = `The runtime could not be started: ${
        error instanceof Error ? error.message : String(error)
      }`;
      return this.status();
    }

    this.child = child;
    this.port = port;
    child.stdout?.on('data', (chunk: Buffer) => {
      this.log = tailLog(this.log, chunk.toString('utf8'));
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      this.log = tailLog(this.log, chunk.toString('utf8'));
    });
    child.on('error', (error: Error) => {
      if (this.child !== child) return;
      this.phase = 'error';
      this.error =
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'llama-server was not found. Install llama.cpp or point Kryvex at its executable.'
          : `The runtime failed: ${error.message}`;
      this.child = null;
      this.port = null;
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
      this.phase = 'error';
      this.error = `The runtime exited (${signal ?? `code ${code ?? 'unknown'}`}). ${logText(
        this.log,
      )
        .split('\n')
        .slice(-2)
        .join(' ')}`;
    });

    const ready = await this.waitReady(serverBaseUrl(port));
    if (!ready) {
      this.phase = 'error';
      this.error = this.error ?? 'The runtime did not answer on loopback in time.';
      await this.stop();
      if (!this.error?.startsWith('llama-server')) {
        this.error = `The runtime did not answer within ${Math.round(
          START_TIMEOUT_MS / 1000,
        )}s. Check that the file is a full GGUF model.`;
      }
      this.phase = 'error';
      return this.status();
    }

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
        const response = await fetch(`${baseUrl}/v1/models`, { signal: controller.signal });
        clearTimeout(timer);
        if (response.ok) return true;
      } catch {
        /* the server is still loading the model */
      }
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    return false;
  }

  async stop(): Promise<LocalModelStatus> {
    const child = this.child;
    if (!child) {
      if (this.phase === 'running' || this.phase === 'starting') this.phase = 'stopped';
      this.port = null;
      this.startedAt = null;
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
    this.phase = this.config.path ? 'stopped' : 'idle';
    this.stopping = false;
    return this.status();
  }

  async dispose(): Promise<void> {
    await this.stop();
  }
}

export const localModel = new LocalModel();
