/**
 * The netplay sidecar: run the RetroArch the user already installed.
 *
 * Kryvex's link is a checkpoint channel — the host sends a save state every
 * 1.5 s — which is honest for a room and wrong for netplay: a guest that runs
 * its own core between snapshots drifts and snaps back, and a Dreamcast state
 * is too large to send at all. Real netplay means frame-synchronised input, so
 * Kryvex drives an engine that implements it.
 *
 * RetroArch does, from the command line (`-H` hosts, `-C <host>` joins), and it
 * is GPLv3 — which is exactly why this module never fetches it, bundles it or
 * repackages it. The user installs RetroArch and its cores with RetroArch's own
 * updater; Kryvex finds that copy, writes the cartridge to a temporary file and
 * starts it. Nothing here knows a URL.
 *
 * Boundaries kept narrow:
 *
 * - The renderer can ask for a status, choose a directory through a dialog the
 *   main process opens, start a host or a guest session, or stop one. It cannot
 *   pass an executable path through `start`, and the address is parsed and
 *   validated here before it becomes an argument.
 * - Only one session at a time. RetroArch keeps a single-instance lock and a
 *   second launch would silently hand its arguments to the first process.
 * - The cartridge is written under `userData/retroarch/roms`, cleared on every
 *   start, so a session leaves nothing behind but the last file it used.
 * - Electron is not imported here, so the whole path can be driven from a plain
 *   Node script and from vitest.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  RETROARCH_CORES,
  RETROARCH_LOG_LINES,
  RETROARCH_NETPLAY_PORT,
  candidateCores,
  cleanNick,
  parseJoinAddress,
  retroarchArgs,
  retroarchCoreFile,
  retroarchSearchPaths,
  safeRomName,
} from './retroarch-catalogue';

export type RetroarchPhase = 'idle' | 'starting' | 'hosting' | 'joining' | 'exited';

/** Stable ids: the panel turns them into sentences in the user's language. */
export type RetroarchFailure =
  | 'not-found'
  | 'no-core'
  | 'address'
  | 'rom'
  | 'write'
  | 'busy'
  | 'spawn';

export interface RetroarchCoreState {
  system: string;
  /** The core that would be used, or the first candidate if none is present. */
  core: string;
  file: string;
  present: boolean;
}

export interface RetroarchSession {
  role: 'host' | 'join';
  system: string;
  /** What the host tells the other player; null while hosting without one. */
  address: string | null;
}

export interface RetroarchStatus {
  /** Windows only: the flags and the core layout below are its. */
  supported: boolean;
  found: boolean;
  /** Directory RetroArch lives in, for the panel's own line. */
  directory: string | null;
  executable: string | null;
  cores: RetroarchCoreState[];
  defaultPort: number;
  /**
   * This machine's address on the local network, with the port: what a host
   * reads out to the other player. Deliberately the LAN address and not a
   * public one — Kryvex does not ask a router what it looks like from outside.
   */
  localAddress: string | null;
  phase: RetroarchPhase;
  session: RetroarchSession | null;
  /** The last lines RetroArch printed, newest last. Never contains a secret. */
  log: string[];
  error?: RetroarchFailure;
  /** Which core files were missing, so the panel can name them. */
  missing?: string[];
}

export interface RetroarchStartInput {
  role: 'host' | 'join';
  system: string;
  /** Only for a guest. A host's own address is read from the OS instead. */
  address?: unknown;
  nick?: unknown;
  rom?: { name?: unknown; extension?: unknown; bytes?: unknown };
}

interface InstallRecord {
  executable?: string;
}

/** The first IPv4 address this machine has that is not loopback. */
export function localAddress(): string | null {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      return `${entry.address}:${RETROARCH_NETPLAY_PORT}`;
    }
  }
  return null;
}

/**
 * Whatever the renderer sent, as the shape `start` accepts.
 *
 * The payload crosses a process boundary, so every field is re-derived here
 * rather than trusted: an unknown role becomes a host, an unknown system becomes
 * an empty one (which `start` refuses for want of a core), and the cartridge is
 * accepted only as bytes.
 */
export function normalizeRetroarchStart(input: unknown): RetroarchStartInput {
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const rom = record.rom && typeof record.rom === 'object' ? (record.rom as Record<string, unknown>) : {};
  return {
    role: record.role === 'join' ? 'join' : 'host',
    system: typeof record.system === 'string' ? record.system : '',
    address: record.address,
    nick: record.nick,
    rom: {
      name: rom.name,
      extension: rom.extension,
      bytes: rom.bytes instanceof Uint8Array ? rom.bytes : undefined,
    },
  };
}

export class RetroArchSidecar {
  private executable: string | null = null;
  private phase: RetroarchPhase = 'idle';
  private session: RetroarchSession | null = null;
  private log: string[] = [];
  private error: RetroarchFailure | undefined;
  private missing: string[] | undefined;
  private child: ChildProcess | null = null;

  constructor(private readonly root: string) {
    this.executable = this.loadChosen();
  }

  status(): RetroarchStatus {
    const supported = process.platform === 'win32';
    const executable = this.executable && fs.existsSync(this.executable) ? this.executable : null;
    const directory = executable ? path.dirname(executable) : null;
    const cores = directory ? this.readCores(directory) : this.readCores(null);
    return {
      supported,
      found: Boolean(executable),
      directory,
      executable,
      cores,
      defaultPort: RETROARCH_NETPLAY_PORT,
      localAddress: localAddress(),
      phase: this.phase,
      session: this.session,
      log: [...this.log],
      error: this.error,
      missing: this.missing,
    };
  }

  /**
   * Remember the copy the user pointed at.
   *
   * A file is accepted only if it is called `retroarch.exe` and exists: this is
   * the one place a path from the dialog becomes trusted, and a wrong pick
   * should be a sentence, not a process that launches something else.
   */
  useExecutable(file: unknown): RetroarchStatus {
    if (typeof file !== 'string' || !file.trim()) {
      this.error = 'not-found';
      return this.status();
    }
    const resolved = path.resolve(file.trim());
    if (path.basename(resolved).toLowerCase() !== 'retroarch.exe' || !fs.existsSync(resolved)) {
      this.error = 'not-found';
      return this.status();
    }
    this.executable = resolved;
    this.error = undefined;
    this.missing = undefined;
    this.persist({ executable: resolved });
    return this.status();
  }

  /** Forget the remembered copy; the next status falls back to the search. */
  forget(): RetroarchStatus {
    this.executable = null;
    this.error = undefined;
    this.missing = undefined;
    this.persist({});
    this.executable = this.loadChosen();
    return this.status();
  }

  async start(input: RetroarchStartInput): Promise<RetroarchStatus> {
    if (this.child) {
      this.error = 'busy';
      return this.status();
    }
    this.log = [];
    this.missing = undefined;
    this.error = undefined;

    const executable = this.executable && fs.existsSync(this.executable) ? this.executable : null;
    if (!executable) {
      this.error = 'not-found';
      this.phase = 'idle';
      this.session = null;
      return this.status();
    }
    const directory = path.dirname(executable);
    const cores = this.readCores(directory);
    const wanted = cores.find(core => core.system === input.system);
    if (!wanted || !wanted.present) {
      this.error = 'no-core';
      this.missing = candidateCores(input.system).map(retroarchCoreFile);
      this.phase = 'idle';
      this.session = null;
      return this.status();
    }

    const rom = input.rom;
    const bytes = rom?.bytes;
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
      this.error = 'rom';
      return this.status();
    }
    const extension = typeof rom?.extension === 'string' ? rom.extension : '';
    const name = safeRomName(rom?.name, extension);
    let romPath: string;
    try {
      const romDir = path.join(this.root, 'roms');
      await fs.promises.rm(romDir, { recursive: true, force: true });
      await fs.promises.mkdir(romDir, { recursive: true });
      romPath = path.join(romDir, name);
      await fs.promises.writeFile(romPath, bytes);
    } catch {
      this.error = 'write';
      return this.status();
    }

    let address: string | null = null;
    if (input.role === 'join') {
      const parsed = parseJoinAddress(input.address);
      if (!parsed) {
        this.error = 'address';
        return this.status();
      }
      address = parsed.host;
    }

    const args = retroarchArgs({
      corePath: path.join(directory, 'cores', wanted.file),
      romPath,
      role: input.role,
      host: address ?? undefined,
      port: RETROARCH_NETPLAY_PORT,
      nick: cleanNick(input.nick),
    });

    this.phase = 'starting';
    this.session = { role: input.role, system: input.system, address: input.role === 'host' ? null : address };
    try {
      const child = spawn(executable, args, {
        cwd: directory,
        windowsHide: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child = child;
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => this.appendLog(chunk));
      child.stderr?.on('data', (chunk: string) => this.appendLog(chunk));
      child.on('error', () => {
        this.error = 'spawn';
        this.phase = 'exited';
        this.child = null;
      });
      child.on('exit', () => {
        if (this.child === child) this.child = null;
        this.phase = 'exited';
        this.session = null;
      });
      // The window opening is the only confirmation available: RetroArch does
      // not print a machine-readable "session up" line, so the panel says
      // "running" and lets the two players see each other's nicknames.
      this.phase = input.role === 'host' ? 'hosting' : 'joining';
      return this.status();
    } catch {
      this.child = null;
      this.phase = 'idle';
      this.session = null;
      this.error = 'spawn';
      return this.status();
    }
  }

  /** Stops the session Kryvex started. A RetroArch the user opened is left alone. */
  stop(): RetroarchStatus {
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null) {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }
    this.phase = 'idle';
    this.session = null;
    this.error = undefined;
    return this.status();
  }

  /** Called on quit: no RetroArch may outlive the app that started it. */
  dispose(): void {
    if (!this.child) return;
    try {
      this.child.kill();
    } catch {
      /* already gone */
    }
    this.child = null;
    this.phase = 'idle';
    this.session = null;
  }

  private readCores(directory: string | null): RetroarchCoreState[] {
    return Object.keys(RETROARCH_CORES).map(system => {
      const candidates = candidateCores(system);
      const present = directory
        ? candidates.find(core => fs.existsSync(path.join(directory, 'cores', retroarchCoreFile(core))))
        : undefined;
      const core = present ?? candidates[0] ?? '';
      return { system, core, file: retroarchCoreFile(core), present: Boolean(present) };
    });
  }

  private appendLog(chunk: string): void {
    const lines = chunk
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
    if (lines.length === 0) return;
    this.log = [...this.log, ...lines].slice(-RETROARCH_LOG_LINES);
  }

  private loadChosen(): string | null {
    try {
      const raw = fs.readFileSync(path.join(this.root, 'install.json'), 'utf8');
      const record = JSON.parse(raw) as InstallRecord;
      const file = record.executable;
      if (typeof file === 'string' && fs.existsSync(file)) return file;
    } catch {
      /* nothing remembered, or unreadable: fall through to the search */
    }
    for (const candidate of retroarchSearchPaths(process.env)) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  private persist(record: InstallRecord): void {
    try {
      fs.mkdirSync(this.root, { recursive: true });
      fs.writeFileSync(path.join(this.root, 'install.json'), JSON.stringify(record), 'utf8');
    } catch {
      /* a profile without a writable home still works for this session */
    }
  }
}

