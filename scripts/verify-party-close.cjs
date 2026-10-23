/* eslint-disable no-console */
/**
 * The Rooms broker must not touch the window after it has closed.
 *
 * Run `pnpm build` first. Usage: `node scripts/verify-party-close.cjs`.
 *
 * `partyAttachWindow` used to release its shell reference by comparing against
 * `win.webContents` inside the `closed` handler. Electron destroys the window
 * before that event, so the read threw "Object has been destroyed" and the app
 * raised "A JavaScript error occurred in the main process" on quit.
 *
 * This drives the compiled module with a window that throws on every property
 * access once it is marked destroyed: a stricter stand-in than the real
 * BrowserWindow, which only throws on some properties.
 */
const path = require('node:path');

const { partyAttachWindow } = require(path.join(__dirname, '..', 'dist-electron', 'party.js'));

let destroyed = false;
let closedHandler = null;
const contents = { id: 7, getURL: () => 'https://example.com', getTitle: () => 'Example' };

const target = {
  webContents: contents,
  once(event, handler) {
    if (event === 'closed') closedHandler = handler;
    return this;
  },
};

const win = new Proxy(target, {
  get(object, property, receiver) {
    if (destroyed) throw new TypeError('Object has been destroyed');
    return Reflect.get(object, property, receiver);
  },
});

try {
  partyAttachWindow(win);
  if (typeof closedHandler !== 'function') {
    throw new Error('partyAttachWindow did not subscribe to `closed`.');
  }
  // From here on the window is gone, exactly as it is when `closed` fires.
  destroyed = true;
  closedHandler();
  console.log('rooms close handler: PASS, released the shell without reading the closed window');
} catch (error) {
  console.error('rooms close handler: FAIL:', error.message);
  process.exitCode = 1;
}
