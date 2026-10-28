/**
 * Rules for running a model file the user already downloaded.
 *
 * Vexium speaks the OpenAI-compatible API, so a local GGUF is served by
 * llama.cpp's `llama-server`, which exposes exactly that shape on loopback.
 * Kryvex never downloads or ships weights; it locates a runtime, launches it
 * against the chosen file and points the assistant at it. Everything here is
 * pure so the paths, arguments and names can be tested without spawning.
 */

export const MAX_MODEL_PATH = 4096;
export const MAX_LOG_LINES = 40;
export const DEFAULT_CONTEXT = 4096;
export const MAX_CONTEXT = 131_072;
export const DEFAULT_GPU_LAYERS = 999;
export const START_TIMEOUT_MS = 180_000;

export const MODEL_SOURCES = {
  huggingface: 'https://huggingface.co/models?library=gguf&sort=trending',
  ollama: 'https://ollama.com/library',
  lmstudio: 'https://lmstudio.ai/models',
  runtime: 'https://github.com/ggml-org/llama.cpp/releases',
} as const;

/** A `.gguf` file, case-insensitive, with no stray control characters. */
export function isGgufPath(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const value = raw.trim();
  if (!value || value.length > MAX_MODEL_PATH) return false;
  if (/[\u0000-\u001f]/.test(value)) return false;
  return /\.gguf$/i.test(value);
}

/**
 * Some users wrap their runtime in a small Node script (a launcher that sets
 * environment or picks a build). Such a wrapper runs on Electron's own Node
 * runtime, so it never needs a second install.
 */
export function isScriptRuntime(raw: unknown): raw is string {
  return typeof raw === 'string' && /\.(cjs|mjs|js)$/i.test(raw.trim());
}

export function modelName(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath;
  return base.replace(/\.gguf$/i, '') || 'model';
}

export function clampContext(value: unknown): number {
  const size = Math.round(Number(value));
  if (!Number.isFinite(size) || size < 512) return DEFAULT_CONTEXT;
  return Math.min(size, MAX_CONTEXT);
}

export function clampGpuLayers(value: unknown): number {
  const layers = Math.round(Number(value));
  if (!Number.isFinite(layers) || layers < 0) return DEFAULT_GPU_LAYERS;
  return Math.min(layers, DEFAULT_GPU_LAYERS);
}

export interface ServerArgsInput {
  modelPath: string;
  port: number;
  ctxSize: number;
  gpuLayers: number;
}

/**
 * llama.cpp's server flags. `--host 127.0.0.1` is deliberate: this server is
 * for this machine only, never for the local network.
 */
export function buildServerArgs(input: ServerArgsInput): string[] {
  return [
    '--model',
    input.modelPath,
    '--host',
    '127.0.0.1',
    '--port',
    String(input.port),
    '--ctx-size',
    String(clampContext(input.ctxSize)),
    '--n-gpu-layers',
    String(clampGpuLayers(input.gpuLayers)),
    // The shipped model carries its operating preamble in the GGUF's own chat
    // template; without this flag llama.cpp cannot render that template and
    // silently falls back to a generic one, losing the preamble.
    '--jinja',
  ];
}

export function serverBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export interface RuntimeDir {
  dir: string;
  bundled: boolean;
}

/**
 * Where to look for a runtime, in order: a binary the user dropped into app
 * data, the copy in the installed app, and a source checkout's fetched copy.
 * The checkout is only consulted while the app is unpackaged, so a packaged
 * build can never load a binary from the working directory.
 */
export function runtimeDirs(input: {
  userDataDir: string;
  resourcesDir?: string;
  appDir?: string;
  packaged: boolean;
}): RuntimeDir[] {
  const dirs: RuntimeDir[] = [{ dir: input.userDataDir, bundled: false }];
  if (input.resourcesDir) dirs.push({ dir: input.resourcesDir, bundled: true });
  if (!input.packaged && input.appDir) {
    dirs.push({ dir: `${input.appDir.replace(/[\\/]+$/, '')}/runtime/bin`, bundled: true });
  }
  return dirs.map(entry => ({ ...entry, dir: entry.dir.replace(/[\\/]+$/, '') }));
}

/** Order matters: a user-supplied path, then app data, then the installer. */
export function binaryCandidates(platform: string, dirs: string[]): string[] {
  const names =
    platform === 'win32' ? ['llama-server.exe', 'llama-server.cmd', 'server.exe'] : ['llama-server'];
  const list: string[] = [];
  for (const dir of dirs) {
    for (const name of names) {
      list.push(`${dir.replace(/[\\/]+$/, '')}/${name}`);
    }
  }
  return list;
}

/** Keeps only the tail of the runtime log; a chatty server must not leak memory. */
export function tailLog(lines: string[], incoming: string): string[] {
  const next = [...lines];
  for (const raw of incoming.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    next.push(line.slice(0, 400));
  }
  return next.slice(-MAX_LOG_LINES);
}

export function logText(lines: string[]): string {
  return lines.slice(-12).join('\n');
}
