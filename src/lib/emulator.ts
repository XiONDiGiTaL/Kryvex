import type { EmulatorSystem } from '../types';

/** Which engine host runs a system. */
export type EmulatorEngine = 'emulatorjs' | 'flycast';

/**
 * The engine a system runs on, and whether it needs the optional release.
 *
 * The cartridge engine is the one that ships: its cores are fetched by the
 * user's browser from its own CDN. The second engine is a pinned WebAssembly
 * build the main process downloads on request; while it is switched off, its
 * systems are not offered at all, so the default install behaves as it always
 * has. See `src/lib/flycast.ts` and docs/EMULATOR_ENGINES.md.
 */

/** Options for the helpers below: which engines the interface has enabled. */
export interface EngineOptions {
  /** The second engine is installed and switched on. */
  flycast?: boolean;
}

export interface RomSystemDef {
  id: EmulatorSystem;
  label: string;
  /** EmulatorJS core name. */
  core: string;
  /** Defaults to the cartridge engine. */
  engine?: EmulatorEngine;
  extensions: string[];
  /** Shown when a core is experimental or not a perfect match. */
  note?: string;
  /**
   * A disc system, measured against `MAX_DISC_BYTES` rather than the cartridge
   * cap: a CD image is an order of magnitude larger than any cartridge and the
   * slot has to accept one before the core can open it.
   */
  disc?: boolean;
}

/**
 * EmulatorJS core names, not console marketing names. Two systems can share a
 * core (Game Boy / Color, WonderSwan / Color, Neo Geo Pocket / Color), and a
 * few Sega formats ride on the Master System or PC Engine cores.
 */
export const ROM_SYSTEMS: ReadonlyArray<RomSystemDef> = [
  { id: 'nes', label: 'NES', core: 'nes', extensions: ['nes'] },
  { id: 'snes', label: 'SNES', core: 'snes', extensions: ['smc', 'sfc'] },
  { id: 'gb', label: 'Game Boy / Color', core: 'gb', extensions: ['gb', 'gbc'] },
  { id: 'gba', label: 'Game Boy Advance', core: 'gba', extensions: ['gba'] },
  { id: 'sms', label: 'Master System', core: 'segaMS', extensions: ['sms'] },
  { id: 'gg', label: 'Game Gear', core: 'segaGG', extensions: ['gg'] },
  {
    id: 'genesis',
    label: 'Genesis / Mega Drive',
    core: 'segaMD',
    extensions: ['md', 'gen', 'smd'],
  },
  { id: 'sega32x', label: 'Sega 32X', core: 'sega32x', extensions: ['32x'] },
  {
    id: 'sg1000',
    label: 'SG-1000',
    core: 'segaMS',
    extensions: ['sg'],
    note: 'Experimental: runs on the Master System core.',
  },
  { id: 'ws', label: 'WonderSwan', core: 'ws', extensions: ['ws', 'pc2'] },
  { id: 'wsc', label: 'WonderSwan Color', core: 'ws', extensions: ['wsc', 'pc2'] },
  { id: 'atari2600', label: 'Atari 2600', core: 'atari2600', extensions: ['a26'] },
  { id: 'atari7800', label: 'Atari 7800', core: 'atari7800', extensions: ['a78'] },
  { id: 'lynx', label: 'Atari Lynx', core: 'lynx', extensions: ['lnx', 'lyx', 'o'] },
  { id: 'pce', label: 'PC Engine / TurboGrafx-16', core: 'pce', extensions: ['pce'] },
  {
    id: 'sgx',
    label: 'SuperGrafx',
    core: 'pce',
    extensions: ['sgx', 'pce'],
    note: 'Uses the PC Engine core; SuperGrafx compatibility varies by game.',
  },
  { id: 'ngp', label: 'Neo Geo Pocket', core: 'ngp', extensions: ['ngp'] },
  { id: 'ngpc', label: 'Neo Geo Pocket Color', core: 'ngp', extensions: ['ngc', 'ngp'] },
  { id: 'vb', label: 'Virtual Boy', core: 'vb', extensions: ['vb', 'vboy'] },
  {
    id: 'n64',
    label: 'Nintendo 64',
    // EmulatorJS maps `n64` to mupen64plus_next (parallel_n64 is the fallback).
    // A .n64, a .v64 and a .z64 are the same dump with a different byte order,
    // and the core reads all three, so the extension never has to be guessed.
    core: 'n64',
    extensions: ['n64', 'v64', 'z64'],
    note: 'The N64 core takes a few seconds longer to start and needs more memory than the 8-bit cores.',
  },
  {
    id: 'dreamcast',
    label: 'Dreamcast',
    // The cartridge engine publishes no Dreamcast core, so this system rides on
    // the pinned Flycast build and only appears while that engine is switched
    // on. The core's own registry lists cdi/gdi/chd/cue/iso/elf/bin/lst/zip/7z;
    // the slot takes the self-contained ones plus a zipped set, because a bare
    // .gdi or .cue is a manifest and carries no picture data.
    core: 'flycast',
    engine: 'flycast',
    extensions: ['cdi', 'chd', 'iso', 'zip'],
    disc: true,
    note: 'Experimental: a second engine, downloaded separately. One file per slot: use a .cdi or .chd, or a .zip of a full set. The Dreamcast BIOS is required.',
  },
  {
    id: 'psx',
    label: 'PlayStation',
    // EmulatorJS maps `psx` to pcsx_rearmed or mednafen_psx_hw; both accept the
    // same containers. A `.cue` and the `.bin` beside it are offered as well:
    // the panel merges the pair into one image before the core sees it (see
    // `src/lib/psx-disc.ts`), because the slot hands the core a single file and
    // a raw sector dump cannot be opened on its own.
    core: 'psx',
    extensions: ['chd', 'pbp', 'iso', 'img', 'cue', 'bin'],
    disc: true,
    note: 'Most titles need a PlayStation BIOS. A .cue and its .bin work together: pick both files and Kryvex joins them into one disc image.',
  },
];

export const ROM_EXTENSIONS = Array.from(
  new Set(ROM_SYSTEMS.flatMap(system => system.extensions)),
).sort();

export const ROM_ACCEPT = ROM_EXTENSIONS.map(extension => `.${extension}`).join(',');

/** The systems an install offers: the optional engine's are hidden until on. */
export function offeredSystems(options?: EngineOptions): RomSystemDef[] {
  return ROM_SYSTEMS.filter(system => system.engine !== 'flycast' || options?.flycast === true);
}

/** The file picker's accept list, narrowed to the engines in use. */
export function romAccept(options?: EngineOptions): string {
  return Array.from(new Set(offeredSystems(options).flatMap(system => system.extensions)))
    .sort()
    .map(extension => `.${extension}`)
    .join(',');
}

export function engineFor(system: EmulatorSystem): EmulatorEngine {
  return ROM_SYSTEMS.find(item => item.id === system)?.engine ?? 'emulatorjs';
}
export const MAX_ROM_BYTES = 64 * 1024 * 1024;
/**
 * A disc image, not a cartridge: a CD holds 700 MB and a `.chd` or `.pbp` is
 * smaller than the set it was built from, so this leaves room for either.
 */
export const MAX_DISC_BYTES = 768 * 1024 * 1024;

export function isEmulatorSystem(value: unknown): value is EmulatorSystem {
  return typeof value === 'string' && ROM_SYSTEMS.some(system => system.id === value);
}

/**
 * Formats that only ever carry a disc.
 *
 * Nothing here can be a cartridge, so the cartridge cap never applies to one:
 * that rule is what turned a 600 MB PlayStation image into "larger than 64 MB",
 * because a `.bin` used to resolve to the Sega systems alone.
 */
const DISC_EXTENSIONS = new Set(['chd', 'pbp', 'iso', 'img', 'cue', 'cdi', 'gdi']);

/** `.bin` and `.rom` are shared by several Sega/Atari systems. */
const SHARED_EXTENSIONS: Record<string, EmulatorSystem[]> = {
  // A `.bin` is either a Sega/Atari cartridge or the raw track of a CD. Which
  // one it is follows from its size, not its name: `systemsForFile` asks for
  // the byte count before it answers.
  bin: ['genesis', 'sega32x', 'sms', 'gg', 'sg1000', 'atari2600', 'atari7800', 'psx'],
  // Both consoles ship a `.iso` core; with the second engine off only the
  // PlayStation candidate is left, so the file resolves without a prompt.
  iso: ['psx', 'dreamcast'],
  img: ['psx'],
  cue: ['psx'],
  rom: ['sms', 'gg', 'sg1000', 'atari2600'],
  ws: ['ws', 'wsc'],
  pc2: ['ws', 'wsc'],
  ngp: ['ngp', 'ngpc'],
  pce: ['pce', 'sgx'],
};

export function extensionOf(name: string): string {
  return name.toLowerCase().split('.').pop() ?? '';
}

/**
 * Every system whose core can open this file. A shared extension returns more
 * than one candidate; the emulator asks which console before starting a core.
 *
 * `.chd` is one of those: it is a PlayStation image and a Dreamcast one, so
 * once the second engine is on the chooser asks which console the file belongs
 * to instead of guessing from four letters.
 */
export function systemsForFile(
  name: string,
  options?: EngineOptions,
  bytes?: number,
): EmulatorSystem[] {
  const extension = extensionOf(name);
  const disc = DISC_EXTENSIONS.has(extension);
  const known = typeof bytes === 'number' && bytes > 0;
  const oversized = known && bytes! > MAX_ROM_BYTES;
  const offered = offeredSystems(options);
  // A file too large for a cartridge can only be a disc, so the cartridge
  // systems drop out of the list before it becomes a question. Without a size
  // every candidate stays, and the panel asks which console the file belongs
  // to instead of guessing. This only disambiguates a *shared* extension: an
  // oversized `.nes` is still an NES file, and `romValidation` says it is too
  // large rather than pretending the format is unknown.
  const shared = SHARED_EXTENSIONS[extension];
  const keep = (system: EmulatorSystem): boolean => !oversized || isDiscSystem(system);
  const candidates = shared ?? offered
    .filter(system => system.extensions.includes(extension))
    .map(system => system.id);
  const offeredIds = new Set(offered.map(system => system.id));
  const resolved = candidates.filter(system => offeredIds.has(system));
  // A disc-only format never answers with the cartridge systems that happen to
  // share its name; a size that fits a cartridge never answers with the disc.
  if (disc) return resolved.filter(isDiscSystem).filter(keep);
  if (shared) {
    // A shared format with a known size is one or the other: a 1 KB `.bin` is
    // not a CD track, and a 600 MB one is not a cartridge. Only an unknown
    // size leaves both in the list and makes the panel ask.
    if (!known) return resolved;
    return resolved.filter(system => isDiscSystem(system) === oversized);
  }
  return resolved;
}

/**
 * A unique extension gives one definite system; shared formats give null.
 *
 * A size settles a shared format on its own: a `.bin` far too large for a
 * cartridge is a PlayStation track, and nothing has to be asked.
 */
export function detectRomSystem(
  name: string,
  options?: EngineOptions,
  bytes?: number,
): EmulatorSystem | null {
  const systems = systemsForFile(name, options, bytes);
  return systems.length === 1 ? systems[0]! : null;
}

export function coreFor(system: EmulatorSystem): string {
  return ROM_SYSTEMS.find(item => item.id === system)?.core ?? 'nes';
}

export function isDiscSystem(system: EmulatorSystem): boolean {
  return ROM_SYSTEMS.find(item => item.id === system)?.disc === true;
}

export function romValidation(name: string, bytes: number, options?: EngineOptions): string | null {
  const systems = systemsForFile(name, options, bytes);
  if (systems.length === 0) {
    return 'That file is not a supported ROM. Use one of the cartridge formats listed beside the slot.';
  }
  if (bytes <= 0) return 'That ROM is empty.';
  if (systems.some(isDiscSystem)) {
    return bytes > MAX_DISC_BYTES ? 'That disc image is larger than 768 MB.' : null;
  }
  if (bytes > MAX_ROM_BYTES) return 'That ROM is larger than 64 MB.';
  return null;
}

export function systemLabel(system: EmulatorSystem): string {
  return ROM_SYSTEMS.find(item => item.id === system)?.label ?? 'NES';
}

export function systemNote(system: EmulatorSystem): string | undefined {
  return ROM_SYSTEMS.find(item => item.id === system)?.note;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) return '';
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return value;
}

/**
 * Reads signatures that survive a shared extension.
 *
 * Sega puts a text header at 0x100 for Mega Drive/Genesis and 32X images, an
 * ASCII TMR SEGA header near the end of Master System/Game Gear images, and
 * Atari 7800 images begin with a small A78 header. WonderSwan keeps a 16-byte
 * boot header at the very end of the ROM, and Neo Geo Pocket starts with the
 * SNK copyright line. Raw Atari 2600 images and SG-1000 images have no
 * reliable magic, so those stay a user choice.
 */
export function identifyRomSystem(buffer: ArrayBuffer): EmulatorSystem | null {
  const bytes = new Uint8Array(buffer);

  // A78 cartridges: one-byte header version followed by the console name.
  if (ascii(bytes, 1, 9) === 'ATARI7800') return 'atari7800';

  const sega = ascii(bytes, 0x100, 16);
  if (sega.startsWith('SEGA 32X')) return 'sega32x';
  if (sega.startsWith('SEGA MEGA DRIVE') || sega.startsWith('SEGA GENESIS')) {
    return 'genesis';
  }

  // Master System and Game Gear headers sit at the end of the first ROM bank;
  // smaller images mirror the same header at a lower power-of-two offset.
  for (const offset of [0x7ff0, 0x3ff0, 0x1ff0, 0xff0]) {
    if (ascii(bytes, offset, 8) !== 'TMR SEGA') continue;
    const region = (bytes[offset + 0x0f] ?? 0) >> 4;
    if (region === 5 || region === 6 || region === 7) return 'gg';
    if (region === 3 || region === 4) return 'sms';
    return null;
  }

  // WonderSwan maps the last ROM bank to the reset vector, so the boot header
  // is always the final 16 bytes: a BR opcode, then the Color flag at +7 and
  // the ROM size code at +0x0A. Together they rule out the coin-flip that the
  // shared .ws/.pc2 extensions would otherwise force.
  if (bytes.length >= 16) {
    const header = bytes.length - 16;
    const color = bytes[header + 7] ?? 0xff;
    const romSize = bytes[header + 0x0a] ?? 0;
    const validColor = color === 0x00 || color === 0x01;
    const validSize = romSize >= 0x02 && romSize <= 0x09;
    if (bytes[header] === 0xea && validColor && validSize) {
      return color === 0x01 ? 'wsc' : 'ws';
    }
  }

  // Neo Geo Pocket headers open with the SNK copyright line and put the color
  // mode at 0x23: 0x10 for a Color cartridge, 0x00 for the monochrome model.
  if (ascii(bytes, 0, 28) === 'COPYRIGHT BY SNK CORPORATION') {
    const mode = bytes[0x23] ?? 0xff;
    if (mode === 0x10) return 'ngpc';
    if (mode === 0x00) return 'ngp';
  }

  return null;
}

function hashName(name: string): number {
  let hash = 2166136261;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 1_000_000_000);
}

/**
 * The iframe document.
 *
 * It is sandboxed without `allow-same-origin`, so the third-party emulator
 * script can never reach `window.kryvex` in the shell. The ROM arrives as an
 * ArrayBuffer over postMessage and becomes a blob URL inside that opaque
 * origin. EmulatorJS is fetched from its official CDN, which is the only
 * network call this feature makes: a second engine's core payload is packed by
 * the shell and handed in as bytes, never served from a file on disk.
 */
export function emulatorHostDocument(dataPath = 'https://cdn.emulatorjs.org/stable/data/'): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; background: #07090c; overflow: hidden; }
  body {
    display: grid;
    place-items: center;
    font-family: ui-monospace, 'Cascadia Mono', 'IBM Plex Mono', monospace;
    color: #9be9c8;
    background-image:
      repeating-linear-gradient(0deg, rgba(0,0,0,0.45) 0 1px, transparent 1px 3px),
      radial-gradient(circle at 50% 40%, #10261f, #05070a 70%);
  }
  /* Flex keeps the canvas inside the frame: a single auto grid row lets the
     canvas resize itself in a feedback loop until it is thousands of pixels tall. */
  #game { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  #game > div { max-width: 100%; max-height: 100%; }
  #status {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    text-align: center;
    padding: 24px;
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    line-height: 1.8;
    pointer-events: none;
  }
  #status b { color: #f5d97a; font-weight: 600; }
  #status .sub { display: block; color: #5e8478; font-size: 10px; letter-spacing: 0.08em; text-transform: none; }
  canvas { image-rendering: pixelated; }
</style>
</head>
<body>
<div id="game"></div>
<div id="status">KRYVEX <b>8-BIT</b><span class="sub">Waiting for a ROM. Load one from the panel beside the screen.</span></div>
<script>
(function () {
  var DATA_PATH = ${JSON.stringify(dataPath)};
  var booted = false;
  var status = document.getElementById('status');

  // The frame is sandboxed without allow-same-origin, so both storage APIs
  // throw on access. EmulatorJS probes them while booting; inert shims let the
  // core start without giving it a route back into the shell.
  try {
    window.localStorage;
  } catch (error) {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        length: 0,
        clear: function () {},
        getItem: function () { return null; },
        key: function () { return null; },
        removeItem: function () {},
        setItem: function () {},
      },
    });
  }
  try {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
  } catch (error) {}

  // Link play: the shell reads the real controller (it owns the window that
  // receives focus) and posts both seats here, so the core sees two pads even
  // when this machine only has one. Nothing is patched until a link session
  // starts, and cancelling restores whatever handler was in place before.
  var netplayPads = null;
  var netplayInputInstalled = false;
  function netplayPad(index, frame) {
    var mask = frame && typeof frame.buttons === 'number' ? frame.buttons : 0;
    var buttons = [];
    for (var button = 0; button < 16; button += 1) {
      var pressed = (mask & (1 << button)) !== 0;
      buttons.push({ pressed: pressed, touched: pressed, value: pressed ? 1 : 0 });
    }
    return {
      id: 'Kryvex link pad ' + (index + 1),
      index: index,
      connected: true,
      mapping: 'standard',
      timestamp: (window.performance && performance.now) ? performance.now() : Date.now(),
      axes: [
        frame && typeof frame.axesX === 'number' ? frame.axesX : 0,
        frame && typeof frame.axesY === 'number' ? frame.axesY : 0,
      ],
      buttons: buttons,
      hapticActuators: [],
    };
  }
  function installNetplayInput() {
    if (netplayInputInstalled) return;
    netplayInputInstalled = true;
    var previous = navigator.getGamepads;
    navigator.getGamepads = function () {
      if (!netplayPads) return previous ? previous.call(navigator) : [];
      // One entry per couch seat, and null for an empty one, which is exactly
      // what a browser returns for an unused slot. The core therefore sees four
      // players without knowing any of them came from the shell.
      return netplayPads;
    };
  }

  function post(type, payload) {
    var message = payload || {};
    message.type = type;
    try { parent.postMessage(message, '*'); } catch (error) {}
  }

  function fail(message) {
    status.style.display = 'grid';
    status.innerHTML = '<div>KRYVEX <b>8-BIT</b><span class="sub"></span></div>';
    status.querySelector('.sub').textContent = message;
    post('kryvex-emulator-error', { message: message });
  }

  function start(message) {
    if (booted) {
      fail('A game is already running. Close and reopen the emulator to start another.');
      return;
    }
    booted = true;
    status.style.display = 'none';

    if (message.gamepad === false) {
      try {
        Object.defineProperty(navigator, 'getGamepads', { value: function () { return [null]; }, configurable: true });
      } catch (error) {}
    }

    var romUrl = URL.createObjectURL(new Blob([message.data]));
    window.EJS_player = '#game';
    // A second engine is a normal core to the frontend: it asks its data path
    // for a per-core zip and unzips it. EJS_paths overrides that download by
    // file name, so the Flycast payload arrives as a blob the shell packed in
    // memory instead of a file this app serves. The WebGL2 setting is what
    // makes the frontend ask for the plain build rather than a legacy one this
    // release does not publish; see src/lib/flycast.ts.
    if (message.coreZip) {
      var coreZipUrl = URL.createObjectURL(new Blob([message.coreZip], { type: 'application/zip' }));
      window.EJS_paths = {
        'flycast-wasm.data': coreZipUrl,
        // Kept as a safety net: if a stored setting disables WebGL2, the
        // frontend asks for this name, and the same payload answers it.
        'flycast-legacy-wasm.data': coreZipUrl,
      };
    }
    window.EJS_core = message.core || 'nes';
    window.EJS_gameUrl = romUrl;
    window.EJS_gameName = message.name || 'ROM';
    window.EJS_gameID = message.gameId || 1;
    window.EJS_pathtodata = DATA_PATH;
    window.EJS_startOnLoaded = true;
    window.EJS_settingsLanguage = 'en-US';
    window.EJS_defaultOptions = message.coreZip
      ? { 'save-state-location': 'browser', webgl2Enabled: 'enabled' }
      : { 'save-state-location': 'browser' };
    if (message.bios) {
      window.EJS_biosUrl = URL.createObjectURL(new Blob([message.bios]));
    }
    // The engine's own netplay is experimental and switched off by default: its
    // bundle gates the UI on EJS_DEBUG_XX && EJS_EXPERIMENTAL_NETPLAY and relays
    // through https://netplay.emulatorjs.org. Kryvex does not enable it — the
    // room already carries a link, and a third-party relay would move game data
    // off the peer-to-peer path this service promises. That is also why the
    // engine draws no netplay indicator here; Kryvex draws its own over the
    // screen. See docs/EMULATOR_ENGINES.md before changing this.
    window.EJS_onGameStart = function () {
      post('kryvex-emulator-loaded', {});
    };
    // Registering these replaces the core's own download/browse behaviour:
    // EmulatorJS skips its default handler as soon as a listener exists, so its
    // Save State and Load State buttons act on the shell's store instead of
    // dropping a file in Downloads and then failing to find it again.
    window.EJS_onSaveState = function (payload) {
      try {
        if (!payload || !payload.state) {
          post('kryvex-save-failed', { message: 'The core did not return a state.' });
          return;
        }
        post('kryvex-state', {
          requestId: 'core-' + Date.now(),
          mode: 'manual',
          state: payload.state,
          thumb: payload.screenshot || null,
        });
      } catch (error) {
        post('kryvex-save-failed', { message: String((error && error.message) || error) });
      }
    };
    window.EJS_onLoadState = function () {
      post('kryvex-load-request', {});
    };
    window.EJS_onSaveSave = function (payload) {
      if (payload && payload.save) post('kryvex-battery', { data: payload.save });
    };
    window.EJS_onLoadSave = function () {
      post('kryvex-battery-request', {});
    };

    var script = document.createElement('script');
    script.src = DATA_PATH + 'loader.js';
    script.onerror = function () {
      fail('The emulator core could not be downloaded. Check the connection and try again.');
    };
    document.body.appendChild(script);
    setTimeout(function () { post('kryvex-emulator-running', {}); }, 1200);
  }

  var pausedByShell = false;
  var mutedByShell = false;
  var preMute = 0.5;

  function core() {
    return window.EJS_emulator || null;
  }

  // A thumbnail is a nicety: the state is the part a restore needs, so a core
  // that cannot draw one still saves.
  function captureThumb(requestId) {
    try {
      var ejs = core();
      if (!ejs || typeof ejs.takeScreenshot !== 'function') return;
      if (!ejs.capture || !ejs.capture.photo) return;
      Promise.resolve(
        ejs.takeScreenshot(ejs.capture.photo.source, ejs.capture.photo.format, ejs.capture.photo.upscale),
      )
        .then(function (shot) {
          if (shot && shot.blob) post('kryvex-state-thumb', { requestId: requestId, thumb: shot.blob });
        })
        .catch(function () {});
    } catch (error) {}
  }

  function saveNow(requestId, mode) {
    var ejs = core();
    if (!booted || !ejs || !ejs.gameManager) {
      post('kryvex-save-failed', { requestId: requestId, message: 'The game is still starting.' });
      return;
    }
    var state;
    try {
      state = ejs.gameManager.getState();
    } catch (error) {
      post('kryvex-save-failed', {
        requestId: requestId,
        message: 'The core could not read its state. Save once the game has started.',
      });
      return;
    }
    if (!state || !state.length) {
      post('kryvex-save-failed', { requestId: requestId, message: 'The core returned an empty state.' });
      return;
    }
    post('kryvex-state', {
      requestId: requestId,
      mode: mode === 'quick' ? 'quick' : 'manual',
      state: state,
    });
    captureThumb(requestId);
  }

  function applyState(requestId, data) {
    var ejs = core();
    if (!ejs || !ejs.gameManager || !data) {
      post('kryvex-load-failed', { requestId: requestId, message: 'The core is not ready for that state.' });
      return;
    }
    try {
      ejs.gameManager.loadState(new Uint8Array(data));
      if (pausedByShell && typeof ejs.play === 'function') {
        ejs.play(true);
        pausedByShell = false;
      }
      post('kryvex-state-loaded', { requestId: requestId });
    } catch (error) {
      post('kryvex-load-failed', {
        requestId: requestId,
        message: 'That state belongs to a different core or is damaged.',
      });
    }
  }

  // In-game battery saves (.srm) are what the game itself writes; they are kept
  // apart from save states because only one of them is restorable by a core.
  function applyBattery(data) {
    var ejs = core();
    if (!ejs || !ejs.gameManager || !data) {
      post('kryvex-battery-failed', {});
      return;
    }
    try {
      var gm = ejs.gameManager;
      var path = gm.getSaveFilePath();
      var parts = path.split('/');
      var prefix = '';
      for (var index = 0; index < parts.length - 1; index += 1) {
        if (parts[index] === '') continue;
        prefix += '/' + parts[index];
        if (!gm.FS.analyzePath(prefix).exists) gm.FS.mkdir(prefix);
      }
      if (gm.FS.analyzePath(path).exists) gm.FS.unlink(path);
      gm.FS.writeFile(path, new Uint8Array(data));
      gm.loadSaveFiles();
      post('kryvex-battery-loaded', {});
    } catch (error) {
      post('kryvex-battery-failed', {});
    }
  }

  function requestBattery() {
    var ejs = core();
    if (!ejs || !ejs.gameManager || typeof ejs.gameManager.getSaveFile !== 'function') {
      post('kryvex-battery-failed', {});
      return;
    }
    try {
      Promise.resolve(ejs.gameManager.getSaveFile())
        .then(function (file) {
          if (file) post('kryvex-battery', { data: file });
        })
        .catch(function () {
          post('kryvex-battery-failed', {});
        });
    } catch (error) {
      post('kryvex-battery-failed', {});
    }
  }

  function shellPause(paused) {
    var ejs = core();
    if (!ejs) return;
    try {
      if (paused) {
        if (typeof ejs.pause === 'function') {
          ejs.pause(true);
          pausedByShell = true;
        }
      } else if (pausedByShell) {
        if (typeof ejs.play === 'function') ejs.play(true);
        pausedByShell = false;
      }
    } catch (error) {}
  }

  function shellMute(muted) {
    var ejs = core();
    if (!ejs || typeof ejs.setVolume !== 'function') return;
    try {
      if (muted) {
        if (!mutedByShell) {
          preMute = typeof ejs.volume === 'number' && ejs.volume > 0 ? ejs.volume : 0.5;
          ejs.setVolume(0);
          mutedByShell = true;
        }
      } else if (mutedByShell) {
        ejs.setVolume(preMute || 0.5);
        mutedByShell = false;
      }
    } catch (error) {}
  }

  function netplaySnapshot(requestId) {
    var ejs = core();
    if (!ejs || !ejs.gameManager) {
      post('kryvex-netplay-missed', { requestId: requestId });
      return;
    }
    var state;
    try {
      state = ejs.gameManager.getState();
    } catch (error) {
      post('kryvex-netplay-missed', { requestId: requestId });
      return;
    }
    if (!state || !state.length) {
      post('kryvex-netplay-missed', { requestId: requestId });
      return;
    }
    post('kryvex-netplay-state', { requestId: requestId, data: state });
  }

  // A guest restores the host's checkpoint without touching its saved states:
  // link play has its own timeline and must never overwrite a manual save.
  function netplayRestore(data) {
    var ejs = core();
    if (!ejs || !ejs.gameManager || !data) return;
    try {
      ejs.gameManager.loadState(new Uint8Array(data));
      if (pausedByShell && typeof ejs.play === 'function') {
        ejs.play(true);
        pausedByShell = false;
      }
      post('kryvex-netplay-restored', {});
    } catch (error) {
      post('kryvex-netplay-restore-failed', {});
    }
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data.type !== 'string') return;
    if (data.type === 'kryvex-rom') {
      try {
        start(data);
      } catch (error) {
        fail(String((error && error.message) || error));
      }
      return;
    }
    if (data.type === 'kryvex-save-state') {
      saveNow(data.requestId, data.mode);
      return;
    }
    if (data.type === 'kryvex-load-state') {
      applyState(data.requestId, data.data);
      return;
    }
    if (data.type === 'kryvex-battery-load') {
      applyBattery(data.data);
      return;
    }
    if (data.type === 'kryvex-pause') {
      shellPause(true);
      return;
    }
    if (data.type === 'kryvex-resume') {
      shellPause(false);
      return;
    }
    if (data.type === 'kryvex-mute') {
      shellMute(data.muted !== false);
      return;
    }
    if (data.type === 'kryvex-netplay') {
      if (!data.active) {
        netplayPads = null;
        return;
      }
      installNetplayInput();
      netplayPads = [];
      for (var seat = 0; seat < 4; seat += 1) {
        var frame = data.pads && data.pads[seat] ? data.pads[seat] : null;
        netplayPads.push(frame ? netplayPad(seat, frame) : null);
      }
      return;
    }
    if (data.type === 'kryvex-netplay-snapshot') {
      netplaySnapshot(data.requestId);
      return;
    }
    if (data.type === 'kryvex-netplay-restore') {
      netplayRestore(data.data);
      return;
    }
    if (data.type === 'kryvex-battery-save') {
      requestBattery();
    }
  });

  window.addEventListener('error', function (event) {
    if (event && event.message) post('kryvex-emulator-error', { message: event.message });
  });

  post('kryvex-emulator-ready', {});
})();
</script>
</body>
</html>`;
}

/** The frame message that starts a core, shared by both engines. */
export function emulatorStartMessage(input: {
  name: string;
  data: ArrayBuffer;
  system: EmulatorSystem;
  gamepad: boolean;
  bios: ArrayBuffer | null;
  coreZip?: Uint8Array;
}): Record<string, unknown> {
  return {
    type: 'kryvex-rom',
    name: input.name,
    data: input.data,
    core: coreFor(input.system),
    gamepad: input.gamepad,
    bios: input.bios,
    gameId: emulatorGameId(input.name),
    coreZip: input.coreZip ?? null,
  };
}

export function emulatorGameId(name: string): number {
  return hashName(name) || 1;
}

/**
 * The key saves hang off: one cartridge, one history.
 *
 * The size is part of it so two files with the same name but different dumps
 * (a clean ROM and a patched hack, for instance) never load each other's states.
 */
export function emulatorGameKey(name: string, system: EmulatorSystem, bytes: number): string {
  return `${system}:${hashName(name)}:${Math.max(0, Math.round(bytes))}`;
}

/** Requests a save/load round trip with a correlation id the shell can match. */
export function emulatorRequestId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
