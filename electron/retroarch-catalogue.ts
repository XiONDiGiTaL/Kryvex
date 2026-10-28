/**
 * The netplay sidecar: which cores RetroArch needs, and how to launch it.
 *
 * Kryvex's own link is checkpoint-based — the host hands the guest a save state
 * every 1.5 s — and that is the right shape for a room that already carries a
 * file channel, but it is not netplay: a guest that runs its own core between
 * snapshots drifts and snaps back, and a Dreamcast state is far too large to
 * send at all. Real netplay needs frame-synchronised input, which means an
 * engine that already implements it.
 *
 * RetroArch does, and it drives it from the command line: `-H` hosts and waits
 * for a player, `-C <host>` joins one. This module is the part of that Kryvex
 * owns — the console-to-core table, the plausible install locations, the
 * argument list and the address parser. It contains no RetroArch code and no
 * licence gymnastics: **Kryvex never downloads or ships RetroArch**. The user
 * installs it and its cores through RetroArch's own updater, and Kryvex runs
 * what is already on the machine. That is why this sidecar has no downloader,
 * no hash pin and no catalogue of URLs — the one place where a bundled GPLv3
 * frontend would have cost the whole distribution its licence.
 *
 * Everything here is pure so it can be tested without RetroArch installed.
 */

/** RetroArch's documented netplay port, used when the address omits one. */
export const RETROARCH_NETPLAY_PORT = 55435;

/** A nickname is cosmetic, but it is also the other player's only label. */
export const RETROARCH_NICK_MAX = 24;

/** Kept last, so a long session's log does not grow without bound. */
export const RETROARCH_LOG_LINES = 12;

/**
 * Console → the cores that can run it, best first.
 *
 * These are RetroArch's own core names, so `<name>_libretro.dll` is what its
 * Online Updater writes into `cores/`. The list is deliberately conservative:
 * each entry is a core that exists for every system Kryvex offers and that its
 * own updater installs, so the panel can say exactly which file is missing
 * instead of "netplay is unavailable".
 */
export const RETROARCH_CORES: Readonly<Record<string, ReadonlyArray<string>>> = {
  nes: ['fceumm', 'mesen', 'nestopia'],
  snes: ['snes9x', 'bsnes', 'mesen-s'],
  gb: ['gambatte', 'sameboy', 'mgba'],
  gba: ['mgba', 'vba_next'],
  sms: ['genesis_plus_gx', 'gearsystem', 'smsplus'],
  gg: ['genesis_plus_gx', 'gearsystem'],
  genesis: ['genesis_plus_gx', 'picodrive'],
  sega32x: ['picodrive'],
  sg1000: ['genesis_plus_gx', 'gearsystem'],
  ws: ['mednafen_wswan'],
  wsc: ['mednafen_wswan'],
  atari2600: ['stella', 'stella2014'],
  atari7800: ['prosystem'],
  lynx: ['handy', 'mednafen_lynx'],
  pce: ['mednafen_pce', 'mednafen_pce_fast'],
  sgx: ['mednafen_pce', 'mednafen_pce_fast'],
  ngp: ['mednafen_ngp', 'race'],
  ngpc: ['mednafen_ngp', 'race'],
  vb: ['beetle_vb', 'mednafen_vb'],
  n64: ['mupen64plus_next', 'parallel_n64'],
  psx: ['mednafen_psx_hw', 'mednafen_psx', 'pcsx_rearmed'],
  dreamcast: ['flycast'],
};

/** The `.dll` RetroArch loads for a core, on the only platform this ships for. */
export function retroarchCoreFile(core: string): string {
  return `${core}_libretro.dll`;
}

/** The cores worth looking for on this machine, without duplicates. */
export function candidateCores(system: string): string[] {
  const found = RETROARCH_CORES[system];
  return found ? [...found] : [];
}

/**
 * Where RetroArch usually lands on Windows.
 *
 * A portable copy can live anywhere, so this list is a shortcut and not the
 * only answer: the panel also accepts a path the user browses to, and the
 * chosen directory is remembered. Nothing here is authoritative.
 */
export function retroarchSearchPaths(env: NodeJS.ProcessEnv): string[] {
  const programFiles = env.ProgramFiles ?? 'C:\\Program Files';
  const programFilesX86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const localAppData = env.LOCALAPPDATA ?? '';
  const steamRoots = [
    `${programFilesX86}\\Steam\\steamapps\\common\\RetroArch`,
    `${programFiles}\\Steam\\steamapps\\common\\RetroArch`,
  ];
  const roots = [
    `${programFiles}\\RetroArch-Win64`,
    `${programFiles}\\RetroArch`,
    `${programFilesX86}\\RetroArch-Win64`,
    `${programFilesX86}\\RetroArch`,
    'C:\\RetroArch-Win64',
    'C:\\RetroArch',
    ...(localAppData ? [`${localAppData}\\RetroArch`, `${localAppData}\\Programs\\RetroArch`] : []),
    ...steamRoots,
  ];
  return roots.map(root => `${root}\\retroarch.exe`);
}

/** A nickname the other side can read: printable, trimmed, never empty. */
export function cleanNick(raw: unknown, fallback = 'Kryvex'): string {
  const text = typeof raw === 'string' ? raw : '';
  const printable = text.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const clipped = printable.slice(0, RETROARCH_NICK_MAX).trim();
  return clipped.length > 0 ? clipped : fallback;
}

/**
 * The argument list, host or guest.
 *
 * `-L` is always the full path to the core, because RetroArch's own search
 * order depends on how it was installed, and `-H`/`-C` are the documented
 * netplay actions. The content path is last and unquoted: `spawn` with an
 * argument array does the quoting, and a hand-quoted string would break on a
 * path with a space.
 */
export function retroarchArgs(input: {
  corePath: string;
  romPath: string;
  role: 'host' | 'join';
  host?: string;
  port?: number;
  nick?: string;
  /** Where RetroArch should write its own log. See the note in `retroarch.ts`. */
  logPath?: string;
  /**
   * Kryvex's own copy of the configuration, so a session never writes back into
   * the one the user owns. See `prepareConfig` in `retroarch.ts`.
   */
  configPath?: string;
}): string[] {
  const port = input.port && input.port > 0 ? Math.floor(input.port) : RETROARCH_NETPLAY_PORT;
  const args: string[] = [];
  if (input.configPath) args.push('-c', input.configPath);
  args.push('-L', input.corePath);
  if (input.role === 'host') {
    args.push('-H');
  } else {
    args.push('-C', input.host ?? '');
  }
  args.push('--port', String(port), '--nick', cleanNick(input.nick));
  // Without this pair, a GUI-subsystem RetroArch writes its log nowhere a parent
  // can read: pipes and file handles both came back empty, and `--log-file` on
  // its own still writes nothing — measured on 1.22.2. `--log-file` plus `-v`
  // produces the file. One argument keeps the path's spaces safe.
  if (input.logPath) args.push('-v', `--log-file=${input.logPath}`);
  args.push(input.romPath);
  return args;
}

export interface RetroarchAddress {
  host: string;
  port: number;
  /** What the host should tell the other player to type. */
  shown: string;
}

/**
 * A join address, as a person types it: `10.0.0.4`, `10.0.0.4:55435`, or a
 * hostname. Schemes, paths and spaces are refused rather than guessed at — a
 * typo should be a sentence in the panel, not a process that exits silently.
 */
export function parseJoinAddress(raw: unknown): RetroarchAddress | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text.length === 0 || text.length > 253) return null;
  if (/[\s/\\]/.test(text) || text.includes('://')) return null;

  // A port is only a port where a colon is unambiguous. `fe80::1` has colons
  // in the address itself, so a bare IPv6 literal keeps them and takes the
  // default port; a bracketed one (`[fe80::1]:55435`) says where the port is.
  let host = text;
  let port = RETROARCH_NETPLAY_PORT;
  const bracketed = /^\[([^\]]+)\]((?::\d{1,5})?)$/.exec(text);
  if (bracketed) {
    host = bracketed[1]!;
    if (bracketed[2]) port = Number(bracketed[2].slice(1));
  } else {
    const colons = text.split(':').length - 1;
    if (colons === 1) {
      const [head, tail] = text.split(':');
      host = head ?? '';
      if (tail && /^\d{1,5}$/.test(tail)) port = Number(tail);
      else if (tail) return null;
    } else if (colons > 1) {
      // No port can be told apart from the address, so none is accepted.
      host = text;
    }
  }
  if (port < 1 || port > 65535) return null;

  const bare = host;
  if (!/^[0-9a-zA-Z.:\-_]+$/.test(bare)) return null;
  if (bare.length === 0 || bare.startsWith('.') || bare.endsWith('.')) return null;
  // `:55435` is a port with no host, and `::` adds nothing to dial.
  if (!/[0-9a-zA-Z]/.test(bare)) return null;
  // Ports are always shown, because "it worked from my phone" is not a port.
  return { host: bare, port, shown: `${bare}:${port}` };
}

/** A file name RetroArch can open, derived from the cartridge's own name. */
export function safeRomName(name: unknown, extension: string): string {
  const raw = typeof name === 'string' ? name : '';
  // Only the last segment of a path is a name: a cartridge called `../../x`
  // must not become a file outside the directory Kryvex just cleared.
  const stripped = raw.split(/[/\\]/).filter(part => part.length > 0).pop() ?? '';
  const stem = stripped
    .replace(/[:*?"<>|]/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 96);
  const ext = extension.replace(/[^0-9a-zA-Z]/g, '').slice(0, 8) || 'rom';
  const clean = stem.length > 0 ? stem : 'game';
  // The extension is added here and never trusted from the incoming name: the
  // core is chosen from the system, so the file must carry the system's own.
  const withoutExt = clean.replace(/\.[0-9a-zA-Z]{1,8}$/, '');
  return `${withoutExt}.${ext}`;
}
