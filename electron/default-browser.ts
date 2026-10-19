import { app, shell, type BrowserWindow } from 'electron';
import type { DefaultBrowserStatus } from './types';
import { registerWindowsBrowser } from './windows-browser';

const pendingUrls: string[] = [];
let mainWindow: BrowserWindow | null = null;

function normalizeIncoming(raw: string): string | null {
  if (raw.length === 0 || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function detail(): string | undefined {
  if (process.platform !== 'win32') {
    return 'Default-browser registration is implemented for Windows.';
  }
  if (!app.isPackaged) {
    return 'Install the Windows build to register Kryvex with Windows Default Apps.';
  }
  return undefined;
}

class DefaultBrowser {
  attachWindow(win: BrowserWindow): void {
    mainWindow = win;
  }

  status(): DefaultBrowserStatus {
    const isDefault =
      process.platform === 'win32' &&
      app.isDefaultProtocolClient('http') &&
      app.isDefaultProtocolClient('https');
    return {
      supported: process.platform === 'win32',
      isDefault,
      canRegister: process.platform === 'win32' && app.isPackaged,
      ...(detail() ? { detail: detail() } : {}),
    };
  }

  setAsDefault(): DefaultBrowserStatus {
    if (!this.status().canRegister) return this.status();
    let registered = false;
    try {
      // Default Apps only lists apps with a RegisteredApplications entry and
      // URL capabilities; protocol commands alone are not enough on Windows 10.
      const capabilities = registerWindowsBrowser(process.execPath);
      const http = app.setAsDefaultProtocolClient('http');
      const https = app.setAsDefaultProtocolClient('https');
      registered = capabilities && http && https;
    } catch {
      registered = false;
    }

    // Windows 10/11 protect the final browser choice. Open Default Apps even
    // when registry registration fails, so the user still has a path forward.
    if (process.platform === 'win32') {
      void shell.openExternal('ms-settings:defaultapps').catch(() => undefined);
    }
    if (!registered) {
      return {
        ...this.status(),
        detail: 'Windows did not accept the registration. Choose Kryvex in Default Apps.',
      };
    }
    return this.status();
  }

  async openSettings(): Promise<boolean> {
    if (process.platform !== 'win32') return false;
    try {
      await shell.openExternal('ms-settings:defaultapps');
      return true;
    } catch {
      return false;
    }
  }

  /** URLs passed by Windows when Kryvex is the default browser. */
  acceptArgv(argv: string[]): string[] {
    const found: string[] = [];
    for (const arg of argv) {
      const url = normalizeIncoming(arg);
      if (url) found.push(url);
    }
    return found;
  }

  queueUrl(raw: string): void {
    const url = normalizeIncoming(raw);
    if (!url) return;
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
      mainWindow.webContents.send('kryvex:browser:open-url', url);
      return;
    }
    pendingUrls.push(url);
  }

  takePendingUrls(): string[] {
    return pendingUrls.splice(0, pendingUrls.length);
  }
}

export const defaultBrowser = new DefaultBrowser();
