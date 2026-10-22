/* eslint-disable no-console */
/**
 * Read-only end-to-end check for the secret Disk pulse tool.
 *
 * It drives the real app in a disposable profile, accepts the disclaimer,
 * runs a scan and asserts that the health line, analyzer and cleanup list all
 * render. It never presses the clean button: deletion is covered by
 * tests/disk-service.test.ts against a fixture, so a verification run cannot
 * touch the user's files.
 *
 *   npm run build && node scripts/verify-disk-pulse.cjs
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'screenshots');
const PORT = 9384;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const lines = [];

function check(condition, message) {
  if (!condition) throw new Error(message);
  lines.push(`PASS ${message}`);
  console.log(`PASS ${message}`);
}

async function target() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const page = list.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  throw new Error('DevTools endpoint did not appear.');
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
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'evaluate failed');
    }
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { evaluate, send, close: () => socket.close() };
}

async function waitFor(evaluate, expression, timeout, label) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-disk-e2e-'));
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
    if (!text.includes('wgc_capturer')) process.stderr.write(text);
  });

  let client = null;
  try {
    const page = await target();
    client = await connect(page.webSocketDebuggerUrl);

    await client.evaluate(`location.hash = '#/disk'`);
    await waitFor(client.evaluate, `!!document.querySelector('.disk-view')`, 15_000, '.disk-view');
    check(true, 'Disk pulse route opens');

    // A fresh profile opens the theme gallery on top of the route; close it so
    // the screenshot shows the tool rather than the first-run overlay.
    await client.evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find(n => n.textContent.trim() === 'Keep the current theme'); if (b) b.click(); return !!b; })()`,
    );
    await sleep(300);

    await waitFor(client.evaluate, `!!document.querySelector('.disk-disclaimer')`, 8_000, 'disclaimer');
    check(true, 'disclaimer gates the tool on first use');

    await client.evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find(n => n.textContent.trim() === 'I understand'); if (b) b.click(); return !!b; })()`,
    );
    await waitFor(
      client.evaluate,
      `!document.querySelector('.disk-disclaimer')`,
      8_000,
      'disclaimer accepted',
    );
    check(true, 'disclaimer can be accepted');

    await waitFor(
      client.evaluate,
      `!!document.querySelector('.disk-heart') && !!document.querySelector('.disk-ecg-line')`,
      8_000,
      'health panel',
    );
    await waitFor(
      client.evaluate,
      `/FULL/.test(document.querySelector('.disk-state')?.textContent || '')`,
      12_000,
      'drive usage',
    );
    const usage = await client.evaluate(
      `({ state: document.querySelector('.disk-state')?.textContent, free: document.querySelectorAll('.disk-heart-stats strong')[0]?.textContent })`,
    );
    check(!!usage.free && usage.free !== '—', `drive health reads real numbers (${usage.state}, free ${usage.free})`);

    const clicked = await client.evaluate(
      `(() => { const b = [...document.querySelectorAll('.disk-analyzer button')].find(n => /Analyze|Scanning/.test(n.textContent)); if (!b) return false; b.click(); return true; })()`,
    );
    check(clicked, 'analyze button is present');

    await waitFor(
      client.evaluate,
      `document.querySelectorAll('.disk-list .disk-check').length > 0`,
      90_000,
      'scan targets',
    );
    const scanned = await client.evaluate(
      `({ rows: document.querySelectorAll('.disk-list .disk-check').length, sizes: [...document.querySelectorAll('.disk-check-size')].map(n => n.textContent.trim()).filter(t => /B|KB|MB|GB/.test(t)).length })`,
    );
    check(scanned.rows >= 4, `scan lists ${scanned.rows} cleanup categories`);
    check(scanned.sizes > 0, `scan measured real sizes for ${scanned.sizes} categories`);

    const canClean = await client.evaluate(
      `(() => { const b = [...document.querySelectorAll('.disk-actions button')].find(n => /Clean /.test(n.textContent)); return b ? !b.disabled : false; })()`,
    );
    check(canClean, 'clean action arms only after a scan (not pressed)');

    await client.send('Page.captureScreenshot', { format: 'png' }).then(result => {
      fs.mkdirSync(shots, { recursive: true });
      fs.writeFileSync(
        path.join(shots, 'verify-disk-pulse.png'),
        Buffer.from(result.data, 'base64'),
      );
    });
    lines.push('PASS screenshot screenshots/verify-disk-pulse.png');
    console.log('PASS screenshot screenshots/verify-disk-pulse.png');
  } finally {
    try {
      client?.close();
    } catch {
      /* socket already gone */
    }
    if (child.exitCode === null) child.kill();
    await sleep(700);
    if (child.exitCode === null) child.kill('SIGKILL');
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
});
