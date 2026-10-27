/* eslint-disable no-console */
/**
 * End-to-end check for the in-box dictation engine's language guard.
 *
 * The report behind this harness: a Turkish song was transcribed with "Use this
 * PC" on a machine whose only recogniser is English, and the result was fluent
 * English that was nowhere in the audio. The engine does not refuse foreign
 * audio, so the refusal has to happen here, before anything is sent.
 *
 * The app is driven with a real WAV, a real language selection and a real
 * click, in a disposable profile pinned to the PC engine:
 *
 *   - Turkish is refused, with a message naming the installed recogniser, and
 *     the refusal is immediate (the engine never ran);
 *   - English then produces a transcript, so the guard is not a blanket block;
 *   - the transcript is labelled as dictated on this PC.
 *
 * Run after `pnpm build`:
 *
 *   node scripts/verify-lexium-language.cjs
 */
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'screenshots');
const PORT = Number(process.env.KRYVEX_CDP_PORT || 9394);
const PHRASE = 'The quick brown fox jumps over the lazy dog.';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const children = [];

function log(message) {
  process.stdout.write(`${message}\n`);
}

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
  await send('DOM.enable');
  return { evaluate, send, exceptions, close: () => socket.close() };
}

async function waitFor(evaluate, expression, timeout = 8000, label = expression) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(150);
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
  log(`PASS ${message}`);
}

/** The only audio this machine can produce on demand: the Windows synthesizer. */
function synthesise() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-lexium-lang-'));
  const wave = path.join(dir, 'spoken.wav');
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${wave}'); $s.Speak('${PHRASE}'); $s.Dispose()`,
    ],
    { stdio: 'ignore' },
  );
  if (!fs.existsSync(wave) || fs.statSync(wave).size < 1024) {
    throw new Error('the synthesizer wrote no usable audio');
  }
  return wave;
}

/** Picks a language code the renderer offers and this machine has no recogniser for. */
function languageOptions(cultures) {
  const installed = cultures.map(culture => String(culture).split(/[-_]/)[0].toLowerCase());
  return { installed, missing: installed.includes('tr') ? 'ja' : 'tr' };
}

async function main() {
  if (process.platform !== 'win32') {
    log('SKIP the in-box speech engine only exists on Windows');
    return;
  }
  const wave = synthesise();
  log(`synthesised ${fs.statSync(wave).size} bytes of speech`);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-lexium-profile-'));
  const userData = path.join(profile, 'Kryvex');
  fs.mkdirSync(userData, { recursive: true });
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
        themeGallerySeen: true,
        secretServices: true,
        startView: 'lexium',
        // The engine under test, chosen explicitly so the one-time migration
        // does not decide it for us.
        lexium: {
          engine: 'windows-speech',
          baseUrl: '',
          model: '',
          language: 'tr',
          target: 'en',
          migrated: true,
        },
      },
    }),
  );

  const port = launch(profile);
  const page = await target(port);
  const client = await connect(page.webSocketDebuggerUrl);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.app-sidebar'))`, 14000, 'the shell');
  await client.evaluate(`window.location.hash = '#/lexium'; true;`);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.lexium-run'))`, 10000, 'the transcriber');

  // The engine line lives in the "Engines and languages" section and is what
  // tells the user which languages this PC has; it is what the guard is built
  // on, so open the section and read it rather than guessing.
  await client.evaluate(`(() => {
    const details = [...document.querySelectorAll('details')].find(node =>
      /Engines and languages/i.test(node.querySelector('summary')?.textContent ?? ''));
    if (details) details.open = true;
    return Boolean(details);
  })()`);
  await waitFor(
    client.evaluate,
    `/en-US/.test(document.body.innerText)`,
    20000,
    'the engine probe to report en-US',
  );
  check(true, 'the engine line names the installed recogniser (en-US)');

  const seeded = await client.evaluate(
    `document.querySelector('.lexium-row .lexium-field select')?.value ?? ''`,
  );
  check(seeded === 'tr', `the profile asks for Turkish, the language this PC cannot hear (${seeded})`);
  const { installed, missing } = languageOptions(['en-US']);

  // Load real audio through the real file input.
  const doc = await client.send('DOM.getDocument');
  const input = await client.send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    // The audio input is the one that accepts a .wav; the image input does not.
    selector: 'input[type="file"][accept*=".wav"]',
  });
  if (!input.nodeId) throw new Error('the audio input was not found');
  await client.send('DOM.setFileInputFiles', { files: [wave], nodeId: input.nodeId });
  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.lexium-run:not([disabled])'))`,
    12000,
    'the decoded audio',
  );
  check(true, 'the synthesised recording decoded in the renderer');

  // 1. Turkish (or whichever language is absent) is refused before any work.
  const before = await client.evaluate(`performance.now()`);
  await client.evaluate(`document.querySelector('.lexium-run').click(); true;`);
  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.lexium-error'))`,
    6000,
    'the language message',
  );
  const elapsed = await client.evaluate(`performance.now()`) - before;
  const guard = await client.evaluate(`(() => ({
    error: document.querySelector('.lexium-error')?.textContent ?? '',
    result: Boolean(document.querySelector('.lexium-result')),
    transcribing: document.querySelector('.lexium-run')?.textContent ?? '',
  }))()`);
  check(!guard.result, 'no transcript is produced for a language this PC does not have');
  check(/en-US/.test(guard.error), 'the message names the recogniser this PC actually has');
  check(
    /dictation engine/i.test(guard.error),
    'the message says it is the PC dictation engine that cannot hear the language',
  );
  check(
    !/Transcribing/.test(guard.transcribing),
    'the engine was not started for that request',
  );
  check(elapsed < 2000, `the refusal is immediate (${Math.round(elapsed)} ms, no recognition ran)`);
  log(`   message: ${guard.error}`);
  await shot(client, 'lexium-language-guard');

  // 2. The installed language still works, so the guard is not a blanket block.
  await client.evaluate(`(() => {
    const select = document.querySelector('.lexium-row .lexium-field select');
    if (!select) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, 'en');
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    client.evaluate,
    `document.querySelector('.lexium-row .lexium-field select')?.value === 'en'`,
    4000,
    'the language selection',
  );
  await client.evaluate(`document.querySelector('.lexium-run').click(); true;`);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.lexium-result'))`, 60000, 'the transcript');
  const result = await client.evaluate(`(() => ({
    text: document.querySelector('.lexium-transcript')?.value ?? '',
    head: document.querySelector('.lexium-result-head')?.innerText ?? '',
    note: document.querySelector('.lexium-dictation')?.textContent ?? '',
    uncertain: Boolean(document.querySelector('.lexium-dictation.is-uncertain')),
  }))()`);
  check(/quick brown fox/i.test(result.text), 'the installed language still transcribes the recording');
  check(/English/.test(result.head), 'the transcript is labelled with the language that was recognised');
  check(
    result.note.length > 0 && !result.uncertain,
    'the result says it was dictated on this PC, without claiming to be unsure',
  );
  log(`   transcript: ${result.text}`);
  await shot(client, 'lexium-dictation');

  check(
    client.exceptions.length === 0,
    `no renderer exception was thrown${client.exceptions.length ? `: ${client.exceptions[0]}` : ''}`,
  );
  log(`   installed recognisers: ${installed.join(', ')}; refused language: ${missing}`);

  log(`\n${lines.length}/${lines.length} PASS`);
  try {
    fs.rmSync(path.dirname(wave), { recursive: true, force: true });
  } catch {
    /* disposable audio */
  }
}

main()
  .catch(error => {
    log(`FAIL ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stop();
  });
