/**
 * Guards for Electron objects that may already be destroyed.
 *
 * A destroyed `BrowserWindow` or `WebContents` still answers `isDestroyed()`,
 * but every other read throws `Object has been destroyed`: `win.webContents`,
 * `win.getTitle()`, `contents.getURL()`, `contents.mainFrame`. Reading one of
 * those inside a `closed`/`destroyed` listener, or in a callback that resumed
 * after the window went away, throws out of the listener and Electron turns it
 * into the "A JavaScript error occurred in the main process" dialog.
 *
 * The rule these helpers exist to enforce: ask `isDestroyed()` (or hold a
 * reference captured while the object was alive) and never read a property of a
 * window that may have closed. Only `import type` is used here, so the module
 * is pure and unit-tested.
 */

interface Destroyable {
  isDestroyed(): boolean;
}

function alive(value: Destroyable | null | undefined): boolean {
  if (!value) return false;
  try {
    return !value.isDestroyed();
  } catch {
    // A wrapper that is too far gone to answer counts as gone.
    return false;
  }
}

export function isAliveWindow<T extends Destroyable>(win: T | null | undefined): win is T {
  return alive(win);
}

export function isAliveContents<T extends Destroyable>(contents: T | null | undefined): contents is T {
  return alive(contents);
}
