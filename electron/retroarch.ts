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

/**
 * The address this machine should read out to the other player.
 *
 * The first non-loopback IPv4 is not good enough on a desktop: a VPN, a
 * Hyper-V switch, a Docker bridge or a VirtualBox host-only adapter all answer
 * first on some machines, and the host then tells a friend an address that
 * cannot be reached from the next room. Addresses a machine gives itself when
 * nothing else worked (`169.254.*`) are never useful, and a private LAN address
 * is what a local netplay partner needs, so those are preferred in order.
 */
export function localAddress(): string | null {
  const interfaces = os.networkInterfaces();
  const candidates: string[] = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (entry.address.startsWith('169.254.')) continue;
      candidates.push(entry.address);
    }
  }
  const rank = (address: string): number => {
    if (address.startsWith('192.168.')) return 0;
    if (address.startsWith('10.')) return 1;
    const match = /^172\.(\d+)\./.exec(address);
    if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return 2;
    return 3;
  };
  candidates.sort((left, right) => rank(left) - rank(right));
  const first = candidates[0];
  return first ? `${first}:${RETROARCH_NETPLAY_PORT}` : null;
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
  /**
   * Where RetroArch's own log is written, through its `--log-file` switch.
   *
   * Not a pipe, deliberately. RetroArch is a GUI-subsystem program on Windows:
   * given pipes — and even given a file handle — it writes nothing at all,
   * which left the panel's log empty on every real install while the fake
   * executable in the harness happily wrote to one. Its own `--log-file` is the
   * only channel that actually carries the lines, and those lines are where a
   * netplay session says it started.
   */
  private logPath: string;
  private error: RetroarchFailure | undefined;
  private missing: string[] | undefined;
  private child: ChildProcess | null = null;

  constructor(private readonly root: string) {
    this.logPath = path.join(root, 'session.log');
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
      log: this.readLog(),
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
    this.resetLog();
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
    let shown: string | null = null;
    // The guest dials the port it was given, not always the default: a host on
    // `10.0.0.4:55535` is a normal setup, and sending the guest to 55435 because
    // that is RetroArch's default turned a typed address into a silent timeout.
    // `-C` takes the host alone, so the port travels in `--port` and the session
    // keeps the full `host:port` for the panel to show.
    let port = RETROARCH_NETPLAY_PORT;
    if (input.role === 'join') {
      const parsed = parseJoinAddress(input.address);
      if (!parsed) {
        this.error = 'address';
        return this.status();
      }
      address = parsed.host;
      shown = parsed.shown;
      port = parsed.port;
    }

    let configPath: string | null = null;
    try {
      configPath = this.prepareConfig(directory, input.role);
    } catch {
      configPath = null;
    }

    const args = retroarchArgs({
      corePath: path.join(directory, 'cores', wanted.file),
      romPath,
      role: input.role,
      host: address ?? undefined,
      port,
      nick: cleanNick(input.nick),
      logPath: this.logPath,
      configPath: configPath ?? undefined,
    });

    this.phase = 'starting';
    this.session = { role: input.role, system: input.system, address: input.role === 'host' ? null : shown };
    try {
      const child = spawn(executable, args, {
        cwd: directory,
        windowsHide: false,
        // The log travels through `--log-file`; these pipes carry nothing, so
        // they are not left open.
        stdio: 'ignore',
      });
      this.child = child;
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

  /**
   * A fresh copy of the user's configuration for this session.
   *
   * RetroArch writes the configuration it ran with when a session ends, so a
   * session Kryvex starts used to leave its netplay state in the user's own
   * `retroarch.cfg` — and the *next* session then refused to join, which is how
   * this was found: a second launch on the same install never connected. Kryvex
   * therefore runs on its own copy, rewritten from the user's each time, with
   * `config_save_on_exit` off so nothing is written back. Video, audio and pad
   * settings still come from the copy, so the session looks like the user's.
   */
  private prepareConfig(directory: string, role: 'host' | 'join'): string {
    const target = path.join(this.root, 'retroarch.cfg');
    const sources = [
      path.join(directory, 'retroarch.cfg'),
      path.join(process.env.APPDATA ?? '', 'RetroArch', 'retroarch.cfg'),
    ].filter(candidate => candidate.length > 0 && fs.existsSync(candidate));
    let text = '';
    for (const source of sources) {
      try {
        text = fs.readFileSync(source, 'utf8');
        break;
      } catch {
        /* an unreadable config is the same as none */
      }
    }
    // The netplay settings of whatever session ran last are exactly what made a
    // second launch fail to join, so none of them are carried over: Kryvex sets
    // its own below and passes the port and nickname on the command line. Public
    // announce stays off because a room's session is private by design — the
    // public lobby would list a game nobody outside the room can join.
    const stripped = text
      .replace(/^\s*config_save_on_exit\s*=.*$/gm, '')
      .replace(/^\s*netplay_[A-Za-z0-9_]*\s*=.*$/gm, '');
    fs.mkdirSync(this.root, { recursive: true });
    // Only the host maps a port through the router. A guest that tries as well
    // blocked for the whole handshake on this machine once a host had mapped
    // the same port — measured: the guest sat in netplay with no connection and
    // no error until the session was killed.
    const traversal = role === 'host' ? 'true' : 'false';
    // Netplay redirects saves into a `.netplay` folder inside the install; a
    // session Kryvex starts has no business writing into the user's RetroArch
    // directory, and a leftover from the last session is state the next one
    // inherits. Both directories live under Kryvex's own root instead.
    const saves = path.join(this.root, 'saves').split(path.sep).join('/');
    const states = path.join(this.root, 'states').split(path.sep).join('/');
    fs.mkdirSync(saves, { recursive: true });
    fs.mkdirSync(states, { recursive: true });
    fs.writeFileSync(
      target,
      `${stripped}\nconfig_save_on_exit = "false"\nnetplay_public_announce = "false"\nnetplay_nat_traversal = "${traversal}"\nsavefile_directory = "${saves}/"\nsavestate_directory = "${states}/"\n`,
      'utf8',
    );
    return target;
  }

  /**
   * The tail of RetroArch's own output, plus the netplay lines it pushed out.
   *
   * The log has to be verbose to exist at all, and a verbose RetroArch fills a
   * dozen lines with playlist bookkeeping right after it starts a session. The
   * one line a person opens this panel for is `[Netplay] … has joined as player
   * 2`, so the last two of those are kept in front of the tail rather than
   * being evicted by it.
   */
  private readLog(): string[] {
    try {
      const all = fs
        .readFileSync(this.logPath, 'utf8')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
      const netplay = all.filter(line => /\[Netplay\]/i.test(line)).slice(-2);
      const tail = all.slice(-Math.max(1, RETROARCH_LOG_LINES - netplay.length));
      return [...netplay, ...tail];
    } catch {
      return [];
    }
  }

  private resetLog(): void {
    try {
      fs.mkdirSync(this.root, { recursive: true });
      fs.writeFileSync(this.logPath, '', 'utf8');
    } catch {
      /* a profile that cannot be written still runs a session */
    }
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

