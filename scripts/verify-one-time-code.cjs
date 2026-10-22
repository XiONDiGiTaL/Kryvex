/* eslint-disable no-console */
/**
 * End-to-end check for the in-service one-time-code relay.
 *
 * Proves, against the real Electron app and a loopback service, that:
 *  - a single code field mirrors a prompt and submits through the site's form;
 *  - formatted paste is normalized before it reaches the site;
 *  - a split six-box code group is detected and filled box by box;
 *  - "Use page field" focuses the site's own single field or first split box;
 *  - a split widget that submits itself is not submitted a second time.
 *
 * Usage: `npm run verify:otp` (builds first), or run
 * `node scripts/verify-one-time-code.cjs` after a build.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.tmp-otp-verify-profile');
const port = Number(process.env.KRYVEX_OTP_CDP_PORT || 9343);
const fixturePort = Number(process.env.KRYVEX_OTP_FIXTURE_PORT || 8142);
const origin = `http://127.0.0.1:${fixturePort}`;
let child = null;

const SINGLE_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Single code</title></head>
<body>
<h1>Sign in</h1>
<form id="form">
  <input id="code" name="code" autocomplete="one-time-code" maxlength="6" inputmode="numeric">
  <button type="submit">Continue</button>
</form>
<script>
  window.submitted = [];
  document.querySelector('#form').addEventListener('submit', event => {
    event.preventDefault();
    window.submitted.push(document.querySelector('#code').value);
  });
</script>
</body></html>`;

const SPLIT_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Split code</title></head>
<body>
<h1>Sign in</h1>
<form id="form">
  <div class="boxes">
    ${Array.from(
      { length: 6 },
      (_, index) =>
        `<input name="code${index + 1}" maxlength="1" inputmode="numeric">`,
    ).join('')}
  </div>
  <button type="submit">Continue</button>
</form>
<script>
  window.submitted = [];
  document.querySelector('#form').addEventListener('submit', event => {
    event.preventDefault();
    window.submitted.push(
      [...document.querySelectorAll('.boxes input')].map(input => input.value).join(''),
    );
  });
</script>
</body></html>`;

const AUTO_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Auto code</title></head>
<body>
<h1>Sign in</h1>
<form id="form">
  <div class="boxes">
    ${Array.from(
      { length: 6 },
      (_, index) =>
        `<input name="code${index + 1}" maxlength="1" inputmode="numeric">`,
    ).join('')}
  </div>
</form>
<script>
  window.submits = 0;
  const form = document.querySelector('#form');
  const inputs = [...document.querySelectorAll('.boxes input')];
  form.addEventListener('submit', event => {
    event.preventDefault();
    window.submits += 1;
    form.style.display = 'none';
  });
  inputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      if (index === inputs.length - 1 && input.value) form.requestSubmit();
    });
  });
</script>
</body></html>`;

const fixture = http.createServer((request, response) => {
  const pathname = new URL(request.url || '/', origin).pathname;
  const page = pathname.startsWith('/split')
    ? SPLIT_PAGE
    : pathname.startsWith('/auto')
      ? AUTO_PAGE
      : SINGLE_PAGE;
  response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
  response.end(page);
});

fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(path.join(profile, 'local'), { recursive: true });
const stateDir = path.join(profile, 'Kryvex');
fs.mkdirSync(stateDir, { recursive: true });
fs.writeFileSync(
  path.join(stateDir, 'kryvex-state.json'),
  JSON.stringify({
    version: 1,
    services: [
      {
        id: 's-otp-single',
        name: 'OTP Single',
        url: `${origin}/single`,
        category: 'communication',
        color: '#38BDF8',
        letter: 'S',
        pinned: true,
        createdAt: 1,
      },
      {
        id: 's-otp-split',
        name: 'OTP Split',
        url: `${origin}/split`,
        category: 'communication',
        color: '#A78BFA',
        letter: 'P',
        pinned: false,
        createdAt: 2,
      },
      {
        id: 's-otp-auto',
        name: 'OTP Auto',
        url: `${origin}/auto`,
        category: 'communication',
        color: '#34D399',
        letter: 'A',
        pinned: false,
        createdAt: 3,
      },
    ],
    bookmarks: [],
    history: [],
    settings: { themeId: 'kryvex-dark', autoCheckUpdates: false },
    recent: [],
    browser: { tabs: [], activeTabId: null },
  }),
);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function launch() {
  const args = ['.', `--remote-debugging-port=${port}`];
  if (process.env.CI) args.push('--disable-gpu');
  child = spawn(electron, args, {
    cwd: root,
    env: {
      ...process.env,
      KRYVEX_USER_DATA: stateDir,
      APPDATA: profile,
      LOCALAPPDATA: path.join(profile, 'local'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', data => process.stderr.write(`[app:err] ${data}`));
}

async function targets() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(response =>
        response.json(),
      );
      if (list.length > 0) return list;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  throw new Error('Electron DevTools endpoint did not appear.');
}

async function target() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const list = await targets().catch(() => []);
    const found =
      list.find(item => item.type === 'page' && item.url.includes('index.html')) ||
      list.find(item => item.type === 'page');
    if (found) return found;
    await sleep(250);
  }
  throw new Error('No matching Electron target.');
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
      throw new Error(
        result.exceptionDetails.exception?.description || 'Renderer evaluation failed.',
      );
    }
    return result.result.value;
  };
  await send('Runtime.enable');
  return { evaluate, close: () => socket.close() };
}

async function waitFor(evaluate, expression, label, attempts = 160) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await evaluate(expression);
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(5000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

const frame = id => `document.querySelector('.service-frame[data-service="${id}"]')`;
const guest = (id, expression) =>
  `(() => { const frame = ${frame(id)}; const view = frame?.querySelector('webview'); if (!view) return null; return view.executeJavaScript(${JSON.stringify(
    expression,
  )}); })()`;

async function openService(cdp, id, pathname) {
  await cdp.evaluate(`location.hash = '#/service/${id}'; true`);
  await waitFor(
    cdp.evaluate,
    `(() => { const frame = ${frame(id)}; const view = frame?.querySelector('webview'); if (!view) return null; try { return !view.isLoading() && view.getURL().includes(${JSON.stringify(
      `${origin}${pathname}`,
    )}); } catch { return null; } })()`,
    `${id} webview`,
  );
}

async function strip(cdp, id) {
  return waitFor(
    cdp.evaluate,
    `(() => {
      const frame = ${frame(id)};
      const root = frame?.querySelector('.one-time-code');
      if (!root) return null;
      const input = root.querySelector('.one-time-code-input');
      const submit = root.querySelector('button[type="submit"]');
      return {
        title: root.querySelector('strong')?.textContent?.trim(),
        hint: root.querySelector('.one-time-code-copy span')?.textContent?.trim(),
        inputMode: input?.inputMode,
        disabled: submit?.disabled,
      };
    })()`,
    `${id} one-time-code strip`,
  );
}

async function focusPageField(cdp, id) {
  const clicked = await cdp.evaluate(
    `(() => {
      const button = [...${frame(id)}.querySelectorAll('.one-time-code button')]
        .find(item => item.textContent.includes('Use page field'));
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  assert(clicked, `${id} did not offer "Use page field".`);
}

async function enter(cdp, id, value) {
  const normalized = await cdp.evaluate(
    `(() => {
      const input = ${frame(id)}.querySelector('.one-time-code-input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return input.value;
    })()`,
  );
  await waitFor(
    cdp.evaluate,
    `(() => { const button = ${frame(id)}.querySelector('.one-time-code button[type="submit"]'); return Boolean(button && !button.disabled); })()`,
    `${id} submit button`,
  );
  return normalized;
}

async function submit(cdp, id) {
  const clicked = await cdp.evaluate(
    `(() => {
      const button = ${frame(id)}.querySelector('.one-time-code button[type="submit"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`,
  );
  assert(clicked, `${id} submit button was not clickable.`);
}

async function note(cdp, id) {
  return waitFor(
    cdp.evaluate,
    `(() => { const frame = ${frame(id)}; return frame?.querySelector('.one-time-code-note')?.textContent?.trim() || null; })()`,
    `${id} sent note`,
  );
}

fixture.listen(fixturePort, '127.0.0.1');

(async () => {
  try {
    launch();
    const page = await target();
    const cdp = await connect(page.webSocketDebuggerUrl);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'shell');

    await openService(cdp, 's-otp-single', '/single');
    const single = await strip(cdp, 's-otp-single');
    console.log('single strip:', JSON.stringify(single));
    assert(single.title === 'Verification code', `single title was ${single.title}`);
    assert(single.hint.includes('6-character'), `single hint was ${single.hint}`);
    assert(single.inputMode === 'numeric', `single input mode was ${single.inputMode}`);
    assert(single.disabled === true, 'single submit was enabled with no code');
    await focusPageField(cdp, 's-otp-single');
    await waitFor(
      cdp.evaluate,
      guest('s-otp-single', `document.activeElement === document.querySelector('#code')`),
      'single page-field focus',
    );
    const singleValue = await enter(cdp, 's-otp-single', '12-34-56');
    assert(singleValue === '123456', `single strip normalized to ${singleValue}`);
    await submit(cdp, 's-otp-single');
    const singleSubmitted = await waitFor(
      cdp.evaluate,
      guest('s-otp-single', 'window.submitted.length ? window.submitted : null'),
      'single form submit',
    );
    assert(
      singleSubmitted[0] === '123456',
      `single form received ${JSON.stringify(singleSubmitted)}`,
    );
    assert(
      (await note(cdp, 's-otp-single')) === 'Code sent to OTP Single.',
      'single success note was wrong',
    );
    console.log('single submit ok', singleSubmitted);

    await openService(cdp, 's-otp-split', '/split');
    const split = await strip(cdp, 's-otp-split');
    console.log('split strip:', JSON.stringify(split));
    assert(split.hint.includes('6-character'), `split hint was ${split.hint}`);
    assert(split.inputMode === 'numeric', `split input mode was ${split.inputMode}`);
    await focusPageField(cdp, 's-otp-split');
    await waitFor(
      cdp.evaluate,
      guest(
        's-otp-split',
        `document.activeElement === document.querySelector('.boxes input')`,
      ),
      'split first-box focus',
    );
    const splitValue = await enter(cdp, 's-otp-split', '65-43-21');
    assert(splitValue === '654321', `split strip normalized to ${splitValue}`);
    await submit(cdp, 's-otp-split');
    const splitSubmitted = await waitFor(
      cdp.evaluate,
      guest('s-otp-split', 'window.submitted.length ? window.submitted : null'),
      'split form submit',
    );
    assert(
      splitSubmitted[0] === '654321',
      `split form received ${JSON.stringify(splitSubmitted)}`,
    );
    const boxes = await cdp.evaluate(
      guest(
        's-otp-split',
        `[...document.querySelectorAll('.boxes input')].map(input => input.value).join('')`,
      ),
    );
    assert(boxes === '654321', `split boxes hold ${boxes}`);
    assert(
      (await note(cdp, 's-otp-split')) === 'Code sent to OTP Split.',
      'split success note was wrong',
    );
    console.log('split submit ok', splitSubmitted, boxes);

    await openService(cdp, 's-otp-auto', '/auto');
    await strip(cdp, 's-otp-auto');
    await enter(cdp, 's-otp-auto', '112233');
    await submit(cdp, 's-otp-auto');
    const submits = await waitFor(
      cdp.evaluate,
      guest('s-otp-auto', 'window.submits || null'),
      'auto-submit count',
    );
    assert(submits === 1, `auto-submitting split form submitted ${submits} times`);
    await waitFor(
      cdp.evaluate,
      `(${frame('s-otp-auto')}.querySelector('.one-time-code') === null)`,
      'auto-submit strip to clear',
    );
    console.log('auto-submit guard ok');

    await cdp.evaluate('window.close(); true').catch(() => undefined);
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(5000)]);
    cdp.close();
    await stop();
    console.log('one-time-code relay harness: PASS');
  } catch (error) {
    console.error('one-time-code relay harness: FAIL', error.stack || error);
    await stop();
    process.exitCode = 1;
  } finally {
    fixture.close();
  }
})();
