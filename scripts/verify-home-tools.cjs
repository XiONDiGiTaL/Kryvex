/* eslint-disable no-console */
/**
 * Drives an installed Kryvex build over CDP and checks the Home board's world
 * clock and capture card, plus the version the app reports.
 *
 * The board is used the way a user uses it: the widget picker switches the cards
 * on, the 12-hour switch is pressed, a city is typed and added, and its row is
 * removed. Nothing is seeded into the profile, so a broken default is caught.
 *
 * Usage:
 *   node scripts/verify-home-tools.cjs
 *   node scripts/verify-home-tools.cjs --exe "C:\\Kryvex\\Kryvex.exe"
 *
 * Env: `KRYVEX_EXE` picks the binary, `KRYVEX_CDP_PORT` the debugging port.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
const exeArg = args.indexOf('--exe');
const PORT = Number(process.env.KRYVEX_CDP_PORT || 9377);
const EXE =
  (exeArg >= 0 ? args[exeArg + 1] : undefined) || process.env.KRYVEX_EXE || 'C:\\Kryvex\\Kryvex.exe';
const profile = path.join(os.tmpdir(), `kryvex-hotfix-${Date.now()}`);
const checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `, ${detail}` : ''}`);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function listTargets() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return response.json();
}

async function firstPage() {
  const targets = await listTargets();
  return targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.next = 1;
    this.pending = new Map();
    this.exceptions = [];
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data.toString());
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.exceptions.push(message.params?.exceptionDetails?.text ?? 'exception');
      }
    });
  }

  ready() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }

  close() {
    this.ws.close();
  }
}

async function waitFor(cdp, expression, label, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (await cdp.eval(expression)) return true;
    } catch {
      /* page may still be loading */
    }
    await sleep(500);
  }
  console.log(`  timed out waiting for ${label}`);
  return false;
}

async function main() {
  const child = spawn(EXE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`], {
    detached: false,
    stdio: 'ignore',
  });
  console.log(`launched ${EXE} (pid ${child.pid})`);

  let target = null;
  for (let attempt = 0; attempt < 60 && !target; attempt += 1) {
    await sleep(500);
    try {
      target = await firstPage();
    } catch {
      /* not listening yet */
    }
  }
  if (!target) throw new Error('no page target appeared');
  check('the installed app opened a page', true, target.url);

  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  await waitFor(cdp, 'typeof window.kryvex === "object" && Boolean(document.body)', 'the shell bridge');
  await sleep(1500);

  const version = await cdp.eval('(window.kryvex && window.kryvex.appInfo) ? window.kryvex.appInfo().then(info => info.version) : ""');
  check('the app reports 0.9.4-hotfix.1', version === '0.9.4-hotfix.1', String(version));

  await cdp.eval('location.hash = "#/home"; true');
  await sleep(1200);

  // Switch both cards on through the board's own widget picker, the way a user
  // would, rather than writing a settings file behind the app's back.
  const picked = await cdp.eval(`(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const customize = document.querySelector('.home-customize');
    if (!customize) return 'no widget picker';
    customize.click();
    await wait(400);
    const names = [...document.querySelectorAll('.home-widget-name')];
    const pick = label => {
      const button = names.find(b => b.textContent.trim().toLowerCase() === label);
      if (button && button.getAttribute('aria-pressed') !== 'true') button.click();
      return Boolean(button);
    };
    const clock = pick('world clock');
    const capture = pick('screen capture');
    customize.click();
    await wait(600);
    return JSON.stringify({ clock, capture });
  })()`);
  const pickResult = JSON.parse(picked === 'no widget picker' ? '{}' : picked);
  check('both cards can be switched on from the widget picker', pickResult.clock && pickResult.capture, picked);

  const page2 = cdp;

  const reachable = await waitFor(
    page2,
    'Boolean(document.querySelector("input[aria-label=\\"Search a city for the clock\\"]"))',
    'the clock card',
  );
  check('the Home board draws the world clock card', reachable);

  const captureReady = await page2.eval(
    'Boolean(document.querySelector("select")) && [...document.querySelectorAll("button")].some(b => b.textContent.includes("Capture still"))',
  );
  check('the Home board draws the capture card with a target list', captureReady);

  await waitFor(
    page2,
    '(() => { const s = document.querySelector("select"); return Boolean(s) && s.options.length > 1; })()',
    'the capture targets',
    40,
  );
  const targets = await page2.eval(`(() => {
    const select = document.querySelector('select');
    return select ? [...select.options].map(o => o.textContent.trim()).slice(0, 8) : [];
  })()`);
  check('the capture card lists somewhere to capture', targets.length > 1, targets.join(' | '));

  const startedHour12 = await page2.eval(
    '[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "24H")',
  );
  const toggled = await page2.eval(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '24H' || b.textContent.trim() === '12H');
    if (!button) return 'no toggle';
    button.click();
    return 'clicked';
  })()`);
  await sleep(600);
  const nowHour12 = await page2.eval(
    '[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "12H")',
  );
  check('the 12/24-hour switch flips', startedHour12 && toggled === 'clicked' && nowHour12);

  // City entry goes through the same keyless geocoder the weather card uses.
  const typed = await page2.eval(`(() => {
    const input = document.querySelector('input[aria-label="Search a city for the clock"]');
    if (!input) return 'no field';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Izmir');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const form = input.closest('form');
    if (form) form.requestSubmit();
    return 'submitted';
  })()`);
  check('a city can be typed and submitted', typed === 'submitted');

  const applied = await waitFor(
    page2,
    '[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "Add city")',
    'the Izmir lookup result',
    40,
  );
  check('the lookup offers the city to add', applied);
  await page2.eval(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add city');
    if (button) button.click();
    return true;
  })()`);

  const added = await waitFor(
    page2,
    '[...document.querySelectorAll(".home-clock-remove")].length > 0 && document.body.innerText.toLowerCase().includes("izmir")',
    'the Izmir row',
    60,
  );
  check('Izmir resolves to a row labelled with the city', added);

  const removedCount = await page2.eval(`(async () => {
    const before = document.querySelectorAll('.home-clock-remove').length;
    const button = document.querySelector('.home-clock-remove');
    if (button) button.click();
    await new Promise(resolve => setTimeout(resolve, 500));
    return { before, after: document.querySelectorAll('.home-clock-remove').length };
  })()`);
  check(
    'an added row can be removed',
    removedCount.before > 0 && removedCount.after === removedCount.before - 1,
    `${removedCount.before} → ${removedCount.after}`,
  );

  const errors = cdp.exceptions.length;
  check('no page-exception was raised', errors === 0, `${errors} exceptions`);

  cdp.close();
  await sleep(300);
  try {
    child.kill();
  } catch {
    /* already gone */
  }
  try {
    await sleep(1500);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    console.log(`  profile left at ${profile}`);
  }

  const failed = checks.filter(entry => !entry.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  setTimeout(() => process.exit(failed === 0 ? 0 : 1), 250);
}

setTimeout(() => {
  console.log('watchdog: the harness ran out of time');
  process.exit(2);
}, 240_000).unref();

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 250);
});
