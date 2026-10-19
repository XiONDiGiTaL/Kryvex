import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { defaultBrowser } from './default-browser';
import { downloads } from './downloads';
import { extensions } from './extensions';
import { configurePrivacySwitches, hardenSession } from './hardening';
import { permissions } from './permissions';
import { isSafePartition } from './privacy';
import { shield } from './shield';
import { isMagnetLink } from './torrent-rules';
import { torrents } from './torrents';
import { webPrivacy } from './web-privacy';
import type { TorrentResult } from './types';

const DEV_URL = process.env.KRYVEX_DEV_URL;
const CAPTURE = process.env.KRYVEX_CAPTURE === '1';
const STATE_FILE = 'kryvex-state.json';
const MAX_STATE_BYTES = 1024 * 1024;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const APP_ID = 'net.xiondigital.kryvex';
const BROWSER_PARTITION = /^browser-[a-z0-9-]{1,64}$/i;

// Windows groups taskbar entries and notifications by AppUserModelID. Setting
// it (and the process name) keeps Kryvex from presenting as the generic
// Electron host in the shell; packaged builds also carry the branded exe icon.
app.setName('Kryvex');
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

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

let mainWindow: BrowserWindow | null = null;

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
      // Only remote content gets the farbling preload; the trusted shell is
      // never patched.
      webPrivacy.ensureSession(contents.session, true);
    }

    contents.setWindowOpenHandler(({ url }) => {
      if (isMagnetLink(url)) {
        forwardMagnet(url);
      } else if (isSafeUrl(url)) {
        void shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    contents.on('will-navigate', (event, url) => {
      if (isMagnetLink(url)) {
        event.preventDefault();
        forwardMagnet(url);
        return;
      }
      if (contents.getType() === 'webview' && !isSafeUrl(url)) {
        event.preventDefault();
      }
    });
  });
}

function createWindow(): BrowserWindow {
  const iconFile = process.platform === 'win32' ? 'kryvex.ico' : 'kryvex-512.png';
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icons', iconFile)
    : path.join(__dirname, '..', 'brand', 'icons', iconFile);

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
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

  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete (webPreferences as { preload?: string }).preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    if (!isSafeUrl(params.src) || !isSafePartition(params.partition ?? '')) {
      event.preventDefault();
    }
  });

  if (DEV_URL) {
    void win.loadURL(DEV_URL);
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

function isShellSender(event: Electron.IpcMainInvokeEvent): boolean {
  return Boolean(mainWindow && event.sender === mainWindow.webContents);
}

function torrentResult(ok: boolean, message: string): TorrentResult {
  return { ok, message, records: [] };
}

function registerIpc(): void {
  ipcMain.handle('kryvex:state:load', (event) => (isShellSender(event) ? readState() : null));
  ipcMain.handle('kryvex:state:save', (event, state: unknown) =>
    isShellSender(event) ? writeState(state) : false,
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
  ipcMain.handle('kryvex:downloads:list', (event) => (isShellSender(event) ? downloads.list() : []));
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
  }> = [
    { name: 'home', hash: '#/home' },
    { name: 'help', hash: '#/home?help=1' },
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
    { name: 'settings-shield', hash: '#/settings', scroll: '.shield-panel' },
    {
      name: 'settings-browser',
      hash: '#/settings',
      scroll: '.browser-settings-panel',
      block: 'center',
    },
    { name: 'settings-plugins', hash: '#/settings', scroll: '.plugin-card' },
    { name: 'settings-about', hash: '#/settings', scroll: 'bottom' },
    { name: 'donkey-theme', hash: '#/home?theme=special-donkey' },
    { name: 'command-palette', hash: '#/home?palette=1' },
    { name: 'light-theme', hash: '#/home?theme=kryvex-light' },
  ];

  await wait(1200);
  for (const shot of shots) {
    await win.webContents.executeJavaScript(
      `window.location.hash = ${JSON.stringify(shot.hash)}; true;`,
    );
    await wait(shot.wait ?? 950);
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
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
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
    downloads.init();
    // Restore only the display rows here; WebTorrent is created on Resume.
    torrents.init();
    extensions.init(session.defaultSession);
    hardenSession(session.defaultSession);
    shield.trackSession(session.defaultSession);
    downloads.trackSession(session.defaultSession);
    hardenWebContents();
    registerIpc();

    mainWindow = createWindow();
    extensions.attachWindow(mainWindow);
    downloads.attachWindow(mainWindow);
    defaultBrowser.attachWindow(mainWindow);
    permissions.attachWindow(mainWindow);
    torrents.attachWindow(mainWindow);
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

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
    });
  });

  app.on('before-quit', () => {
    void torrents.shutdown();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
