/* eslint-disable no-console */
/**
 * Rooms harness: two real app instances, one real room.
 *
 * Instance A seeds a service, opens Rooms, creates a room and shares a screen;
 * instance B joins through the invite link. The check asserts both see each
 * other, a chat message crosses, and B receives a video track with frames.
 * Signaling uses the public WebTorrent trackers the app ships with, so this
 * also proves the default configuration, not a test-only path.
 *
 * Run `pnpm build` first (or use `pnpm verify:rooms`).
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const PORT_A = Number(process.env.KRYVEX_ROOMS_PORT_A || 9351);
const PORT_B = Number(process.env.KRYVEX_ROOMS_PORT_B || 9352);
const FIXTURE_PORT = 8151;

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
    launch('b', PORT_B);
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
