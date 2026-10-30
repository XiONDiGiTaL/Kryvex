import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  screen,
  session,
  shell,
  type WebContents,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { assistant } from './assistant';
import {
  applyChromiumPreferences,
  chromiumProfile,
  engineInfo,
  initChromium,
  setChromium,
  trackChromiumGuest,
} from './chromium';
import { defaultBrowser } from './default-browser';
import { startupStatus, setStartup } from './startup';
import { diskService } from './disk-service';
import { downloads } from './downloads';
import { extensions } from './extensions';
import { userscripts } from './userscripts';
import { configurePrivacySwitches, hardenSession } from './hardening';
import { ensureBrowserIdentity, followUserAgent } from './identity';
import { link } from './link';
import { localModel } from './local-model';
import { media } from './media';
import { modelManager } from './model-download';
import { notifications } from './notifications';
import { partyAttachWindow, partyInit, registerPartyIpc } from './party';
import { emptyVlanStatus } from './vlan-rules';
import { captureTools } from './capture-tools';
import { captureWindow } from './capture-window';
import { fileKit } from './file-kit';
import { playlistImporter } from './playlist';
import { playerEmbed } from './player-embed';
import * as lexiumProxy from './lexium-proxy';
import { permissions } from './permissions';
import { popupTabs } from './popup-tabs';
import { fetchFeed } from './rss';
import { resources } from './resources';
import { vpn } from './vpn';
import { vlanStatus } from './vlan';
import { weather } from './weather';
import { serverOrigin } from './origin';
import { isSafePartition } from './privacy';
import { serviceSessions } from './service-sessions';
import { followServicePopup, signsInWithin } from './service-signin';
import { isGoogleSite } from './sign-in-hosts';
import { spotifyAds } from './spotify-ads';
import { rememberApplicationAgent, stableUserAgent } from './user-agent';
import {
  MIN_WINDOW_SIZE,
  PREFERRED_WINDOW_SIZE,
  fitWindowToWorkArea,
  type WindowSize,
} from './window-rules';
import { shield } from './shield';
import { SpeechRuntime } from './speech-runtime';
import { EmulatorLibrary } from './emulator-library';
import { FlycastCore } from './flycast-core';
import { RetroArchSidecar, normalizeRetroarchStart } from './retroarch';
import {
  chooseDownloadLocation,
  downloadLocation,
  initStorage,
  resetDownloadLocation,
} from './storage';
import { isMagnetLink } from './torrent-rules';
import { clearWallpaper, readWallpaper, writeWallpaper } from './wallpaper';
import { torrents } from './torrents';
import { updater } from './updater';
import { webPrivacy } from './web-privacy';
import type { TorrentResult } from './types';

const DEV_URL = process.env.KRYVEX_DEV_URL;
const CAPTURE = process.env.KRYVEX_CAPTURE === '1';
const STATE_FILE = 'kryvex-state.json';
const MAX_STATE_BYTES = 1024 * 1024;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const BROWSER_PARTITION = /^browser-[a-z0-9-]{1,64}$/i;

// Windows groups taskbar entries and notifications by AppUserModelID. The
// packaged app uses the installer's shortcut identity; a source run gets a
// separate one so it cannot claim the installed shortcut (Electron's
// development shortcut targets the bare executable).
app.setName('Kryvex');
notifications.configure();

// Service modules must look like a normal Chromium browser. Electron's
// default agent advertises "Electron/x", which several web clients treat as an
// unsupported browser and answer with forced sign-outs or broken OAuth. The
// original value is kept: Google's pages verify the browser and accept the
// agent that names the product Kryvex actually is, so Google hosts get it.
rememberApplicationAgent(app.userAgentFallback);
app.userAgentFallback = stableUserAgent(process.platform, process.versions.chrome);

// Integration harnesses use an isolated profile so they never read or write the
// profile of the person running the app.
if (process.env.KRYVEX_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.KRYVEX_USER_DATA));
}

// Screenshot runs must be reproducible and must never pollute a real profile
// with captured pages, history or window state.
if (CAPTURE) {
  const captureProfile = path.join(app.getPath('temp'), 'kryvex-capture-profile');
  try {
    fs.rmSync(captureProfile, { recursive: true, force: true });
  } catch {
    /* a previous run may still be closing */
  }
  app.setPath('userData', captureProfile);
}
configurePrivacySwitches();
// Launch switches and GPU acceleration read the same state file the renderer
// uses, because some of them must exist before Chromium starts.
initChromium(readState());

let mainWindow: BrowserWindow | null = null;
// Captured while the window is alive: every IPC sender check compares against
// this instead of reading `mainWindow.webContents`, which throws once the
// window has been destroyed.
let shellContents: WebContents | null = null;

/**
 * The Whisper server Lexium can install and run on this machine.
 *
 * The profile is settled by the two `setPath` calls above, so the root is read
 * here rather than in the module: a test profile or a capture run must get its
 * own `speech` folder, not the one belonging to the person using the app.
 * Install progress is pushed to the shell as it happens; the renderer never
 * polls a download.
 */
const speech = new SpeechRuntime(path.join(app.getPath('userData'), 'speech'), progress => {
  try {
    shellContents?.send('kryvex:speech:progress', progress);
  } catch {
    /* the shell may be closing */
  }
});

/**
 * The optional second emulator engine (Flycast, for Dreamcast).
 *
 * Same profile logic as the speech runtime: the root is read here so a test or
 * capture profile gets its own copy instead of the one belonging to the person
 * using the app. Download progress is pushed to the shell; nothing polls.
 */
const flycast = new FlycastCore(path.join(app.getPath('userData'), 'flycast'), progress => {
  try {
    shellContents?.send('kryvex:flycast:progress', progress);
  } catch {
    /* the shell may be closing */
  }
});

/**
 * The netplay sidecar.
 *
 * Kryvex does not ship RetroArch: the user installs it, and this runs that
 * copy. The root is read here for the same reason the other roots are — a test
 * or capture profile gets its own remembered path instead of the real one's.
 */
const retroarch = new RetroArchSidecar(path.join(app.getPath('userData'), 'retroarch'));

/**
 * The emulator's folders.
 *
 * Kryvex ships no cartridges and no BIOS images: this only lists what is in a
 * folder the user picked through a native dialog, and reads a file back from
 * inside that folder. Nothing is copied, indexed or uploaded, and nothing is
 * fetched.
 */
const emulatorLibrary = new EmulatorLibrary(() => mainWindow);

function forwardMagnet(url: string): void {
  if (!isMagnetLink(url) || !mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send('kryvex:browser:magnet', url);
  } catch {
    /* the shell may be closing */
  }
}

function isSafeUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return false;
  try {
    return ALLOWED_PROTOCOLS.has(new URL(raw).protocol);
  } catch {
    return false;
  }
}

/** A canvas rectangle from the renderer; anything else clears it. */
function isPopupRect(value: unknown): value is { x: number; y: number; width: number; height: number } {
  if (!value || typeof value !== 'object') return false;
  const rect = value as Record<string, unknown>;
  return [rect.x, rect.y, rect.width, rect.height].every(
    item => typeof item === 'number' && Number.isFinite(item),
  );
}

function statePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE);
}

function readState(): unknown {
  try {
    const file = statePath();
    if (!fs.existsSync(file)) return null;
    if (fs.statSync(file).size > MAX_STATE_BYTES) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state: unknown): boolean {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) return false;
  let json: string;
  try {
    json = JSON.stringify(state);
  } catch {
    return false;
  }
  if (json.length > MAX_STATE_BYTES) return false;
  const target = statePath();
  const tmp = `${target}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, target);
    return true;
  } catch {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    return false;
  }
}

/**
 * Lock down every webview: no preload, no Node, isolated sessions, and only
 * http(s) navigation. Service content is treated as untrusted.
 */
function hardenWebContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    // Shared across the shell and every partition so the shield, privacy
    // policy and installed extensions apply to webviews as they are created.
    hardenSession(contents.session);
    shield.trackSession(contents.session);
    extensions.trackSession(contents.session);
    downloads.trackSession(contents.session);
    webPrivacy.attachContents(contents);
    if (contents.getType() === 'webview') {
      // Only remote content gets the farbling and identity preloads; the
      // trusted shell is never patched.
      ensureBrowserIdentity(contents.session);
      webPrivacy.ensureSession(contents.session, true);
      shield.attachScriptlets(contents);
      // User scripts are browser-tab only; the manager refuses a service
      // session, so a signed-in module is never patched with third-party code.
      userscripts.attach(contents);
    }

    contents.setWindowOpenHandler(({ url, disposition }) => {
      if (isMagnetLink(url)) {
        forwardMagnet(url);
        return { action: 'deny' };
      }
      // A browser tab's popup becomes an in-app tab: the real Chromium window
      // (so `window.opener` and the shared session survive) placed over the
      // browser canvas, instead of leaving for the system browser.
      const popup = popupTabs.open(contents, url, disposition);
      if (popup) return popup;
      // A hidden pop-under is the signature of an ad script, not a sign-in
      // flow. Browser tabs never get one; a service still may, because some
      // OAuth providers open a background window before focusing it.
      if (
        contents.getType() === 'webview' &&
        !serviceSessions.isServiceSession(contents.session) &&
        disposition === 'background-tab'
      ) {
        return { action: 'deny' };
      }
      // A Google product signing itself in does not need a window at all: the
      // account pages set cookies on the module's own session, so they run in
      // the module's frame and the flow ends on the page it started from. A
      // popup here would sign the user in and then show the product in a stray
      // window while the module stayed on its signed-out page.
      if (
        contents.getType() === 'webview' &&
        serviceSessions.isServiceSession(contents.session) &&
        isSafeUrl(url) &&
        signsInWithin(contents.getURL(), url)
      ) {
        void contents.loadURL(url).catch(() => undefined);
        return { action: 'deny' };
      }
      // Other sign-in providers (Microsoft, Apple, passkeys, a third-party
      // "Sign in with Google") finish in a popup and hand the result back to
      // the opener, so they keep one. A service module gets a real child window
      // on its own persistent session; a browser tab still hands the link to
      // the system browser.
      if (
        contents.getType() === 'webview' &&
        serviceSessions.isServiceSession(contents.session) &&
        isSafeUrl(url)
      ) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 760,
            minWidth: 420,
            minHeight: 520,
            parent: mainWindow ?? undefined,
            autoHideMenuBar: true,
            backgroundColor: '#0B0E12',
            webPreferences: {
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
              webviewTag: false,
            },
          },
        };
      }
      if (isSafeUrl(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });

    // Popups are still untrusted pages: they may not leave http(s), and their
    // own window.open calls go to the system browser rather than stacking
    // unknown windows inside the app.
    contents.on('did-create-window', window => {
      followUserAgent(window.webContents);
      // A popup tab keeps the window-open policy above, so a link opened from
      // inside it stays in Kryvex too.
      if (popupTabs.claim(window, contents)) return;
      // A service's sign-in window returns its result to the module instead of
      // staying a stray window that shows the product.
      if (contents.getType() === 'webview' && serviceSessions.isServiceSession(contents.session)) {
        followServicePopup(contents, window.webContents);
      }
      const popup = window.webContents;
      popup.setWindowOpenHandler(({ url }) => {
        if (isSafeUrl(url)) void shell.openExternal(url);
        return { action: 'deny' };
      });
      popup.on('will-navigate', (event, url) => {
        if (!isSafeUrl(url)) event.preventDefault();
      });
    });

    contents.on('will-navigate', (event, url) => {
      if (isMagnetLink(url)) {
        event.preventDefault();
        forwardMagnet(url);
        return;
      }
      const type = contents.getType();
      if ((type === 'webview' || type === 'window') && !isSafeUrl(url)) {
        event.preventDefault();
      }
    });
  });
}

/** Screen-aware initial size; see window-rules.ts for the rule itself. */
function initialWindowSize(): WindowSize {
  try {
    const area = screen.getPrimaryDisplay().workAreaSize;
    return fitWindowToWorkArea(area);
  } catch {
    return PREFERRED_WINDOW_SIZE;
  }
}

function createWindow(): BrowserWindow {
  const size = initialWindowSize();
  const iconFile = process.platform === 'win32' ? 'kryvex.ico' : 'kryvex-512.png';
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icons', iconFile)
    : path.join(__dirname, '..', 'brand', 'icons', iconFile);

  // Windows groups taskbar buttons by AppUserModelID, but the *image* it draws
  // comes from the window/exe icon. Keep both explicit: a dev run points at
  // electron.exe, so the window icon is the only thing that carries Kryvex's
  // mark until the installer's branded exe takes over.
  const brandIcon = nativeImage.createFromPath(iconPath);

  const win = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    show: false,
    backgroundColor: '#0B0E12',
    title: 'Kryvex',
    icon: iconPath,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0B0E12',
      symbolColor: '#9AA6B5',
      height: 52,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      spellcheck: true,
      backgroundThrottling: false,
    },
  });

  if (!brandIcon.isEmpty()) win.setIcon(brandIcon);

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isMagnetLink(url)) {
      forwardMagnet(url);
    } else if (isSafeUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL();
    if (url !== current) {
      // The shell must never navigate away from the app bundle.
      event.preventDefault();
      if (isMagnetLink(url)) {
        forwardMagnet(url);
      } else if (isSafeUrl(url)) {
        void shell.openExternal(url);
      }
    }
  });

  win.webContents.on('did-attach-webview', (_event, contents) => {
    trackChromiumGuest(contents);
    followUserAgent(contents);
    serviceSessions.applyTo(contents);
    serviceSessions.observeGuest(contents);
    media.track(contents);
    spotifyAds.track(contents);
    // A parked service frame stays mounted but hidden, and Chromium throttles
    // timers in a hidden page. A chat client that misses one heartbeat shows
    // "connecting" minutes later, which reads as a disconnect. Turning guest
    // throttling off is Electron's supported fix; the Settings switch still
    // wins, so a user who keeps throttling on for battery keeps it.
    if (!chromiumProfile().backgroundThrottling) {
      try {
        contents.setBackgroundThrottling(false);
      } catch {
        /* a guest that is already gone needs nothing */
      }
    }
  });

  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    // Remember which sessions belong to service modules before the guest can
    // ask for notifications or open an auth popup.
    serviceSessions.markPartition(params.partition, params.src);
    delete (webPreferences as { preload?: string }).preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    // Engine preferences last: they only touch content behaviour, never the
    // sandbox, preload or node settings assigned above.
    applyChromiumPreferences(webPreferences as Record<string, unknown>);
    if (!isSafeUrl(params.src) || !isSafePartition(params.partition ?? '')) {
      event.preventDefault();
    }
  });

  if (DEV_URL) {
    void win.loadURL(DEV_URL);
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // A new message flashes the taskbar button; looking at the window stops it.
  win.on('focus', () => win.flashFrame(false));

  const contents = win.webContents;
  shellContents = contents;
  // The capture preview hands the user back here for "New capture".
  captureWindow.attachShell(win);
  win.on('closed', () => {
    if (shellContents === contents) shellContents = null;
    captureWindow.attachShell(null);
    mainWindow = null;
    updater.dispose();
    assistant.dispose();
  });

  return win;
}

function isShellSender(event: Electron.IpcMainInvokeEvent): boolean {
  return Boolean(shellContents && event.sender === shellContents);
}

function torrentResult(ok: boolean, message: string): TorrentResult {
  return { ok, message, records: [] };
}

function registerIpc(): void {
  // The identity preload asks this before it patches a page. Google stands
  // aside as one family: its pages verify the engine, so account hosts and
  // products alike run unpatched under the application's own user agent.
  ipcMain.on('kryvex:identity:chrome', (event, host: unknown) => {
    event.returnValue = !isGoogleSite(typeof host === 'string' ? host : '');
  });
  ipcMain.handle('kryvex:state:load', (event) => (isShellSender(event) ? readState() : null));
  ipcMain.handle('kryvex:state:save', (event, state: unknown) =>
    isShellSender(event) ? writeState(state) : false,
  );
  ipcMain.handle('kryvex:assistant:probe', (event, baseUrl: unknown) =>
    isShellSender(event) ? assistant.probe(baseUrl) : { ok: false, models: [], error: 'invalid-url' },
  );
  ipcMain.handle('kryvex:assistant:chat', (event, request: unknown) =>
    isShellSender(event) ? assistant.chat(request) : { ok: false, error: 'invalid-request' },
  );
  ipcMain.handle('kryvex:assistant:cancel', (event, requestId: unknown) =>
    isShellSender(event) ? assistant.cancel(requestId) : false,
  );
  // Read-only status is harmless to any sender; every mutation needs the shell.
  ipcMain.handle('kryvex:model:status', () => localModel.status());
  ipcMain.handle('kryvex:model:choose', (event) =>
    isShellSender(event) ? localModel.chooseModel(mainWindow) : localModel.status(),
  );
  ipcMain.handle('kryvex:model:choose-binary', (event) =>
    isShellSender(event) ? localModel.chooseBinary(mainWindow) : localModel.status(),
  );
  ipcMain.handle('kryvex:model:start', (event) =>
    isShellSender(event) ? localModel.start() : localModel.status(),
  );
  ipcMain.handle('kryvex:model:stop', (event) =>
    isShellSender(event) ? localModel.stop() : localModel.status(),
  );
  ipcMain.handle('kryvex:model:configure', (event, patch: unknown) =>
    isShellSender(event) ? localModel.configure(patch) : localModel.status(),
  );
  // Model downloads take a catalogue id only. URLs, sizes and paths never
  // cross this bridge from the renderer.
  ipcMain.handle('kryvex:models:catalogue', (event) =>
    isShellSender(event) ? modelManager.catalogue() : [],
  );
  ipcMain.handle('kryvex:models:installed', (event) =>
    isShellSender(event) ? modelManager.installed() : [],
  );
  ipcMain.handle('kryvex:models:download', (event, id: unknown) =>
    isShellSender(event) ? modelManager.download(id) : { ok: false, error: 'not-in-catalogue' },
  );
  ipcMain.handle('kryvex:models:cancel', (event, id: unknown) =>
    isShellSender(event) ? modelManager.cancel(id) : false,
  );
  ipcMain.handle('kryvex:models:delete', (event, id: unknown) =>
    isShellSender(event) ? modelManager.remove(id) : { ok: false, error: 'not-in-catalogue' },
  );
  // Disk pulse: the renderer sends target ids only. Roots, age filters and
  // protected paths stay in disk-rules and are re-read for every clean.
  ipcMain.handle('kryvex:disk:health', (event) =>
    isShellSender(event) ? diskService.health() : null,
  );
  ipcMain.handle('kryvex:disk:scan', (event) =>
    isShellSender(event) ? diskService.scan() : null,
  );
  ipcMain.handle('kryvex:disk:clean', (event, ids: unknown) =>
    isShellSender(event)
      ? diskService.clean(ids)
      : {
          ok: false,
          freedBytes: 0,
          removedFiles: 0,
          skipped: 0,
          targets: [],
          errors: [],
          cancelled: false,
          message: 'not-shell',
        },
  );
  ipcMain.handle('kryvex:disk:cancel', (event) =>
    isShellSender(event) ? diskService.cancel() : false,
  );
  ipcMain.handle('kryvex:wallpaper:load', (event) =>
    isShellSender(event) ? readWallpaper(app.getPath('userData')) : null,
  );
  ipcMain.handle('kryvex:wallpaper:save', (event, dataUrl: unknown) =>
    isShellSender(event) ? writeWallpaper(app.getPath('userData'), dataUrl) : null,
  );
  ipcMain.handle('kryvex:wallpaper:clear', (event) =>
    isShellSender(event) ? clearWallpaper(app.getPath('userData')) : false,
  );
  ipcMain.handle('kryvex:rss:fetch', (event, url: unknown) =>
    isShellSender(event) ? fetchFeed(url) : { ok: false, text: '', url: '', error: 'unavailable' },
  );
  ipcMain.handle('kryvex:shield:status', (event) =>
    isShellSender(event) ? shield.status() : { ...shield.status(), enabled: false },
  );
  ipcMain.handle('kryvex:shield:enabled', (event, enabled: unknown) => {
    if (!isShellSender(event) || typeof enabled !== 'boolean') return shield.status();
    return shield.setEnabled(enabled);
  });
  ipcMain.handle('kryvex:shield:update', (event) => {
    if (!isShellSender(event)) return shield.status();
    return shield.refresh();
  });
  ipcMain.handle('kryvex:shield:option', (event, option: unknown, enabled: unknown) => {
    if (!isShellSender(event) || typeof option !== 'string' || typeof enabled !== 'boolean') {
      return shield.status();
    }
    return shield.setOption(option, enabled);
  });
  ipcMain.handle('kryvex:shield:custom', (event, patch: unknown) => {
    if (!isShellSender(event)) return shield.status();
    return shield.setCustom(patch);
  });
  ipcMain.handle('kryvex:shield:import-filters', async (event) => {
    const failed = { ok: false, message: 'Untrusted sender.', status: shield.status() };
    if (!isShellSender(event) || !mainWindow) return failed;
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: 'Append filter rules',
      properties: ['openFile'],
      filters: [
        { name: 'Filter lists', extensions: ['txt', 'list', 'filters'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    const file = picked.canceled ? undefined : picked.filePaths[0];
    if (!file) return { ok: false, message: 'No file was chosen.', status: shield.status() };
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const current = shield.status().customFilters;
      const joined = current.trim()
        ? `${current.trim()}\n\n! ==== imported from ${path.basename(file)} ====\n${raw}`
        : raw;
      const status = shield.setCustom({ text: joined, enabled: true });
      return { ok: !status.error, message: status.error ?? 'Filter rules appended.', status };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'The file could not be read.',
        status: shield.status(),
      };
    }
  });
  ipcMain.handle('kryvex:shield:export-filters', async (event) => {
    const failed = { ok: false, message: 'Untrusted sender.', status: shield.status() };
    if (!isShellSender(event) || !mainWindow) return failed;
    const status = shield.status();
    const target = await dialog.showSaveDialog(mainWindow, {
      title: 'Export my filters',
      defaultPath: 'kryvex-my-filters.txt',
      filters: [{ name: 'Filter list', extensions: ['txt'] }],
    });
    if (target.canceled || !target.filePath) {
      return { ok: false, message: 'Export cancelled.', status };
    }
    try {
      fs.writeFileSync(target.filePath, `${status.customFilters.trim()}\n`, 'utf8');
      return { ok: true, message: 'Filter rules exported.', status };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'The file could not be written.',
        status,
      };
    }
  });
  ipcMain.on('kryvex:farbling:seed', (event, site: unknown) => {
    event.returnValue = webPrivacy.fingerprintSeed(event.sender, site);
  });
  ipcMain.handle('kryvex:extensions:list', (event) =>
    isShellSender(event) ? extensions.list() : [],
  );
  ipcMain.handle('kryvex:extensions:install', (event) => {
    if (!isShellSender(event)) return { ok: false, message: 'Untrusted sender.', records: extensions.list() };
    return extensions.installFromDialog(false);
  });
  ipcMain.handle('kryvex:extensions:install-folder', (event) => {
    if (!isShellSender(event)) return { ok: false, message: 'Untrusted sender.', records: extensions.list() };
    return extensions.installFromDialog(true);
  });
  ipcMain.handle('kryvex:extensions:webstore', (event, extensionId: unknown) => {
    if (!isShellSender(event) || typeof extensionId !== 'string') {
      return { ok: false, message: 'Invalid request.', records: extensions.list() };
    }
    return extensions.installFromWebStore(extensionId);
  });
  ipcMain.handle('kryvex:extensions:enabled', (event, key: unknown, enabled: unknown) => {
    if (!isShellSender(event) || typeof key !== 'string' || typeof enabled !== 'boolean') {
      return { ok: false, message: 'Invalid request.', records: extensions.list() };
    }
    return extensions.setEnabled(key, enabled);
  });
  ipcMain.handle('kryvex:extensions:remove', (event, key: unknown) => {
    if (!isShellSender(event) || typeof key !== 'string') {
      return { ok: false, message: 'Invalid request.', records: extensions.list() };
    }
    return extensions.remove(key);
  });
  ipcMain.handle('kryvex:userscripts:list', event =>
    isShellSender(event) ? userscripts.list() : [],
  );
  ipcMain.handle('kryvex:userscripts:install-file', (event) => {
    if (!isShellSender(event)) return { ok: false, message: 'Untrusted sender.', records: userscripts.list() };
    return userscripts.installFromDialog();
  });
  ipcMain.handle('kryvex:userscripts:install-text', (event, source: unknown) => {
    if (!isShellSender(event) || typeof source !== 'string') {
      return { ok: false, message: 'Invalid request.', records: userscripts.list() };
    }
    return userscripts.installFromText(source);
  });
  ipcMain.handle('kryvex:userscripts:install-url', (event, url: unknown) => {
    if (!isShellSender(event) || typeof url !== 'string') {
      return { ok: false, message: 'Invalid request.', records: userscripts.list() };
    }
    return userscripts.installFromUrl(url);
  });
  ipcMain.handle('kryvex:userscripts:enabled', (event, key: unknown, enabled: unknown) => {
    if (!isShellSender(event) || typeof key !== 'string' || typeof enabled !== 'boolean') {
      return { ok: false, message: 'Invalid request.', records: userscripts.list() };
    }
    return userscripts.setEnabled(key, enabled);
  });
  ipcMain.handle('kryvex:userscripts:remove', (event, key: unknown) => {
    if (!isShellSender(event) || typeof key !== 'string') {
      return { ok: false, message: 'Invalid request.', records: userscripts.list() };
    }
    return userscripts.remove(key);
  });
  ipcMain.handle('kryvex:downloads:list', (event) => (isShellSender(event) ? downloads.list() : []));
  ipcMain.handle('kryvex:downloads:location', (event) =>
    isShellSender(event) ? downloadLocation() : null,
  );
  ipcMain.handle('kryvex:downloads:choose-location', (event) => {
    if (!isShellSender(event) || !mainWindow) {
      return { ok: false, message: 'The main window is not ready.', location: null };
    }
    return chooseDownloadLocation(mainWindow);
  });
  ipcMain.handle('kryvex:downloads:reset-location', (event) =>
    isShellSender(event)
      ? resetDownloadLocation()
      : { ok: false, message: 'Untrusted sender.', location: null },
  );
  ipcMain.handle('kryvex:downloads:pause', (event, id: unknown) => {
    if (!isShellSender(event) || typeof id !== 'string') return false;
    return downloads.pause(id);
  });
  ipcMain.handle('kryvex:downloads:cancel', (event, id: unknown) => {
    if (!isShellSender(event) || typeof id !== 'string') return false;
    return downloads.cancel(id);
  });
  ipcMain.handle('kryvex:downloads:show', (event, id: unknown) => {
    if (!isShellSender(event) || typeof id !== 'string') return false;
    return downloads.show(id);
  });
  ipcMain.handle('kryvex:downloads:open', (event, id: unknown) => {
    if (!isShellSender(event) || typeof id !== 'string') return false;
    return downloads.open(id);
  });
  ipcMain.handle('kryvex:downloads:remove', (event, id: unknown, deleteFile: unknown) => {
    if (!isShellSender(event) || typeof id !== 'string' || typeof deleteFile !== 'boolean') {
      return { ok: false, message: 'Invalid request.', records: downloads.list() };
    }
    return downloads.remove(id, deleteFile);
  });
  ipcMain.handle('kryvex:downloads:clear', (event) => {
    if (!isShellSender(event)) return downloads.list();
    return downloads.clearFinished();
  });
  ipcMain.handle('kryvex:torrents:list', (event) =>
    isShellSender(event) ? torrents.list() : [],
  );
  ipcMain.handle('kryvex:torrents:add-magnet', (event, magnet: unknown) => {
    if (!isShellSender(event)) return torrentResult(false, 'Untrusted sender.');
    return torrents.addMagnet(magnet);
  });
  ipcMain.handle('kryvex:torrents:add-file', (event) => {
    if (!isShellSender(event)) return torrentResult(false, 'Untrusted sender.');
    return torrents.addFromDialog();
  });
  ipcMain.handle('kryvex:torrents:pause', (event, id: unknown) => {
    if (!isShellSender(event) || typeof id !== 'string') return torrentResult(false, 'Invalid request.');
    return torrents.pause(id);
  });
  ipcMain.handle('kryvex:torrents:resume', (event, id: unknown) => {
    if (!isShellSender(event) || typeof id !== 'string') return torrentResult(false, 'Invalid request.');
    return torrents.resume(id);
  });
  ipcMain.handle('kryvex:torrents:show', (event, id: unknown) => {
    if (!isShellSender(event) || typeof id !== 'string') return false;
    return torrents.show(id);
  });
  ipcMain.handle('kryvex:torrents:remove', (event, id: unknown, deleteData: unknown) => {
    if (!isShellSender(event) || typeof id !== 'string' || typeof deleteData !== 'boolean') {
      return torrentResult(false, 'Invalid request.');
    }
    return torrents.remove(id, deleteData);
  });
  ipcMain.handle('kryvex:permissions:respond', (event, id: unknown, allow: unknown) => {
    if (!isShellSender(event) || typeof id !== 'string' || typeof allow !== 'boolean') return false;
    return permissions.respond(id, allow);
  });
  ipcMain.handle('kryvex:browser:default-status', (event) =>
    isShellSender(event) ? defaultBrowser.status() : { supported: false, isDefault: false, canRegister: false },
  );
  ipcMain.handle('kryvex:browser:default-set', (event) => {
    if (!isShellSender(event)) return defaultBrowser.status();
    return defaultBrowser.setAsDefault();
  });
  ipcMain.handle('kryvex:browser:default-settings', async (event) => {
    if (!isShellSender(event)) return false;
    return defaultBrowser.openSettings();
  });
  ipcMain.handle('kryvex:browser:pending-urls', (event) => {
    if (!isShellSender(event)) return [];
    return defaultBrowser.takePendingUrls();
  });
  // Windows startup. The registry entry is the state, so the switch reads it
  // back instead of keeping a copy that could drift from it.
  ipcMain.handle('kryvex:startup:status', (event) =>
    isShellSender(event) ? startupStatus() : { supported: false, enabled: false, canChange: false },
  );
  ipcMain.handle('kryvex:startup:set', (event, enabled: unknown) =>
    isShellSender(event) ? setStartup(enabled) : startupStatus(),
  );
  ipcMain.handle('kryvex:services:clear-session', (event, partition: unknown) => {
    if (!isShellSender(event)) return false;
    return serviceSessions.clear(partition);
  });
  ipcMain.handle('kryvex:services:stop', (event, partition: unknown) => {
    if (!isShellSender(event)) return 0;
    return serviceSessions.stop(partition);
  });
  ipcMain.handle('kryvex:services:notifications', (event, enabled: unknown) => {
    if (!isShellSender(event) || typeof enabled !== 'boolean') return serviceSessions.notificationsEnabled();
    serviceSessions.setNotifications(enabled);
    return serviceSessions.notificationsEnabled();
  });
  ipcMain.handle('kryvex:services:policy', (event, partition: unknown, policy: unknown) => {
    if (!isShellSender(event)) return false;
    return serviceSessions.setPolicy(partition, policy);
  });
  // Screen capture. The renderer sends base64 and gets a path back; it never
  // chooses where to write, and the dialog is the only way a file is created.
  ipcMain.handle('kryvex:capture:save', (event, request: unknown) =>
    isShellSender(event)
      ? captureTools.save(
          request && typeof request === 'object'
            ? (request as { data?: unknown; name?: unknown; kind?: unknown })
            : {},
        )
      : { ok: false, message: 'Untrusted sender.' },
  );
  ipcMain.handle('kryvex:capture:copy', (event, data: unknown) =>
    isShellSender(event) ? captureTools.copy(data) : false,
  );
  ipcMain.handle('kryvex:capture:reveal', (event, target: unknown) =>
    isShellSender(event) ? captureTools.reveal(target) : false,
  );
  // File Forge and Canvas: the bytes stay in the renderer, and this is the only
  // place a path, a name or a rename comes from. Nothing here accepts a path the
  // user did not choose in a dialog of this session.
  ipcMain.handle('kryvex:files:pick', (event, request: unknown) =>
    isShellSender(event) ? fileKit.pick(request) : { ok: false, files: [] },
  );
  ipcMain.handle('kryvex:files:save', (event, request: unknown) =>
    isShellSender(event) ? fileKit.save(request) : { ok: false, saved: [] },
  );
  ipcMain.handle('kryvex:files:rename', (event, request: unknown) =>
    isShellSender(event) ? fileKit.rename(request) : { ok: false, renamed: [] },
  );
  ipcMain.handle('kryvex:files:reveal', (event, target: unknown) =>
    isShellSender(event) ? fileKit.reveal(target) : false,
  );
  ipcMain.handle('kryvex:files:copy-text', (event, text: unknown) =>
    isShellSender(event) ? fileKit.copyText(text) : false,
  );
  // A preview gets a window of its own, built from the same bytes the save path
  // already validates. The window's own actions are registered by its module.
  captureWindow.registerIpc();
  ipcMain.handle('kryvex:capture:preview', (event, request: unknown) =>
    isShellSender(event) ? captureWindow.open(request) : { ok: false, message: 'Untrusted sender.' },
  );
  ipcMain.handle('kryvex:weather:lookup', (event, city: unknown, unit: unknown) =>
    isShellSender(event) ? weather.lookup(city, unit) : { ok: false, error: 'invalid' },
  );
  ipcMain.handle('kryvex:weather:at', (event, latitude: unknown, longitude: unknown, unit: unknown) =>
    isShellSender(event) ? weather.at(latitude, longitude, unit) : { ok: false, error: 'invalid' },
  );
  // The origin chip: the site's own host is resolved here, then its address is
  // described by a keyless registry. Only a host and an address leave, and the
  // answer is cached per host, so a reload asks nothing.
  ipcMain.handle('kryvex:origin:server', (event, url: unknown, refresh: unknown) =>
    isShellSender(event) ? serverOrigin.lookup(url, refresh) : { ok: false, error: 'invalid' },
  );
  // Playlist pages are fetched here so the renderer never needs a CORS proxy
  // or credentials. Only normalized track rows cross the bridge.
  ipcMain.handle('kryvex:playlist:resolve', (event, url: unknown) =>
    isShellSender(event) ? playlistImporter.resolve(url) : { ok: false, error: 'unavailable' },
  );
  ipcMain.handle('kryvex:player:embed-url', (event, videoId: unknown, autoplay: unknown) =>
    isShellSender(event) ? playerEmbed.url(videoId, autoplay) : null,
  );
  // Visual and audio work stays local: these two only reach the address the user
  // typed into Lexium's engine panel.
  ipcMain.handle('kryvex:lexium:transcribe', (event, request: unknown) =>
    isShellSender(event) ? lexiumProxy.transcribe(request) : { ok: false, error: 'invalid' },
  );
  ipcMain.handle('kryvex:lexium:probe', (event, request: unknown) =>
    isShellSender(event) ? lexiumProxy.probe(request) : { ok: false, error: 'invalid' },
  );
  // The local Whisper server. The renderer names a model id from the reviewed
  // catalogue and nothing else: no URL, host or path crosses this boundary, and
  // an untrusted sender only ever gets the status back.
  ipcMain.handle('kryvex:speech:status', () => speech.status());
  ipcMain.handle('kryvex:speech:install', (event, model: unknown) =>
    isShellSender(event) ? speech.install(model) : speech.status(),
  );
  ipcMain.handle('kryvex:speech:start', (event, model: unknown) =>
    isShellSender(event) ? speech.start(model) : speech.status(),
  );
  ipcMain.handle('kryvex:speech:stop', event =>
    isShellSender(event) ? speech.stop() : speech.status(),
  );
  ipcMain.handle('kryvex:speech:remove', (event, model: unknown) =>
    isShellSender(event) ? speech.remove(model) : speech.status(),
  );
  ipcMain.handle('kryvex:speech:cancel', event => (isShellSender(event) ? speech.cancel() : false));
  // The second emulator engine. The renderer can install, read the status, ask
  // for the verified bytes or remove the copy; it cannot name a URL, a host or
  // a path, so this cannot become a general downloader.
  ipcMain.handle('kryvex:flycast:status', () => flycast.status());
  ipcMain.handle('kryvex:flycast:install', event =>
    isShellSender(event) ? flycast.install() : flycast.status(),
  );
  ipcMain.handle('kryvex:flycast:core', event =>
    isShellSender(event) ? flycast.payload() : null,
  );
  ipcMain.handle('kryvex:flycast:remove', event =>
    isShellSender(event) ? flycast.remove() : flycast.status(),
  );
  ipcMain.handle('kryvex:flycast:cancel', event =>
    isShellSender(event) ? flycast.cancel() : false,
  );
  // Real netplay: start the RetroArch the user already installed, as host or
  // guest. The dialog is the only way a path enters the main process, so the
  // renderer cannot name an executable.
  ipcMain.handle('kryvex:retroarch:status', () => retroarch.status());
  ipcMain.handle('kryvex:retroarch:locate', async event => {
    if (!isShellSender(event) || !mainWindow) return retroarch.status();
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: 'Where is RetroArch?',
      properties: ['openFile'],
      filters: [{ name: 'RetroArch', extensions: ['exe'] }],
    });
    const file = picked.canceled ? undefined : picked.filePaths[0];
    return file ? retroarch.useExecutable(file) : retroarch.status();
  });
  ipcMain.handle('kryvex:emulator:folder', (_event, kind: unknown) => emulatorLibrary.read(kind));
  ipcMain.handle('kryvex:emulator:pick', async (event, kind: unknown) =>
    isShellSender(event) ? emulatorLibrary.pick(kind) : emulatorLibrary.read(kind),
  );
  ipcMain.handle('kryvex:emulator:read', (event, file: unknown) =>
    // The renderer names the file; the library refuses anything outside a
    // folder that was picked.
    isShellSender(event) ? emulatorLibrary.readFile(file) : { ok: false, name: '', code: 'not-picked' },
  );
  ipcMain.handle('kryvex:retroarch:forget', event =>
    isShellSender(event) ? retroarch.forget() : retroarch.status(),
  );
  ipcMain.handle('kryvex:retroarch:start', (event, input: unknown) =>
    isShellSender(event) ? retroarch.start(normalizeRetroarchStart(input)) : retroarch.status(),
  );
  ipcMain.handle('kryvex:retroarch:stop', event =>
    isShellSender(event) ? retroarch.stop() : retroarch.status(),
  );
  ipcMain.handle('kryvex:speech:autostart', (event, enabled: unknown) =>
    isShellSender(event) ? speech.setAutostart(enabled) : speech.status(),
  );
  // Kryvex Link: the phone companion. The renderer owns the on/off setting and
  // asks for everything else; the pairing code, tokens and file names stay in
  // the main process, so the shell can never mint a device of its own.
  ipcMain.handle('kryvex:link:status', (event) => (isShellSender(event) ? link.status() : null));
  ipcMain.handle('kryvex:link:configure', (event, patch: unknown) =>
    isShellSender(event)
      ? link.configure(
          patch && typeof patch === 'object' ? (patch as { enabled?: unknown }) : {},
        )
      : null,
  );
  ipcMain.handle('kryvex:link:code', (event) => (isShellSender(event) ? link.newCode() : null));
  ipcMain.handle('kryvex:link:revoke', (event, token: unknown) =>
    isShellSender(event) ? link.revoke(token) : false,
  );
  ipcMain.handle('kryvex:link:revoke-all', (event) =>
    isShellSender(event) ? link.revokeAll() : false,
  );
  ipcMain.handle('kryvex:link:offer', (event) => (isShellSender(event) ? link.offer() : null));
  ipcMain.handle('kryvex:link:remove', (event, id: unknown, deleteFile: unknown) =>
    isShellSender(event) ? link.removeFile(id, deleteFile) : null,
  );
  ipcMain.handle('kryvex:link:clear', (event, deleteFiles: unknown) =>
    isShellSender(event) ? link.clearReceived(deleteFiles) : null,
  );
  ipcMain.handle('kryvex:link:reveal', (event, id: unknown) =>
    isShellSender(event) ? link.reveal(id) : false,
  );
  ipcMain.handle('kryvex:link:open', (event, id: unknown) =>
    isShellSender(event) ? link.open(id) : false,
  );
  ipcMain.handle('kryvex:link:notify', (event, title: unknown, body: unknown) => {
    if (!isShellSender(event)) return false;
    link.notify(typeof title === 'string' ? title : '', typeof body === 'string' ? body : '');
    return true;
  });
  ipcMain.handle('kryvex:resources:sample', (event, services: unknown) =>
    isShellSender(event) ? resources.sample(services) : null,
  );
  ipcMain.handle('kryvex:media:list', (event) =>
    isShellSender(event) ? media.list() : [],
  );
  ipcMain.handle('kryvex:media:control', (event, id: unknown, action: unknown) =>
    isShellSender(event) ? media.control(id, action) : false,
  );
  ipcMain.handle('kryvex:media:volume', (event, volume: unknown) =>
    isShellSender(event) ? media.setPageVolume(volume) : 1,
  );
  ipcMain.handle('kryvex:media:repeat', (event, repeat: unknown) =>
    isShellSender(event) ? media.setPageRepeat(repeat) : false,
  );
  ipcMain.handle('kryvex:spotify:guard', (event, enabled: unknown) =>
    isShellSender(event) ? spotifyAds.setEnabled(enabled) : false,
  );
  // Virtual LAN is read-only: the shell asks which tunnel addresses this
  // machine already has. There is no handler that creates an adapter, changes
  // a route or starts an engine, because Kryvex does none of those.
  ipcMain.handle('kryvex:vlan:status', (event) =>
    isShellSender(event) ? vlanStatus() : emptyVlanStatus(),
  );
  ipcMain.handle('kryvex:vpn:status', (event) => (isShellSender(event) ? vpn.status() : null));
  ipcMain.handle('kryvex:vpn:configure', (event, settings: unknown) =>
    isShellSender(event) ? vpn.configure(settings) : null,
  );
  ipcMain.handle('kryvex:vpn:choose-binary', (event) =>
    isShellSender(event) ? vpn.chooseBinary(mainWindow) : null,
  );
  ipcMain.handle('kryvex:vpn:choose-config', (event) =>
    isShellSender(event) ? vpn.chooseConfig(mainWindow) : null,
  );
  ipcMain.handle('kryvex:vpn:connect', (event) =>
    isShellSender(event) ? vpn.connect() : null,
  );
  ipcMain.handle('kryvex:vpn:disconnect', (event) =>
    isShellSender(event) ? vpn.disconnect() : null,
  );
  ipcMain.on('kryvex:attention', (event, active: unknown) => {
    if (!isShellSender(event) || !mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.flashFrame(Boolean(active));
  });
  ipcMain.handle('kryvex:popups:list', (event) => (isShellSender(event) ? popupTabs.list() : []));
  ipcMain.on('kryvex:popups:canvas', (event, rect: unknown) => {
    if (!isShellSender(event)) return;
    popupTabs.setCanvas(isPopupRect(rect) ? rect : null);
  });
  ipcMain.handle('kryvex:popups:show', (event, id: unknown) =>
    isShellSender(event) ? popupTabs.show(id) : false,
  );
  ipcMain.handle('kryvex:popups:hide', (event, id: unknown) =>
    isShellSender(event) ? popupTabs.hide(id) : false,
  );
  ipcMain.handle('kryvex:popups:hide-all', (event) => {
    if (!isShellSender(event)) return false;
    popupTabs.hideAll();
    return true;
  });
  ipcMain.handle('kryvex:popups:close', (event, id: unknown) =>
    isShellSender(event) ? popupTabs.close(id) : false,
  );
  ipcMain.handle('kryvex:popups:action', (event, id: unknown, action: unknown) =>
    isShellSender(event) ? popupTabs.action(id, action) : false,
  );
  ipcMain.handle('kryvex:browser:clear-tab', async (event, partition: unknown) => {
    if (!isShellSender(event) || typeof partition !== 'string' || !BROWSER_PARTITION.test(partition)) {
      return false;
    }
    try {
      const ses = session.fromPartition(partition);
      await ses.clearStorageData();
      await ses.clearCache();
      return true;
    } catch {
      return false;
    }
  });
  registerPartyIpc();

  ipcMain.handle('kryvex:chromium:info', (event) => (isShellSender(event) ? engineInfo() : null));
  ipcMain.handle('kryvex:chromium:set', (event, raw: unknown) => {
    if (!isShellSender(event)) return null;
    setChromium(raw);
    return engineInfo();
  });
  ipcMain.handle('kryvex:app:info', (event) =>
    isShellSender(event)
      ? {
          version: app.getVersion(),
          platform: process.platform,
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node,
          packaged: app.isPackaged,
        }
      : null,
  );
  ipcMain.handle('kryvex:open-external', async (event, url: unknown) => {
    if (!isShellSender(event) || !isSafeUrl(url)) return false;
    await shell.openExternal(url);
    return true;
  });
  ipcMain.handle('kryvex:update:status', (event) =>
    isShellSender(event) ? updater.status() : null,
  );
  ipcMain.handle('kryvex:update:check', (event) =>
    isShellSender(event) ? updater.check() : null,
  );
  ipcMain.handle('kryvex:update:download', (event) =>
    isShellSender(event) ? updater.download() : null,
  );
  ipcMain.handle('kryvex:update:install', (event) =>
    isShellSender(event) ? updater.install() : false,
  );
  ipcMain.handle('kryvex:update:reveal', (event) =>
    isShellSender(event) ? updater.reveal() : false,
  );
  ipcMain.handle('kryvex:update:release-page', (event) => {
    if (!isShellSender(event)) return false;
    updater.openRelease();
    return true;
  });
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Development-only screenshot pass used to keep the README honest. It drives
 * the real renderer through its routes and captures the actual window.
 */
async function runCapture(win: BrowserWindow): Promise<void> {
  const dir = process.env.KRYVEX_CAPTURE_DIR || path.join(process.cwd(), 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  const shots: Array<{
    name: string;
    hash: string;
    wait?: number;
    scroll?: 'bottom' | string;
    block?: 'start' | 'center' | 'end';
    click?: string;
  }> = [
    { name: 'home', hash: '#/home' },
    { name: 'help', hash: '#/home?help=1' },
    { name: 'rooms', hash: '#/rooms', click: '[data-shot="create-room"]', wait: 2400 },
    { name: 'services', hash: '#/services' },
    { name: 'add-service', hash: '#/services?dialog=new' },
    { name: 'service', hash: '#/service/s-starter-1', wait: 5000 },
    { name: 'browser', hash: '#/browser?newtab=1', wait: 1200 },
    { name: 'browser-downloads', hash: '#/browser?newtab=1&panel=downloads', wait: 1200 },
    {
      name: 'browser-history',
      hash: '#/browser?url=https%3A%2F%2Fexample.com&panel=history',
      wait: 2500,
    },
    { name: 'settings', hash: '#/settings' },
    {
      name: 'settings-themes',
      hash: '#/settings',
      click: '#themes .settings-block-toggle',
      scroll: '#themes',
      wait: 1100,
    },
    {
      name: 'settings-reds',
      hash: '#/settings',
      scroll: 'button[title="Crimson"]',
      block: 'center',
    },
    {
      name: 'settings-gems',
      hash: '#/settings',
      scroll: '[data-family="gem"]',
      block: 'start',
    },
    {
      name: 'settings-planets',
      hash: '#/settings',
      scroll: '[data-family="planet"]',
      block: 'start',
    },
    {
      name: 'settings-custom',
      hash: '#/settings',
      click: '.theme-card.is-custom',
      scroll: '.custom-theme-panel',
    },
    { name: 'theme-gallery', hash: '#/settings', scroll: '#theme-gallery', block: 'start' },
    {
      name: 'settings-home',
      hash: '#/settings',
      click: '#home-board .settings-block-toggle',
      scroll: '#home-board',
      wait: 1100,
    },
    {
      name: 'settings-network',
      hash: '#/settings',
      click: '#network .settings-block-toggle',
      scroll: '#network',
      wait: 1100,
    },
    { name: 'emulator', hash: '#/emulator', wait: 1100 },
    {
      name: 'resources',
      hash: '#/home',
      click: '[title="Open the resource manager"]',
      wait: 2600,
    },
    { name: 'settings-updates', hash: '#/settings?section=updates', scroll: '#updates' },
    { name: 'settings-data', hash: '#/settings', scroll: '.download-location-copy' },
    { name: 'settings-shield', hash: '#/settings', scroll: '.shield-panel' },
    { name: 'settings-my-filters', hash: '#/settings', scroll: '.custom-filters', block: 'start' },
    { name: 'settings-local-model', hash: '#/settings', scroll: '.local-model-block', block: 'start' },
    {
      name: 'settings-browser',
      hash: '#/settings',
      scroll: '.browser-settings-panel',
      block: 'center',
    },
    { name: 'settings-chromium', hash: '#/settings', scroll: '#chromium', block: 'start' },
    { name: 'settings-wallpaper', hash: '#/settings', scroll: '.wallpaper-panel' },
    {
      name: 'settings-xion',
      hash: '#/settings',
      click: '[data-theme="special-xion"]',
      wait: 1200,
      scroll: '[data-theme="special-xion"]',
    },
    { name: 'settings-about', hash: '#/settings', scroll: 'bottom' },
    { name: 'donkey-theme', hash: '#/home?theme=special-donkey' },
    { name: 'xion-theme', hash: '#/home?theme=special-xion', wait: 1200 },
    { name: 'command-palette', hash: '#/home?palette=1' },
    { name: 'light-theme', hash: '#/home?theme=kryvex-light' },
  ];

  // `KRYVEX_CAPTURE_ONLY` re-shoots one or two panels without rewriting the
  // rest of the gallery.
  const only = (process.env.KRYVEX_CAPTURE_ONLY ?? '')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);
  const selected = only.length > 0 ? shots.filter(shot => only.includes(shot.name)) : shots;

  await wait(1200);
  // A fresh profile opens the first-run theme sheet; dismiss it so the
  // captures show the route instead of the onboarding.
  await win.webContents
    .executeJavaScript(`document.querySelector('[data-shot="gallery-skip"]')?.click(); true;`)
    .catch(() => undefined);
  await wait(300);
  for (const shot of selected) {
    await win.webContents.executeJavaScript(
      `window.location.hash = ${JSON.stringify(shot.hash)}; true;`,
    );
    await wait(shot.wait ?? 950);
    if (shot.click) {
      await win.webContents.executeJavaScript(
        `document.querySelector(${JSON.stringify(shot.click)})?.click(); true;`,
      );
      await wait(350);
    }
    if (shot.scroll === 'bottom') {
      await win.webContents.executeJavaScript(
        `document.querySelector('.app-main').scrollTop = 999999; true;`,
      );
      await wait(350);
    } else if (shot.scroll) {
      await win.webContents.executeJavaScript(
        `document.querySelector(${JSON.stringify(shot.scroll)})?.scrollIntoView({ block: ${JSON.stringify(shot.block ?? 'start')} }); true;`,
      );
      await wait(350);
    }
    const probe = await win.webContents
      .executeJavaScript(
        `(() => { const w = document.querySelector('webview'); if (!w) return null;
          try { return { url: w.getURL(), loading: w.isLoading(), src: w.getAttribute('src') }; }
          catch (error) { return { error: String(error) }; } })()`,
      )
      .catch((error: unknown) => ({ error: String(error) }));
    const selector =
      shot.scroll && shot.scroll !== 'bottom' ? JSON.stringify(shot.scroll) : 'null';
    const scroll = await win.webContents
      .executeJavaScript(
        `(() => { const main = document.querySelector('.app-main');
          const target = ${selector} ? document.querySelector(${selector}) : null;
          return { top: main ? main.scrollTop : null, max: main ? main.scrollHeight - main.clientHeight : null,
            targetTop: target ? Math.round(target.getBoundingClientRect().top) : null }; })()`,
      )
      .catch((error: unknown) => ({ error: String(error) }));
    // eslint-disable-next-line no-console
    console.log(`probe ${shot.name}: ${JSON.stringify(probe)} scroll: ${JSON.stringify(scroll)}`);
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, `${shot.name}.png`), image.toPNG());
    // eslint-disable-next-line no-console
    console.log(`captured ${shot.name}.png`);
  }
  app.quit();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // A Windows toast activation can start the registered shortcut again. The
    // lock rejects the duplicate process, so bring the running window forward
    // instead of leaving the click looking ignored.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
    for (const url of defaultBrowser.acceptArgv(argv)) defaultBrowser.queueUrl(url);
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    defaultBrowser.queueUrl(url);
  });

  app.whenReady().then(async () => {
    for (const url of defaultBrowser.acceptArgv(process.argv)) defaultBrowser.queueUrl(url);
    shield.init();
    // The location config must be loaded before downloads or torrents read
    // their roots for the first time.
    initStorage();
    downloads.init();
    // Restore only the display rows here; WebTorrent is created on Resume.
    torrents.init();
    localModel.init();
    speech.init();
    // Pairing tokens and the transfer log outlive a restart, so they load
    // before anything can ask for the link's status.
    link.init();
    modelManager.init();
    extensions.init(session.defaultSession);
    hardenSession(session.defaultSession);
    shield.trackSession(session.defaultSession);
    downloads.trackSession(session.defaultSession);
    hardenWebContents();
    partyInit();
    // The YouTube bridge needs an http origin; a file:// shell gets Error 153.
    await playerEmbed.start().catch(() => undefined);
    registerIpc();
    updater.init();
    // Register the Windows activation hook before the first toast can appear.
    notifications.init();

    mainWindow = createWindow();
    notifications.attachWindow(mainWindow);
    media.attachWindow(mainWindow);
    link.attachWindow(mainWindow);
    captureTools.attachWindow(mainWindow);
    fileKit.attachWindow(mainWindow);
    partyAttachWindow(mainWindow);
    extensions.attachWindow(mainWindow);
    userscripts.attachWindow(mainWindow);
    updater.attachWindow(mainWindow);
    modelManager.attachWindow(mainWindow);
    assistant.attachWindow(mainWindow);
    downloads.attachWindow(mainWindow);
    defaultBrowser.attachWindow(mainWindow);
    permissions.attachWindow(mainWindow);
    torrents.attachWindow(mainWindow);
    popupTabs.attachWindow(mainWindow);
    downloads.setTorrentFileHandler(filePath => {
      void torrents.addTorrentFile(filePath).then(result => {
        torrents.notify(result.message, result.ok ? 'success' : 'danger');
      });
    });
    void shield.start();

    if (CAPTURE) {
      mainWindow.webContents.once('did-finish-load', () => {
        void runCapture(mainWindow as BrowserWindow);
      });
    }

    // A user who asked the engine to start with Kryvex gets it before Lexium is
    // ever opened. A capture run is not that: it must not spawn a server.
    if (!CAPTURE) void speech.resume();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
        notifications.attachWindow(mainWindow);
        captureTools.attachWindow(mainWindow);
        fileKit.attachWindow(mainWindow);
        partyAttachWindow(mainWindow);
        updater.attachWindow(mainWindow);
        modelManager.attachWindow(mainWindow);
        assistant.attachWindow(mainWindow);
      }
    });
  });

  // Sign-ins must survive a restart. Chromium writes cookie stores on its own
  // schedule, so a quit right after a module signs in would otherwise lose the
  // session; hold the first quit just long enough to flush, with a hard cap so
  // a wedged store can never trap the app.
  let flushed = false;
  app.on('before-quit', event => {
    playerEmbed.dispose();
    link.dispose();
    // A session Kryvex started must not outlive it.
    retroarch.dispose();
    void torrents.shutdown();
    if (flushed) return;
    event.preventDefault();
    flushed = true;
    // The speech engine is a child process: quit waits for it to be gone
    // rather than for the kill to have been sent, so a second launch does not
    // find a server already holding its port.
    void Promise.race([
      Promise.all([serviceSessions.flush(), speech.dispose(), localModel.dispose()]).then(
        () => undefined,
      ),
      new Promise(resolve => setTimeout(resolve, 1500)),
    ]).then(() => app.quit());
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
