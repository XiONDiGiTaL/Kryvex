/* eslint-disable no-console */
/**
 * Rooms harness: two real app instances, one real room.
 *
 * Instance A seeds a service, opens Rooms, creates a room and shares a screen;
 * instance B joins through the invite link. The check asserts both see each
 * other, a chat message crosses, and B receives a video track with frames.
 * A then sends a real 12 MiB file: B accepts it through the native save dialog
 * and the bytes that land on disk are compared with the ones that left. A
 * second, larger file is sent so that A can leave mid-transfer: the row must
 * park with its partial on disk, B moves that partial to another folder, and A
 * rejoins so the file finishes where B moved it, byte for byte.
 * Signaling uses the public WebTorrent trackers the app ships with, so this
 * also proves the default configuration, not a test-only path.
 *
 * Run `pnpm build` first (or use `pnpm verify:rooms`).
 */
const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const PORT_A = Number(process.env.KRYVEX_ROOMS_PORT_A || 9351);
const PORT_B = Number(process.env.KRYVEX_ROOMS_PORT_B || 9352);
const FIXTURE_PORT = 8151;
/** Big enough to take real chunks, small enough to hash in a moment. */
const SENT_BYTES = 12 * 1024 * 1024;
/** Too big to finish before the Leave below lands, small enough to hash. */
const PARKED_BYTES = 128 * 1024 * 1024;

const SERVICE = {
  id: 's-fixture',
  name: 'Rooms fixture',
  url: `http://127.0.0.1:${FIXTURE_PORT}/fixture`,
  category: 'other',
  color: '#38BDF8',
  letter: 'R',
  pinned: true,
  createdAt: 1,
};

function stateFor(name) {
  return {
    version: 1,
    services: [SERVICE],
    bookmarks: [],
    history: [],
    recent: [],
    browser: { tabs: [], activeTabId: null },
    settings: { party: { displayName: name, color: name === 'Ada' ? '#38BDF8' : '#A78BFA' } },
  };
}

const profiles = {
  a: path.join(root, '.tmp-rooms-a'),
  b: path.join(root, '.tmp-rooms-b'),
};

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(
    `<!doctype html><html><head><title>Rooms fixture</title></head>
     <body style="font:16px sans-serif;padding:24px">
       <h1>Rooms fixture</h1>
       <p>An app Kryvex can share into a room.</p>
     </body></html>`,
  );
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const children = [];

function seed(key, name) {
  const profile = profiles[key];
  fs.rmSync(profile, { recursive: true, force: true });
  const userData = path.join(profile, 'Kryvex');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(path.join(profile, 'local'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'kryvex-state.json'), JSON.stringify(stateFor(name)), 'utf8');
}

function launch(key, port) {
  const profile = profiles[key];
  const child = spawn(electron, ['.', `--remote-debugging-port=${port}`], {
    cwd: root,
    env: {
      ...process.env,
      KRYVEX_USER_DATA: path.join(profile, 'Kryvex'),
      APPDATA: profile,
      LOCALAPPDATA: path.join(profile, 'local'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', data => process.stderr.write(`[${key}] ${data}`));
  children.push(child);
  return child;
}

async function target(port) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(response =>
        response.json(),
      );
      const page = list.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  throw new Error(`DevTools endpoint ${port} did not appear.`);
}

async function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let sequence = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  const send = (method, params = {}) => {
    sequence += 1;
    const id = sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  };
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Failed.');
    return result.result.value;
  };
  await send('Runtime.enable');
  return { evaluate, send, close: () => socket.close() };
}

async function waitFor(evaluate, expression, label, attempts = 450) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await evaluate(expression);
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

/** Bytes that are cheap to build and impossible to produce by accident. */
function pattern(bytes) {
  const data = Buffer.alloc(bytes);
  for (let index = 0; index < bytes; index += 1) data[index] = (index * 7 + 11) % 251;
  return data;
}

function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** A large file without a busy loop per byte: one block, written again. */
function writePattern(file, bytes) {
  const block = pattern(Math.min(bytes, 1024 * 1024));
  const handle = fs.openSync(file, 'w');
  try {
    let left = bytes;
    while (left > 0) {
      const take = Math.min(left, block.length);
      fs.writeSync(handle, block, 0, take);
      left -= take;
    }
  } finally {
    fs.closeSync(handle);
  }
}

/** `waitFor` for the leg where a fast disk is the enemy: a few ms apart. */
async function poll(evaluate, expression, label, attempts = 900, interval = 10) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await evaluate(expression);
    if (value) return value;
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

/** Hands real paths to a file input, which is what the picker would do. */
async function setFiles(client, selector, files) {
  const document = await client.send('DOM.getDocument', { depth: 1 });
  const node = await client.send('DOM.querySelector', { nodeId: document.root.nodeId, selector });
  check(node.nodeId, `No ${selector} to put files into.`);
  await client.send('DOM.setFileInputFiles', { nodeId: node.nodeId, files });
}

/** Accepts the native save dialog of one app process, as a person would. */
function acceptSaveDialog(pid, target) {
  check(process.platform === 'win32', 'The native save dialog is only automated on Windows.');
  const run = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(__dirname, 'save-dialog.ps1'),
      '-AppPid',
      String(pid),
      '-TargetPath',
      target,
    ],
    { encoding: 'utf8', timeout: 60_000 },
  );
  // Best effort on purpose: on a desktop someone is using, a stray Enter can
  // answer the dialog before this gets to it. The destination is not judged
  // here — the caller checks the file that lands, byte for byte, against the
  // one that left, so a dialog answered the wrong way still fails the run.
  const said = (run.stdout || run.stderr || '').trim();
  console.log('save dialog:', said || '(already answered)');
}

/** The rows of the files panel, as the receiver sees them. */
const fileRow = name => `(() => {
  const row = Array.from(document.querySelectorAll('.room-file'))
    .find(node => node.textContent.includes(${JSON.stringify(name)}));
  return row ?? null;
})()`;

async function stop() {
  for (const child of children) {
    if (child.exitCode !== null) continue;
    child.kill();
  }
  await sleep(1200);
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

server.listen(FIXTURE_PORT, '127.0.0.1');

(async () => {
  try {
    seed('a', 'Ada');
    seed('b', 'Grace');
    launch('a', PORT_A);

    const pageA = await target(PORT_A);
    const a = await connect(pageA.webSocketDebuggerUrl);
    await waitFor(a.evaluate, `Boolean(document.querySelector('.app'))`, 'shell A');

    // Mount the fixture service so the picker has a Kryvex app source, then
    // open Rooms (the service stays mounted behind the view).
    await a.evaluate(`window.location.hash = '#/service/s-fixture'; true`);
    await waitFor(
      a.evaluate,
      `(() => { const w = document.querySelector('webview'); try { return Boolean(w) && !w.isLoading(); } catch { return false; } })()`,
      'fixture service',
    );

    await a.evaluate(`window.location.hash = '#/rooms'; true`);
    await waitFor(a.evaluate, `Boolean(document.querySelector('.rooms-lobby'))`, 'Rooms lobby');

    const sources = await a.evaluate(`window.kryvex.partySources()`);
    console.log(
      'sources:',
      JSON.stringify(
        sources.map(source => ({ kind: source.kind, name: source.name })),
      ),
    );
    check(sources.some(source => source.kind === 'app'), 'No Kryvex app source was listed.');
    check(sources.some(source => source.kind === 'screen'), 'No screen source was listed.');

    await a.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find(node => node.textContent.trim() === 'Create a room');
      button.click();
      return true;
    })()`);
    const room = await waitFor(
      a.evaluate,
      `document.querySelector('.room-code')?.textContent?.trim() ?? null`,
      'room code',
    );
    console.log('room:', room);
    check(/^[0-9a-hjkmnp-tv-z]{26}$/.test(room), `Unexpected room code: ${room}`);

    // B joins through the invite the UI shows.
    const childB = launch('b', PORT_B);
    const pageB = await target(PORT_B);
    const b = await connect(pageB.webSocketDebuggerUrl);
    await waitFor(b.evaluate, `Boolean(document.querySelector('.app'))`, 'shell B');
    await b.evaluate(
      `window.location.hash = '#/rooms?room=' + ${JSON.stringify(room)}; true`,
    );

    // Two entries plus the other side's chosen name: self alone must not pass.
    const roster = `(() => {
      const rows = Array.from(document.querySelectorAll('.room-person'));
      return rows.length >= 2 ? rows.map(row => row.textContent.trim()).join(' | ') : null;
    })()`;
    const seenByA = await waitFor(
      a.evaluate,
      `(() => { const text = ${roster}; return text && text.includes('Grace') ? text : null; })()`,
      'peer A sees Grace',
    );
    const seenByB = await waitFor(
      b.evaluate,
      `(() => { const text = ${roster}; return text && text.includes('Ada') ? text : null; })()`,
      'peer B sees Ada',
    );
    console.log('presence A:', seenByA);
    console.log('presence B:', seenByB);

    // Chat A → B.
    const text = `hello from Ada ${Date.now()}`;
    await a.evaluate(`(() => {
      const box = document.querySelector('.room-compose textarea');
      box.focus();
      return true;
    })()`);
    await a.send('Input.insertText', { text });
    await a.evaluate(`(() => {
      const send = Array.from(document.querySelectorAll('.room-compose button'))
        .find(node => node.textContent.trim() === 'Send');
      send.click();
      return true;
    })()`);
    await waitFor(
      b.evaluate,
      `Array.from(document.querySelectorAll('.room-msg p')).some(p => p.textContent === ${JSON.stringify(text)})`,
      'chat delivered to B',
    );
    console.log('chat: delivered');

    // Share a screen from A through the real picker.
    await a.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find(node => node.textContent.includes('Share something'));
      button.click();
      return true;
    })()`);
    await waitFor(a.evaluate, `Boolean(document.querySelector('.room-picker .room-source'))`, 'picker');
    await a.evaluate(`(() => {
      const group = Array.from(document.querySelectorAll('.room-source-group'))
        .find(node => node.textContent.includes('SCREENS'));
      const tile = group?.querySelector('.room-source');
      if (!tile) return false;
      tile.click();
      return true;
    })()`);
    await a.evaluate(`(() => {
      const start = Array.from(document.querySelectorAll('.room-picker button'))
        .find(node => node.textContent.includes('Start sharing'));
      start.click();
      return true;
    })()`);

    await waitFor(
      a.evaluate,
      `(() => { const v = document.querySelector('.room-tile video'); return Boolean(v) && v.videoWidth > 0; })()`,
      'local preview frames',
    );
    const remote = await waitFor(
      b.evaluate,
      `(() => { const v = document.querySelector('.room-tile video'); return v && v.videoWidth > 0 ? { width: v.videoWidth, height: v.videoHeight } : null; })()`,
      'remote video frames',
    );
    console.log('screen share:', JSON.stringify(remote));

    // Files: A offers one real file, B accepts it through the native dialog,
    // and the bytes that reach the disk are compared with the ones sent.
    const sentFile = path.join(profiles.a, 'send', 'quarter.bin');
    fs.mkdirSync(path.dirname(sentFile), { recursive: true });
    fs.writeFileSync(sentFile, pattern(SENT_BYTES));
    await setFiles(a, '.room-files input[type=file]', [sentFile]);
    await waitFor(
      a.evaluate,
      `${fileRow('quarter.bin')} ? true : null`,
      'A lists the offer',
    );
    await waitFor(
      b.evaluate,
      `(() => {
        const row = ${fileRow('quarter.bin')};
        return row && row.classList.contains('is-offered') ? row.textContent.trim() : null;
      })()`,
      'B is offered the file',
    );

    const savedFile = path.join(profiles.b, 'recv', 'quarter.bin');
    fs.mkdirSync(path.dirname(savedFile), { recursive: true });
    const pressed = await b.evaluate(`(() => {
      const row = ${fileRow('quarter.bin')};
      const save = Array.from(row.querySelectorAll('button'))
        .find(node => node.textContent.trim() === 'Save as…');
      if (!save) return false;
      save.click();
      return true;
    })()`);
    check(pressed === true, 'The offer had no button to choose a destination.');
    acceptSaveDialog(childB.pid, savedFile);

    const savedPath = await waitFor(
      b.evaluate,
      `(() => {
        const row = ${fileRow('quarter.bin')};
        if (!row || !row.classList.contains('is-saved')) return null;
        return row.querySelector('.room-file-path')?.textContent?.trim() || null;
      })()`,
      'B saves the file',
      900,
    );
    console.log('file saved:', savedPath);
    check(fs.existsSync(savedFile), `The receiver wrote nothing to ${savedFile}.`);
    const written = fs.statSync(savedFile).size;
    check(written === SENT_BYTES, `The saved file is ${written} bytes, not ${SENT_BYTES}.`);
    check(digest(savedFile) === digest(sentFile), 'The saved bytes differ from the file that left.');
    check(
      !fs.existsSync(`${savedFile}.kryvexpart`),
      'A finished transfer left its partial file behind.',
    );
    await waitFor(
      a.evaluate,
      `(() => {
        const row = ${fileRow('quarter.bin')};
        return row && row.classList.contains('is-done') ? row.textContent.trim() : null;
      })()`,
      'A sees the transfer finish',
    );
    console.log('file transfer:', SENT_BYTES, 'bytes, SHA-256 matches');

    // Pause, re-point and resume. A leaves while B is still writing, which parks
    // both ends; B moves the partial to a second folder; A comes back to the
    // same room and the file finishes where B moved it.
    const longFile = path.join(profiles.a, 'send', 'half.bin');
    const firstTarget = path.join(profiles.b, 'recv', 'half.bin');
    const firstPartial = `${firstTarget}.kryvexpart`;
    const secondDir = path.join(profiles.b, 'recv2');
    const secondTarget = path.join(secondDir, 'half.bin');
    const secondPartial = `${secondTarget}.kryvexpart`;
    writePattern(longFile, PARKED_BYTES);
    fs.mkdirSync(secondDir, { recursive: true });

    await setFiles(a, '.room-files input[type=file]', [longFile]);
    await waitFor(
      b.evaluate,
      `(() => {
        const row = ${fileRow('half.bin')};
        return row && row.classList.contains('is-offered') ? true : null;
      })()`,
      'B is offered the long file',
    );
    const pressedLong = await b.evaluate(`(() => {
      const row = ${fileRow('half.bin')};
      const save = Array.from(row.querySelectorAll('button'))
        .find(node => node.textContent.trim() === 'Save as…');
      if (!save) return false;
      save.click();
      return true;
    })()`);
    check(pressedLong === true, 'The long offer had no button to choose a destination.');
    acceptSaveDialog(childB.pid, firstTarget);

    // Leave A the moment bytes are on disk: a pause needs a transfer that is
    // really moving, and a file this size cannot finish before the click lands.
    const moving = await poll(
      b.evaluate,
      `(() => {
        const row = ${fileRow('half.bin')};
        if (!row) return null;
        if (row.classList.contains('is-saved') || row.classList.contains('is-done')) {
          return { tooLate: true };
        }
        if (!row.classList.contains('is-active')) return null;
        const percent = Number((/(\\d+)%/.exec(row.textContent) || [])[1] || 0);
        return percent > 0 && percent < 100 ? { percent } : null;
      })()`,
      'the long file to start moving',
    );
    check(
      moving.tooLate !== true,
      `The ${PARKED_BYTES}-byte file finished before it could be paused; raise PARKED_BYTES.`,
    );

    const left = await a.evaluate(`(() => {
      const leave = Array.from(document.querySelectorAll('.room-head-actions button'))
        .find(node => node.textContent.trim() === 'Leave');
      if (!leave) return false;
      leave.click();
      return true;
    })()`);
    check(left === true, 'A had no Leave button to press.');
    await waitFor(a.evaluate, `Boolean(document.querySelector('.rooms-lobby'))`, 'A to leave the room');

    const parked = await waitFor(
      b.evaluate,
      `(() => {
        const row = ${fileRow('half.bin')};
        if (!row || !row.classList.contains('is-paused')) return null;
        return row.textContent.trim();
      })()`,
      'B to park the transfer',
      600,
    );
    check(/Gives up in/.test(parked), `B parked without a deadline to count down: ${parked}`);

    // A pause that drops what it wrote is a restart in disguise: the partial has
    // to still be there, with the bytes that had arrived.
    await sleep(600);
    check(fs.existsSync(firstPartial), `The pause left no partial at ${firstPartial}.`);
    const keptBytes = fs.statSync(firstPartial).size;
    check(
      keptBytes > 0 && keptBytes < PARKED_BYTES,
      `The pause kept ${keptBytes} of ${PARKED_BYTES} bytes, so nothing had arrived.`,
    );

    // Re-point: the partial moves to the second folder, and the bytes go with it.
    const repointed = await b.evaluate(`(() => {
      const row = ${fileRow('half.bin')};
      const button = Array.from(row.querySelectorAll('button'))
        .find(node => node.textContent.trim() === 'Save somewhere else');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    check(repointed === true, 'A parked row offered no way to save somewhere else.');
    acceptSaveDialog(childB.pid, secondTarget);
    await waitFor(
      b.evaluate,
      `(() => {
        const row = ${fileRow('half.bin')};
        return row && row.classList.contains('is-paused') ? row.textContent.trim() : null;
      })()`,
      'B to stay parked after moving the file',
      300,
    );
    await sleep(600);
    check(!fs.existsSync(firstPartial), `The moved file left ${firstPartial} behind.`);
    check(fs.existsSync(secondPartial), `Nothing moved to ${secondPartial}.`);
    const movedBytes = fs.statSync(secondPartial).size;
    check(
      movedBytes === keptBytes,
      `The move carried ${movedBytes} bytes instead of the ${keptBytes} already on disk.`,
    );
    console.log('pause:', keptBytes, 'bytes parked, then moved to', secondTarget);

    // Resume: A rejoins the same room through the lobby, and the sender re-asks.
    await a.evaluate(`(() => {
      const input = document.querySelector('.room-join-row input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(room)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    const rejoined = await a.evaluate(`(() => {
      const join = Array.from(document.querySelectorAll('.room-join-row button'))
        .find(node => node.textContent.trim() === 'Join');
      if (!join) return false;
      join.click();
      return true;
    })()`);
    check(rejoined === true, 'A had no Join button to come back with.');

    const parkedPath = await waitFor(
      b.evaluate,
      `(() => {
        const row = ${fileRow('half.bin')};
        if (!row || !row.classList.contains('is-saved')) return null;
        return row.querySelector('.room-file-path')?.textContent?.trim() || null;
      })()`,
      'the parked transfer to finish',
      2400,
    );
    check(
      parkedPath.includes('recv2'),
      `The transfer finished at ${parkedPath} instead of the folder B moved it to.`,
    );
    check(fs.existsSync(secondTarget), `The resumed transfer wrote nothing to ${secondTarget}.`);
    const resumedBytes = fs.statSync(secondTarget).size;
    check(
      resumedBytes === PARKED_BYTES,
      `The resumed file is ${resumedBytes} bytes, not ${PARKED_BYTES}.`,
    );
    check(digest(secondTarget) === digest(longFile), 'The resumed bytes differ from the file that left.');
    check(!fs.existsSync(secondPartial), 'The resumed transfer left its partial file behind.');
    await waitFor(
      a.evaluate,
      `(() => {
        const row = ${fileRow('half.bin')};
        return row && row.classList.contains('is-done') ? row.textContent.trim() : null;
      })()`,
      'A to see the parked transfer finish',
    );
    console.log('resume:', PARKED_BYTES, 'bytes after a leave, SHA-256 matches');

    a.close();
    b.close();
    await stop();
    console.log('rooms harness: PASS');
  } catch (error) {
    console.error('rooms harness: FAIL', error.stack || error);
    await stop();
    process.exitCode = 1;
  } finally {
    server.close();
  }
})();
