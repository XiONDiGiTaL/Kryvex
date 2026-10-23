import {
  desktopCapturer,
  ipcMain,
  session,
  webContents,
  type BrowserWindow,
  type WebContents,
} from 'electron';
import { isAliveContents } from './lifecycle';
import type { PartySource } from './types';

/**
 * Rooms capture broker.
 *
 * A remote page must never be able to start a screen share. The shell renderer
 * picks a source, tells this module which one, and only then asks the browser
 * for a display stream; the display-media handler grants exactly that pending
 * choice, once, from the shell frame and within a short window. Everything
 * else is denied. Kryvex app sources are captured as a page frame, so the
 * sharer can hand over a single service instead of a whole desktop.
 */

let shell: WebContents | null = null;
let pending: { id: string; audio: boolean; at: number } | null = null;

const PENDING_TTL_MS = 15_000;
const APP_ID = /^app:(\d{1,10})$/;
const DESKTOP_ID = /^(screen|window):[^\s:]+(?::\d+)?$/;

export function partyAttachWindow(win: BrowserWindow): void {
  shell = win.webContents;
  // `closed` arrives after the window is gone, and reading `win.webContents`
  // there throws "Object has been destroyed": Electron turns that into the
  // "A JavaScript error occurred in the main process" dialog on quit. Keep the
  // reference taken at attach time and compare against it instead.
  const attached = shell;
  win.once('closed', () => {
    if (shell === attached) shell = null;
    pending = null;
  });
}

function isShell(contents: WebContents | null | undefined): boolean {
  return Boolean(contents && shell && contents === shell);
}

function safeTitle(contents: WebContents): string {
  try {
    const title = contents.getTitle().trim();
    if (title) return title.slice(0, 80);
    const url = contents.getURL();
    return url ? new URL(url).hostname : 'Kryvex app';
  } catch {
    return 'Kryvex app';
  }
}

function safeDetail(contents: WebContents): string {
  try {
    return contents.getURL().slice(0, 200);
  } catch {
    return '';
  }
}

/** Screens, windows and each open service or browser page, ready to pick. */
async function listSources(): Promise<PartySource[]> {
  const apps: PartySource[] = [];
  for (const contents of webContents.getAllWebContents()) {
    // Ask about destruction first: `getType()` throws on a gone guest.
    if (!isAliveContents(contents) || contents.getType() !== 'webview') continue;
    apps.push({
      id: `app:${contents.id}`,
      kind: 'app',
      name: safeTitle(contents),
      detail: safeDetail(contents),
    });
  }

  let desktop: PartySource[] = [];
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: false,
    });
    desktop = sources.map(source => ({
      id: source.id,
      kind: source.id.startsWith('screen:') ? 'screen' : 'window',
      name: source.name || 'Window',
      thumbnail:
        source.thumbnail.isEmpty() || source.thumbnail.getSize().width === 0
          ? undefined
          : source.thumbnail.toDataURL(),
    }));
  } catch {
    // A locked-down session can refuse enumeration; the app list still works.
    desktop = [];
  }

  return [...apps, ...desktop];
}

/** True while the shell has armed a source but not yet asked for the stream. */
export function partyHasPendingPick(): boolean {
  return Boolean(pending && Date.now() - pending.at <= PENDING_TTL_MS);
}

/** Remembers one selection for the next display-media request from the shell. */
function selectSource(id: string, audio: boolean): boolean {
  if (!APP_ID.test(id) && !DESKTOP_ID.test(id)) return false;
  pending = { id, audio, at: Date.now() };
  return true;
}

export function partyInit(): void {
  const ses = session.defaultSession;
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    const pick = pending;
    pending = null;
    if (!pick || Date.now() - pick.at > PENDING_TTL_MS) {
      callback({});
      return;
    }
    // The shell is the only trusted frame; a webview request is refused even
    // if a stale pending pick exists. A shell that already closed cannot own a
    // stream, and reading `mainFrame` off it would throw.
    const shellContents = shell;
    if (!isAliveContents(shellContents)) {
      callback({});
      return;
    }
    const frame = request.frame;
    let shellFrame = null;
    try {
      shellFrame = shellContents.mainFrame;
    } catch {
      callback({});
      return;
    }
    if (frame && frame !== shellFrame) {
      callback({});
      return;
    }
    if (!request.videoRequested) {
      callback({});
      return;
    }

    const app = APP_ID.exec(pick.id);
    if (app) {
      const contents = webContents.fromId(Number(app[1]));
      if (!isAliveContents(contents) || contents.getType() !== 'webview') {
        callback({});
        return;
      }
      callback({
        video: contents.mainFrame,
        ...(pick.audio ? { audio: contents.mainFrame } : {}),
      });
      return;
    }

    if (!DESKTOP_ID.test(pick.id)) {
      callback({});
      return;
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 0, height: 0 },
      });
      const source = sources.find(item => item.id === pick.id);
      if (!source) {
        callback({});
        return;
      }
      callback({
        video: source,
        // Windows can share system audio; other platforms refuse it and the
        // renderer keeps the video-only stream.
        ...(pick.audio ? { audio: 'loopback' as const } : {}),
      });
    } catch {
      callback({});
    }
  });
}

export function registerPartyIpc(): void {
  ipcMain.handle('kryvex:party:sources', async (event) => {
    if (!isShell(event.sender)) return [];
    return listSources();
  });
  ipcMain.handle('kryvex:party:select', (event, id: unknown, audio: unknown) => {
    if (!isShell(event.sender) || typeof id !== 'string') return false;
    return selectSource(id, audio === true);
  });
}
