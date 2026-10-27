/* eslint-disable no-console */
/**
 * End-to-end check for the Virtual LAN strip in a room.
 *
 * Kryvex runs no tunnel: the panel reads the addresses the user's own engine
 * has already put on this machine, publishes one to the room by hand, and lists
 * what the other members published. That makes the honest checks specific:
 *
 *   - every address the panel shows must be an address this machine really has
 *     (compared against `os.networkInterfaces()`), never an invented one, and
 *     never loopback or link-local;
 *   - the only bridge member is `vlanStatus`, so there is no IPC a compromised
 *     renderer could use to start a network, change a route or ask for
 *     elevation;
 *   - sharing and withdrawing change the strip and the device list.
 *
 * Run after `pnpm build`:
 *
 *   node scripts/verify-vlan.cjs
 *
 * Env: `KRYVEX_CDP_PORT` picks the debugging port.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'screenshots');
const PORT = Number(process.env.KRYVEX_CDP_PORT || 9392);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const children = [];

async function target(port) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
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
  const exceptions = [];
  let sequence = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params?.exceptionDetails?.exception?.description ?? 'exception');
    }
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
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'evaluate failed');
    }
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { evaluate, send, exceptions, close: () => socket.close() };
}

async function waitFor(evaluate, expression, timeout = 8000, label = expression) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(160);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function shot(client, name) {
  fs.mkdirSync(shots, { recursive: true });
  const result = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(result.data, 'base64'));
}

function launch(profile) {
  const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`], {
    cwd: root,
    env: {
      ...process.env,
      KRYVEX_USER_DATA: path.join(profile, 'Kryvex'),
      APPDATA: profile,
      LOCALAPPDATA: path.join(profile, 'local'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', data => {
    const text = String(data);
    if (text.includes('wgc_capturer') || text.includes('GUEST_VIEW_MANAGER_CALL')) return;
    process.stderr.write(text);
  });
  children.push(child);
  return PORT;
}

async function stop() {
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  await sleep(700);
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

const lines = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  lines.push(`PASS ${message}`);
  console.log(`PASS ${message}`);
}

/** Every non-internal IPv4 this machine really has, with its adapter name. */
function machineAddresses() {
  const rows = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      rows.push({ address: entry.address, name });
    }
  }
  return rows;
}

function isLoopbackOrLinkLocal(address) {
  return (
    address.startsWith('127.') || address.startsWith('169.254.') || address.startsWith('0.')
  );
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-vlan-'));
  const userData = path.join(profile, 'Kryvex');
  const statePath = path.join(userData, 'kryvex-state.json');
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(
    statePath,
    JSON.stringify({
      version: 1,
      services: [],
      bookmarks: [],
      history: [],
      recent: [],
      browser: { tabs: [], activeTabId: null },
      settings: { themeGallerySeen: true, startView: 'rooms' },
    }),
  );

  const port = launch(profile);
  const page = await target(port);
  const client = await connect(page.webSocketDebuggerUrl);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.app-sidebar'))`, 14000, 'the shell');

  // 1. The lobby has no strip: there is no room to publish an address into.
  await client.evaluate(`window.location.hash = '#/rooms'; true;`);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.rooms-lobby'))`, 8000, 'the lobby');
  const lobby = await client.evaluate(`document.querySelectorAll('.vlan-strip').length`);
  check(lobby === 0, 'the lobby shows no Virtual LAN strip');

  // 2. The one bridge member, and nothing that could start a network.
  const bridge = await client.evaluate(
    `Object.keys(window.kryvex ?? {}).filter(key => key.toLowerCase().includes('vlan')).sort()`,
  );
  check(
    Array.isArray(bridge) && bridge.join(',') === 'vlanStatus',
    'the only Virtual LAN bridge member is vlanStatus (no way to start, route or elevate)',
  );

  // 3. Opening a room reveals the strip, collapsed and idle.
  await client.evaluate(`document.querySelector('[data-shot="create-room"]').click(); true;`);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.vlan-strip'))`, 10000, 'the strip');
  const collapsed = await client.evaluate(`(() => {
    const strip = document.querySelector('.vlan-strip');
    return {
      state: strip.querySelector('.vlan-strip-state')?.dataset.vlanState ?? '',
      text: strip.innerText,
      panel: Boolean(document.querySelector('.vlan-panel')),
      label: strip.querySelector('strong')?.textContent ?? '',
    };
  })()`);
  check(collapsed.label === 'Virtual LAN', 'the strip is labelled Virtual LAN');
  check(collapsed.state === 'idle', 'the strip starts idle, before anything is published');
  check(collapsed.panel === false, 'the panel is closed until it is asked for');
  await shot(client, 'vlan-strip');

  // 4. The panel lists real adapters, or says plainly that there are none.
  await client.evaluate(`(() => {
    const buttons = [...document.querySelectorAll('.vlan-strip .btn')];
    buttons.find(button => button.textContent.trim() === 'Expand')?.click();
    return true;
  })()`);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.vlan-panel'))`, 6000, 'the panel');
  const panel = await client.evaluate(`(() => ({
    addresses: [...document.querySelectorAll('.vlan-address')].map(row => ({
      address: row.querySelector('.vlan-ip')?.textContent?.trim() ?? '',
      engine: row.dataset.vlanEngine ?? '',
      name: row.querySelector('.vlan-adapter-name')?.textContent ?? '',
    })),
    note: document.querySelector('.vlan-panel .vlan-note')?.textContent ?? '',
    devices: [...document.querySelectorAll('.vlan-row')].length,
  }))()`);

  const real = machineAddresses();
  for (const row of panel.addresses) {
    const match = real.find(entry => entry.address === row.address);
    check(Boolean(match), `the panel shows a real address (${row.address})`);
    check(!isLoopbackOrLinkLocal(row.address), `${row.address} is neither loopback nor link-local`);
    check(row.engine.length > 0, `${row.address} names the engine family it belongs to`);
  }
  if (panel.addresses.length === 0) {
    check(
      panel.note.includes('No tunnel adapter is running'),
      'with no tunnel up, the panel says so instead of showing an address',
    );
  }
  check(panel.devices === 0, 'nothing is listed as shared before anyone shares');

  // 5. Publishing shows this device with the address the machine really has.
  if (panel.addresses.length > 0) {
    await client.evaluate(`document.querySelector('[data-shot="vlan-share"]').click(); true;`);
    await waitFor(
      client.evaluate,
      `document.querySelector('.vlan-strip-state')?.dataset.vlanState === 'sharing'`,
      6000,
      'the sharing state',
    );
    const shared = await client.evaluate(`(() => ({
      rows: [...document.querySelectorAll('.vlan-row')].map(row => ({
        text: row.innerText,
        ip: row.querySelector('.vlan-ip')?.textContent?.trim() ?? '',
      })),
      state: document.querySelector('.vlan-strip-state')?.textContent ?? '',
    }))()`);
    check(shared.rows.length === 1, 'this device is listed once after publishing its address');
    check(
      shared.rows[0].text.includes('This device'),
      'the row is marked as this device rather than as a peer',
    );
    check(
      panel.addresses.some(row => row.address === shared.rows[0].ip),
      'the published address is the one the machine actually has',
    );
    check(shared.state.includes(shared.rows[0].ip), 'the strip reports the address it published');
    await shot(client, 'vlan-shared');

    // 6. Withdrawing removes it again.
    await client.evaluate(`document.querySelector('[data-shot="vlan-stop"]').click(); true;`);
    await waitFor(
      client.evaluate,
      `document.querySelector('.vlan-strip-state')?.dataset.vlanState === 'idle'`,
      6000,
      'the idle state',
    );
    const after = await client.evaluate(`document.querySelectorAll('.vlan-row').length`);
    check(after === 0, 'withdrawing the address removes the row');
  }

  check(
    client.exceptions.length === 0,
    `no renderer exception was thrown${client.exceptions.length ? `: ${client.exceptions[0]}` : ''}`,
  );

  console.log(`\n${lines.length}/${lines.length} PASS`);
}

main()
  .catch(error => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stop();
  });
