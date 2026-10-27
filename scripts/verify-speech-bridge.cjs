/* eslint-disable no-console */
/**
 * Checks the one-click speech engine from inside the real app.
 *
 * `verify-speech-runtime.cjs` proves the main-process runtime on its own. This
 * one proves the half that can only be wrong in the app: that the shell window
 * really exposes the bridge, that the handlers answer the shell and not some
 * other frame, that the reviewed catalogue arrives intact, and that Lexium
 * renders the card with the button a first-time user is meant to press.
 *
 * It never presses that button: nothing is downloaded here, so the check is
 * safe to run on any machine and takes seconds.
 *
 *   node scripts/verify-speech-bridge.cjs      (after `pnpm build`)
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const PORT = 9409;
const OUTPUT = path.join(root, '.tmp-speech-bridge-verify.log');
const lines = [];
const children = [];

function log(message) {
  lines.push(message);
  process.stdout.write(`${message}\n`);
}

function finish(code) {
  try {
    fs.writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  } catch {
    /* the log is a convenience */
  }
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exit(code);
}

function fail(message) {
  log(`FAIL ${message}`);
  finish(1);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  return { evaluate, send, close: () => socket.close() };
}

async function main() {
  const profile = path.join(root, '.tmp-speech-bridge');
  fs.rmSync(profile, { recursive: true, force: true });
  const userData = path.join(profile, 'Kryvex');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(path.join(profile, 'local'), { recursive: true });
  // The speech features are desktop only and their panel sits behind secret
  // services, so the profile opens with them on.
  fs.writeFileSync(
    path.join(userData, 'kryvex-state.json'),
    JSON.stringify({
      version: 1,
      services: [],
      bookmarks: [],
      history: [],
      recent: [],
      browser: { tabs: [], activeTabId: null },
      settings: {
        themeId: 'kryvex-dark',
        themeGallerySeen: true,
        density: 'comfortable',
        language: 'en',
        secretServices: true,
      },
    }),
  );

  const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`], {
    cwd: root,
    env: {
      ...process.env,
      KRYVEX_USER_DATA: userData,
      APPDATA: profile,
      LOCALAPPDATA: path.join(profile, 'local'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  child.stderr.on('data', data => {
    const text = String(data);
    if (!text.includes('wgc_capturer')) process.stderr.write(text);
  });

  const page = await target(PORT);
  const cdp = await connect(page.webSocketDebuggerUrl);
  await sleep(2500);

  // ------------------------------------------------------------- the bridge ---
  const bridged = await cdp.evaluate(`typeof window.kryvex?.speechStatus`);
  if (bridged !== 'function') return fail(`the shell has no speechStatus (${bridged})`);
  log('the shell window exposes the speech bridge');

  const status = await cdp.evaluate(`window.kryvex.speechStatus()`);
  if (!status || typeof status !== 'object') return fail('speechStatus returned nothing');
  if (status.phase !== 'idle' && status.phase !== 'stopped') {
    return fail(`a fresh profile reported phase ${status.phase}`);
  }
  if (!Array.isArray(status.models) || status.models.length !== 3) {
    return fail(`the catalogue did not arrive intact: ${JSON.stringify(status.models)}`);
  }
  const ids = status.models.map(row => row.id).join(',');
  if (ids !== 'tiny,base,small') return fail(`unexpected catalogue: ${ids}`);
  for (const row of status.models) {
    if (row.present) return fail(`${row.id} is reported installed in a fresh profile`);
    if (!(row.bytes > 0)) return fail(`${row.id} arrived without a size`);
    if (!row.licence) return fail(`${row.id} arrived without its licence`);
  }
  log(`catalogue intact: ${ids} (supported: ${status.supported}, installed: ${status.installed})`);

  // The renderer must not be able to name a URL: only a catalogue id is read.
  const bogus = await cdp.evaluate(`window.kryvex.speechStart('https://example.com/x.bin')`);
  if (!bogus || bogus.error !== 'not-installed') {
    return fail(`starting an unknown model reported ${JSON.stringify(bogus && bogus.error)}`);
  }
  log('an unknown model id is refused before anything is downloaded');

  // ------------------------------------------------------------- the panel ---
  await cdp.evaluate(`window.location.hash = '#/lexium'; true`);
  await sleep(900);
  await cdp.evaluate(`(() => {
    const panel = document.querySelector('details.lexium-engine');
    if (panel) panel.setAttribute('open', '');
    return Boolean(panel);
  })()`);
  await sleep(400);

  const card = await cdp.evaluate(`(() => {
    const local = document.querySelector('.lexium-setup-local');
    if (!local) return { found: false };
    const buttons = [...local.querySelectorAll('button')].map(button => button.textContent.trim());
    const select = local.querySelector('select');
    return {
      found: true,
      heading: (local.querySelector('strong')?.textContent ?? '').trim(),
      buttons,
      models: select ? [...select.options].map(option => option.textContent.trim()) : [],
      note: (local.querySelector('.lexium-setup-head p')?.textContent ?? '').trim(),
      error: (local.querySelector('.lexium-error')?.textContent ?? '').trim(),
    };
  })()`);
  if (!card.found) return fail('Lexium did not render the one-click engine card');
  if (card.heading !== 'Whisper on this machine') {
    return fail(`unexpected card heading: ${card.heading}`);
  }
  if (!card.buttons.includes('Download and start')) {
    return fail(`the card offered ${JSON.stringify(card.buttons)} instead of a download`);
  }
  if (card.models.length !== 3) return fail(`the picker listed ${card.models.length} models`);
  if (!card.models.some(label => label.includes('Whisper base'))) {
    return fail(`the picker did not list the default model: ${JSON.stringify(card.models)}`);
  }
  if (!card.note.includes('accents, music and singing')) {
    return fail(`the card did not explain what the engine is for: ${card.note}`);
  }
  // The refusal above left a real failure behind, so the panel's own wording for
  // it is checked here as well: that is the line a stranded user will read.
  if (card.error !== 'Download the server before starting it.') {
    return fail(`the failure line read "${card.error}"`);
  }
  log(`card rendered: "${card.heading}" · ${card.models.join(' / ')}`);
  log(`buttons: ${JSON.stringify(card.buttons)}`);

  // ------------------------------------------------- the launch switch ---
  // The switch is a promise about the next launch, so it is pressed here the
  // way a user would: the panel's own button, then the state read back from the
  // main process.
  const autostartBefore = await cdp.evaluate(`window.kryvex.speechStatus()`);
  if (autostartBefore.autostart !== false) {
    return fail(`a fresh profile asked to start with Kryvex (${autostartBefore.autostart})`);
  }
  // Nothing was started by Kryvex here, so Lexium must not adopt an address it
  // did not choose.
  if (autostartBefore.autostarted !== false) {
    return fail('an engine was reported as started by Kryvex in a fresh profile');
  }
  const launchRow = await cdp.evaluate(`(() => {
    const row = document.querySelector('.lexium-autostart');
    if (!row) return { found: false };
    const button = row.querySelector('button[role="switch"]');
    return {
      found: true,
      label: (row.querySelector('strong')?.textContent ?? '').trim(),
      note: (row.querySelector('p')?.textContent ?? '').trim(),
      checked: button ? button.getAttribute('aria-checked') : null,
    };
  })()`);
  if (!launchRow.found) return fail('the card has no start-with-Kryvex switch');
  if (launchRow.label !== 'Start with Kryvex') {
    return fail(`the launch switch is labelled "${launchRow.label}"`);
  }
  if (launchRow.checked !== 'false') {
    return fail(`the launch switch began as aria-checked=${launchRow.checked}`);
  }
  log(`launch switch rendered: "${launchRow.label}" — ${launchRow.note}`);

  const pressed = await cdp.evaluate(`(async () => {
    document.querySelector('.lexium-autostart button[role="switch"]').click();
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const status = await window.kryvex.speechStatus();
      const checked = document.querySelector('.lexium-autostart button[role="switch"]').getAttribute('aria-checked');
      // The answer travels through the main process and then a React render,
      // so both have to agree before the press counts as done.
      if (status.autostart && checked === 'true') return { phase: status.phase, checked };
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  })()`);
  if (!pressed) return fail('pressing the launch switch did not turn it on');
  if (pressed.checked !== 'true') return fail(`the switch stayed aria-checked=${pressed.checked}`);
  if (pressed.phase === 'running') {
    return fail('an engine that is not installed was reported running');
  }
  log(`pressing the switch turned it on (phase ${pressed.phase})`);

  // The choice has to outlive the window: it lives in the runtime's own config,
  // which is read before the renderer exists on the next launch.
  const savedConfig = path.join(userData, 'speech', 'kryvex-speech.json');
  if (!fs.existsSync(savedConfig)) return fail('the switch was not written to the speech config');
  const saved = JSON.parse(fs.readFileSync(savedConfig, 'utf8'));
  if (saved.autostart !== true) {
    return fail(`the config saved autostart=${String(saved.autostart)}`);
  }
  log('the choice survives a restart: speech/kryvex-speech.json says autostart true');

  const released = await cdp.evaluate(`(async () => {
    document.querySelector('.lexium-autostart button[role="switch"]').click();
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const status = await window.kryvex.speechStatus();
      const checked = document.querySelector('.lexium-autostart button[role="switch"]').getAttribute('aria-checked');
      if (!status.autostart && checked === 'false') {
        return { phase: status.phase, pid: status.pid, checked };
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  })()`);
  if (!released) return fail('pressing the launch switch again did not turn it off');
  if (released.phase === 'running' || released.pid) {
    return fail('turning the switch off left an engine running');
  }
  log(`pressing it again turned it off (phase ${released.phase})`);

  // -------------------------------------------------- Windows startup ---
  const startup = await cdp.evaluate(`window.kryvex.startupStatus()`);
  if (!startup || typeof startup !== 'object') return fail('startupStatus returned nothing');
  if (startup.supported !== true) {
    return fail(`Windows startup reported unsupported: ${JSON.stringify(startup)}`);
  }
  if (startup.canChange !== false) {
    return fail('an unpackaged run offered to write a Windows Run entry');
  }
  const refused = await cdp.evaluate(`window.kryvex.startupSet(true)`);
  if (!refused || refused.enabled !== false) {
    return fail('an unpackaged run wrote a Windows startup entry');
  }
  log('an unpackaged run refuses to register a startup entry');

  await cdp.evaluate(`window.location.hash = '#/settings'; true`);
  await sleep(1500);
  const startupRow = await cdp.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.setting-row')];
    const match = rows.find(row => (row.querySelector('strong')?.textContent ?? '').trim() === 'Start with Windows');
    if (!match) return { found: false };
    const button = match.querySelector('button[role="switch"]');
    return {
      found: true,
      note: (match.querySelector('p')?.textContent ?? '').trim(),
      disabled: button ? button.disabled : null,
      checked: button ? button.getAttribute('aria-checked') : null,
    };
  })()`);
  if (!startupRow.found) return fail('Settings has no Start with Windows row');
  if (startupRow.disabled !== true) return fail('the startup switch is usable in an unpackaged run');
  if (startupRow.checked !== 'false') {
    return fail(`the startup switch claims aria-checked=${startupRow.checked}`);
  }
  if (startupRow.note !== 'Available in the installed app.') {
    return fail(`the startup row reads "${startupRow.note}"`);
  }
  log(`Settings startup row: ${startupRow.note}`);

  // Nothing was downloaded by looking at it.
  const after = await cdp.evaluate(`window.kryvex.speechStatus()`);
  if (after.installed) return fail('opening the panel installed something');
  log('opening the panel left the machine untouched');

  cdp.close();
  log('PASS one-click speech engine bridge and card');
  finish(0);
}

main().catch(error => fail(String(error && error.stack ? error.stack : error)));
