import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const DEV_URL = process.env.KRYVEX_DEV_URL;
const CAPTURE = process.env.KRYVEX_CAPTURE === '1';
const STATE_FILE = 'kryvex-state.json';
const MAX_STATE_BYTES = 1024 * 1024;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const SAFE_PARTITION = /^persist:(svc|browser)-[a-z0-9-]{1,64}$/i;

let mainWindow: BrowserWindow | null = null;

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
    contents.setWindowOpenHandler(({ url }) => {
      if (isSafeUrl(url)) {
        void shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    contents.on('will-navigate', (event, url) => {
      if (contents.getType() === 'webview' && !isSafeUrl(url)) {
        event.preventDefault();
      }
    });

    if (contents.getType() === 'webview') {
      const ses = contents.session;
      ses.setPermissionRequestHandler((_wc, permission, callback) => {
        callback(permission === 'clipboard-sanitized-write' || permission === 'fullscreen');
      });
      ses.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-sanitized-write');
    }
  });
}

function createWindow(): BrowserWindow {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icons', 'kryvex-256.png')
    : path.join(__dirname, '..', 'brand', 'icons', 'kryvex-256.png');

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
    if (isSafeUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL();
    if (url !== current) {
      // The shell must never navigate away from the app bundle.
      event.preventDefault();
      if (isSafeUrl(url)) {
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
    if (!isSafeUrl(params.src) || !SAFE_PARTITION.test(params.partition ?? '')) {
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

function registerIpc(): void {
  ipcMain.handle('kryvex:state:load', () => readState());
  ipcMain.handle('kryvex:state:save', (_event, state: unknown) => writeState(state));
  ipcMain.handle('kryvex:app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    packaged: app.isPackaged,
  }));
  ipcMain.handle('kryvex:open-external', async (_event, url: unknown) => {
    if (!isSafeUrl(url)) return false;
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
  const shots: Array<{ name: string; hash: string; wait?: number; scroll?: 'bottom' }> = [
    { name: 'home', hash: '#/home' },
    { name: 'services', hash: '#/services' },
    { name: 'add-service', hash: '#/services?dialog=new' },
    { name: 'service', hash: '#/service/s-starter-1', wait: 5000 },
    { name: 'browser', hash: '#/browser?newtab=1', wait: 1200 },
    { name: 'settings', hash: '#/settings' },
    { name: 'settings-about', hash: '#/settings', scroll: 'bottom' },
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
    }
    const probe = await win.webContents
      .executeJavaScript(
        `(() => { const w = document.querySelector('webview'); if (!w) return null;
          try { return { url: w.getURL(), loading: w.isLoading(), src: w.getAttribute('src') }; }
          catch (error) { return { error: String(error) }; } })()`,
      )
      .catch((error: unknown) => ({ error: String(error) }));
    // eslint-disable-next-line no-console
    console.log(`probe ${shot.name}: ${JSON.stringify(probe)}`);
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
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    hardenWebContents();
    registerIpc();
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'clipboard-sanitized-write');
    });

    mainWindow = createWindow();

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

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
