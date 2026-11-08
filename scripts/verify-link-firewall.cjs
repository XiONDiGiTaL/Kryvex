/* eslint-disable no-console */
/**
 * Kryvex Link's firewall scope, checked against a real Windows Firewall.
 *
 * The unit tests cover the parser and the merge; what they cannot cover is the
 * half that matters when a phone will not connect — that `netsh` actually writes
 * `LocalSubnet,<network>` into the rule, that the rule survives the write still
 * enabled, and that Windows reads the scope back the way the app then displays
 * it. This harness drives the app's own path (the bridge method the view calls),
 * reads the result out of Windows itself, and puts the rule back exactly as it
 * found it.
 *
 * It changes the machine's firewall while it runs. It is opt-in and Windows
 * only: elsewhere it prints `skipped` and exits 0, because there is nothing to
 * read or write. Run it from an elevated PowerShell (`Start-Process
 * powershell -Verb RunAs`) so the app's own elevated calls do not ask for
 * consent on every step; the restore is the one prompt left.
 *
 * Run `pnpm build` first, or use `pnpm verify:link-firewall`.
 */
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
/** Resolved on Windows only: the skip path must not need an Electron binary. */
let electronPath = '';

const root = path.resolve(__dirname, '..');
const PORT = 9402;
const RULE = 'Kryvex Link';
/** A private network this test names, so the assertion is about a real scope. */
const FIRST_NETWORK = '192.168.222.0/24';
/** A second, distinct network: widening twice must keep both. */
const SECOND_NETWORK = '172.29.0.0/16';
/** Strings the main process must refuse before they reach an elevated command. */
const REFUSED = ['8.8.8.8/32', '0.0.0.0/0', '192.168.222.0/24; calc.exe', '412.1.1.1/24'];
const REPORT = path.join(root, '.tmp-link-firewall-report.txt');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const children = [];
const failures = [];
const lines = [];

function record(name, ok, detail) {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `, ${detail}` : ''}`;
  console.log(line);
  lines.push(line);
  if (!ok) failures.push(line);
}

function note(line) {
  console.log(line);
  lines.push(line);
}

function powershell(script, timeout = 20_000) {
  return new Promise(resolve => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout, windowsHide: true },
      (error, stdout) => resolve(error ? '' : String(stdout ?? '').trim()),
    );
  });
}

/** Runs netsh elevated, the way the app does, and waits for it. */
function netsh(argument, timeout = 60_000) {
  return new Promise(resolve => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Start-Process -FilePath netsh.exe -Verb RunAs -Wait -ArgumentList '${argument}'`,
      ],
      { timeout, windowsHide: true },
      () => resolve(),
    );
  });
}

/**
 * The rule as Windows holds it: whether it exists, whether it is enabled and the
 * remote list itself. `Enabled` prints nothing when no rule matches, which is
 * how "absent" is told apart from "switched off".
 */
async function readRule() {
  const enabled = await powershell(
    `(Get-NetFirewallRule -DisplayName '${RULE}' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Enabled | Out-String).Trim()`,
  );
  const remote = await powershell(
    `(Get-NetFirewallRule -DisplayName '${RULE}' -ErrorAction SilentlyContinue | Select-Object -First 1 | Get-NetFirewallAddressFilter | Select-Object -ExpandProperty RemoteAddress | Out-String).Trim()`,
  );
  return {
    existed: enabled !== '',
    enabled: /^true$/i.test(enabled),
    remote: remote.replace(/\r/g, '').trim(),
  };
}

/**
 * A scope string as a comparable set.
 *
 * `netsh` is free to reorder or respace the list it stored, so the restore check
 * compares what the scopes are rather than how PowerShell happened to print
 * them. Anything that differs in content still fails.
 */
function scopeKey(remote) {
  return remote
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(entry => entry.toLowerCase())
    .sort()
    .join(',');
}

/** The raw scope string, kept out of a command line unless it is plain. */
function safeRemoteArgument(remote) {
  return /^[A-Za-z0-9.,: /-]*$/.test(remote) ? remote : 'LocalSubnet';
}

/** Puts the rule back: deleted if this pass created it, restored otherwise. */
async function restore(before) {
  if (!before.existed) {
    await netsh(`advfirewall firewall delete rule name="${RULE}"`);
    return;
  }
  await netsh(
    `advfirewall firewall set rule name="${RULE}" new remoteip="${safeRemoteArgument(before.remote)}" enable=${before.enabled ? 'yes' : 'no'}`,
  );
}

function seedProfile(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  const userData = path.join(dir, 'Kryvex');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(path.join(dir, 'local'), { recursive: true });
  const state = {
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
      link: { enabled: true },
    },
  };
  fs.writeFileSync(path.join(userData, 'kryvex-state.json'), JSON.stringify(state));
  return userData;
}

function launch(profile) {
  const child = spawn(
    electronPath,
    [
      '.',
      `--remote-debugging-port=${PORT}`,
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        KRYVEX_USER_DATA: path.join(profile, 'Kryvex'),
        APPDATA: profile,
        LOCALAPPDATA: path.join(profile, 'local'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stderr.on('data', data => {
    const text = String(data);
    if (!text.includes('wgc_capturer')) process.stderr.write(text);
  });
  children.push(child);
  return child;
}

async function stop() {
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  await sleep(900);
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

async function target(port) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
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
  return { evaluate, close: () => socket.close() };
}

/** The bridge method the view's button calls, with one network in it. */
async function allow(cdp, networks) {
  const payload = JSON.stringify(networks);
  return cdp.evaluate(
    `(async () => { try { return await window.kryvex.linkAllowFirewall(${payload}); } catch (error) { return { error: String(error) }; } })()`,
  );
}

async function main() {
  if (process.platform !== 'win32') {
    note('link firewall harness: skipped (no Windows Firewall on this system)');
    fs.writeFileSync(REPORT, `${lines.join('\n')}\n`);
    return;
  }
  if (!fs.existsSync(path.join(root, 'dist-electron', 'main.js'))) {
    console.error('link firewall harness: build the app first (`pnpm build`).');
    process.exitCode = 1;
    return;
  }
  electronPath = require('electron');

  const elevated = /^true$/i.test(
    await powershell(
      `([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)`,
    ),
  );
  if (!elevated) {
    note('link firewall harness: skipped (run it from an elevated PowerShell;');
    note('  otherwise every step waits on a UAC dialog this pass cannot answer)');
    fs.writeFileSync(REPORT, `${lines.join('\n')}\n`);
    return;
  }

  const before = await readRule();
  note(
    `before: rule ${before.existed ? 'present' : 'absent'}${before.existed ? `, enabled ${before.enabled}, remote ${before.remote || 'none'}` : ''}`,
  );

  const profile = path.join(root, '.tmp-link-firewall');
  seedProfile(profile);
  launch(profile);
  const page = await target(PORT);
  const cdp = await connect(page.webSocketDebuggerUrl);
  await sleep(2600);

  try {
    const status = await cdp.evaluate('(async () => await window.kryvex.linkStatus())()');
    record('the link is listening on this machine', Boolean(status && status.running), `port ${status?.port}`);

    // What the check reports before this pass changes anything.
    const first = await cdp.evaluate('(async () => await window.kryvex.linkDiagnose())()');
    record(
      'the check reports a firewall it can read',
      first && first.firewallSupported === true && first.remote !== null,
      `${first?.firewall}, local subnet ${first?.remote?.localSubnet}, [${(first?.remote?.subnets ?? []).join(' ')}]`,
    );

    // The pass: name the phone's network, as the field does.
    const allowed = await allow(cdp, [FIRST_NETWORK]);
    record(
      'the phone’s network is allowed without an error',
      Boolean(allowed) && !allowed.error && allowed.firewall === 'open',
      allowed?.error ?? `firewall ${allowed?.firewall}`,
    );
    record(
      'the answer carries the new scope',
      Boolean(allowed?.remote) && (allowed.remote.subnets ?? []).includes(FIRST_NETWORK),
      `[${(allowed?.remote?.subnets ?? []).join(' ')}]`,
    );
    record(
      'the local subnet is kept, so the address that already worked still does',
      allowed?.remote?.localSubnet === true,
    );

    // The same fact, read out of Windows rather than out of the app.
    const written = await readRule();
    record(
      'Windows holds the rule with both scopes',
      written.remote.includes('LocalSubnet') && written.remote.includes(FIRST_NETWORK),
      written.remote,
    );
    record('the rule is enabled after the write', written.enabled === true, String(written.enabled));

    // Widening again must not drop the first network.
    const twice = await allow(cdp, [SECOND_NETWORK]);
    record(
      'a second network is added beside the first',
      Boolean(twice?.remote) &&
        twice.remote.subnets.includes(FIRST_NETWORK) &&
        twice.remote.subnets.includes(SECOND_NETWORK),
      `[${(twice?.remote?.subnets ?? []).join(' ')}]`,
    );

    // Nothing invalid reaches an elevated command line.
    for (const bad of REFUSED) {
      const answer = await allow(cdp, [bad]);
      const scope = (answer?.remote?.subnets ?? []).join(' ');
      record(
        `refuses ${JSON.stringify(bad)} and leaves the rule alone`,
        !answer?.error && !scope.includes(bad) && scope.includes(FIRST_NETWORK),
        scope,
      );
    }
    const notAnArray = await allow(cdp, 'junk');
    record(
      'refuses a payload that is not a list of networks',
      !(notAnArray?.remote?.subnets ?? []).join(' ').includes('junk'),
      `[${(notAnArray?.remote?.subnets ?? []).join(' ')}]`,
    );
  } finally {
    cdp.close();
    await stop();
    fs.rmSync(profile, { recursive: true, force: true });
    await restore(before);
  }

  // The machine is left as it was found; the pass is worthless otherwise.
  const after = await readRule();
  record(
    'the rule was put back as it was found',
    after.existed === before.existed &&
      (!before.existed ||
        (after.enabled === before.enabled && scopeKey(after.remote) === scopeKey(before.remote))),
    `rule ${after.existed ? `present, enabled ${after.enabled}, remote ${after.remote || 'none'}` : 'absent'}`,
  );

  fs.writeFileSync(REPORT, `${lines.join('\n')}\n`);
  if (failures.length > 0) {
    console.error(`link firewall harness: FAIL (${failures.length})`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('link firewall harness: PASS');
  }
}

main().catch(async error => {
  console.error('link firewall harness: FAIL', error.stack || error);
  await stop();
  process.exitCode = 1;
});
