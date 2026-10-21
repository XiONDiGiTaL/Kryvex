/* eslint-disable no-console */
/**
 * The folder pickers must refuse a closed window instead of handing it to
 * Electron.
 *
 * Run `pnpm build` first. Usage: `node scripts/verify-window-guards.cjs`.
 *
 * `dialog.showOpenDialog(parent, …)` needs a live parent window; a destroyed
 * one throws "Object has been destroyed", which escapes the IPC handler and
 * becomes the blocking main-process error dialog. The download, extension and
 * torrent pickers therefore ask `isAliveWindow` first and answer with "The main
 * window is not ready."
 *
 * This drives the compiled modules with a window that throws on every property
 * except `isDestroyed()` (the only read Electron still answers after a close)
 * and an Electron stub that records dialog requests. A missing guard shows up
 * twice: the picker throws, or it reaches Electron anyway — `0` dialog calls is
 * part of the pass condition.
 */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Module = require('node:module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-guards-'));
let dialogCalls = 0;

const electronStub = {
  app: {
    getPath: () => root,
    isPackaged: false,
    getVersion: () => '0.0.0-guards',
    getName: () => 'Kryvex',
    on: () => undefined,
  },
  dialog: {
    showOpenDialog: async () => {
      dialogCalls += 1;
      return { canceled: true, filePaths: [] };
    },
  },
  shell: { openExternal: async () => undefined, showItemInFolder: () => undefined },
  BrowserWindow: class {},
};

// The compiled modules import `electron` at load time; under plain Node that
// resolves to a path string, so the stub is installed before they are required.
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return electronStub;
  return load.call(this, request, ...rest);
};

const base = path.join(__dirname, '..', 'dist-electron');
const { chooseDownloadLocation } = require(path.join(base, 'storage.js'));
const { extensions } = require(path.join(base, 'extensions.js'));
const { torrents } = require(path.join(base, 'torrents.js'));

/** A closed window: `isDestroyed()` answers, every other read throws. */
function closedWindow() {
  const target = { isDestroyed: () => true };
  return new Proxy(target, {
    get(object, property) {
      if (property === 'isDestroyed') return object.isDestroyed;
      throw new TypeError('Object has been destroyed');
    },
  });
}

async function main() {
  const failures = [];
  const check = (name, pass, detail) => {
    if (!pass) failures.push(name);
    console.log(`${name}: ${pass ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`);
  };

  // Prove the stand-in is genuinely hostile, so `0` dialog calls below means
  // the guard ran rather than the stub tolerating a read.
  let throwsOnWebContents = false;
  try {
    void closedWindow().webContents;
  } catch {
    throwsOnWebContents = true;
  }
  check('closed window throws on webContents', throwsOnWebContents);

  const location = await chooseDownloadLocation(closedWindow());
  check(
    'download folder picker',
    location.ok === false && /not ready/i.test(location.message),
    JSON.stringify(location.message),
  );

  extensions.attachWindow(closedWindow());
  const extension = await extensions.installFromDialog(false);
  check(
    'extension picker',
    extension.ok === false && /not ready/i.test(extension.message),
    JSON.stringify(extension.message),
  );

  torrents.attachWindow(closedWindow());
  const torrent = await torrents.addFromDialog();
  check(
    'torrent picker',
    torrent.ok === false && /not ready/i.test(torrent.message),
    JSON.stringify(torrent.message),
  );

  check('no dialog was requested', dialogCalls === 0, `${dialogCalls} call(s)`);

  fs.rmSync(root, { recursive: true, force: true });
  if (failures.length > 0) {
    console.error(`window guards: FAIL — ${failures.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('window guards: PASS — every folder picker refused a closed window');
}

main().catch(error => {
  console.error('window guards: FAIL —', error && error.message ? error.message : error);
  process.exitCode = 1;
});
