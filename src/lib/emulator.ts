import type { EmulatorSystem } from '../types';

export interface RomSystemDef {
  id: EmulatorSystem;
  label: string;
  /** EmulatorJS core name. */
  core: string;
  extensions: string[];
  /** Shown when a core is experimental or not a perfect match. */
  note?: string;
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
];

export const ROM_EXTENSIONS = Array.from(
  new Set(ROM_SYSTEMS.flatMap(system => system.extensions)),
).sort();

export const ROM_ACCEPT = ROM_EXTENSIONS.map(extension => `.${extension}`).join(',');
export const MAX_ROM_BYTES = 64 * 1024 * 1024;

export function isEmulatorSystem(value: unknown): value is EmulatorSystem {
  return typeof value === 'string' && ROM_SYSTEMS.some(system => system.id === value);
}

/** `.bin` and `.rom` are shared by several Sega/Atari systems. */
const SHARED_EXTENSIONS: Record<string, EmulatorSystem[]> = {
  bin: ['genesis', 'sega32x', 'sms', 'gg', 'sg1000', 'atari2600', 'atari7800'],
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
 */
export function systemsForFile(name: string): EmulatorSystem[] {
  const extension = extensionOf(name);
  if (SHARED_EXTENSIONS[extension]) return [...SHARED_EXTENSIONS[extension]];
  return ROM_SYSTEMS.filter(system => system.extensions.includes(extension)).map(
    system => system.id,
  );
}

/** A unique extension gives one definite system; shared formats give null. */
export function detectRomSystem(name: string): EmulatorSystem | null {
  const systems = systemsForFile(name);
  return systems.length === 1 ? systems[0]! : null;
}

export function coreFor(system: EmulatorSystem): string {
  return ROM_SYSTEMS.find(item => item.id === system)?.core ?? 'nes';
}

export function romValidation(name: string, bytes: number): string | null {
  if (systemsForFile(name).length === 0) {
    return 'That file is not a supported ROM. Use one of the cartridge formats listed beside the slot.';
  }
  if (bytes <= 0) return 'That ROM is empty.';
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
 * network call this feature makes.
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
    window.EJS_core = message.core || 'nes';
    window.EJS_gameUrl = romUrl;
    window.EJS_gameName = message.name || 'ROM';
    window.EJS_gameID = message.gameId || 1;
    window.EJS_pathtodata = DATA_PATH;
    window.EJS_startOnLoaded = true;
    window.EJS_settingsLanguage = 'en-US';
    window.EJS_defaultOptions = { 'save-state-location': 'browser' };
    if (message.bios) {
      window.EJS_biosUrl = URL.createObjectURL(new Blob([message.bios]));
    }
    // EmulatorJS does not support netplay yet (upstream FAQ), so no server
    // option is sent. Two controllers still work on this one screen.
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
