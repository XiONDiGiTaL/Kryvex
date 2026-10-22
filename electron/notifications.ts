import { app, Notification, type BrowserWindow } from 'electron';
import { notificationAppId } from './notification-rules';

/**
 * Owns the Windows notification identity and activation handling.
 *
 * The AppUserModelID is set before the first window because Windows groups
 * taskbar buttons and toasts by it. Packaged builds use the identity owned by
 * the installer's Start Menu shortcut. A source checkout gets a separate one:
 * Electron's development shortcut (`Electron.lnk`) targets the bare binary, and
 * sharing the packaged ID would make Windows attribute installed-app toasts to
 * that shortcut as well.
 */
class NotificationHost {
  private window: BrowserWindow | null = null;
  private initialized = false;
  private focusWhenReady = false;

  /** Call before `app.whenReady()` so the identity is in place early. */
  configure(packaged = app.isPackaged): void {
    if (process.platform !== 'win32') return;
    app.setAppUserModelId(notificationAppId(packaged));
  }

  /** Registers the Windows activation hook once the app is ready. */
  init(): boolean {
    if (process.platform !== 'win32') return false;
    if (this.initialized) return true;
    this.initialized = true;
    try {
      // A page notification click normally goes back to Chromium. This catches
      // Action Center clicks and cold-start activations too, so the running
      // app comes forward instead of looking unresponsive.
      Notification.handleActivation(() => this.focus());
      return true;
    } catch {
      this.initialized = false;
      return false;
    }
  }

  attachWindow(win: BrowserWindow): void {
    this.window = win;
    win.once('closed', () => {
      if (this.window === win) this.window = null;
    });
    if (this.focusWhenReady) {
      this.focusWhenReady = false;
      void Promise.resolve().then(() => this.focus());
    }
  }

  focus(): void {
    const win = this.window;
    if (!win || win.isDestroyed()) {
      this.focusWhenReady = true;
      return;
    }
    try {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
      win.flashFrame(false);
    } catch {
      /* the window may be closing while the toast is clicked */
    }
  }
}

export const notifications = new NotificationHost();
