/* eslint-disable no-console */
/**
 * Verifies the self-update chain on an installed build, including the installer
 * wizard it hands over to.
 *
 * `verify:updater` proves the update state machine against a loopback feed. This
 * proves the real thing: the live GitHub release feed, the downloaded
 * installer's checksum, the app quitting, the NSIS wizard the app launches,
 * every page of that wizard, the installer's exit code, and the version the
 * binary reports afterwards.
 *
 * Usage:
 *   node scripts/verify-self-update.cjs                 installed build, live feed
 *   node scripts/verify-self-update.cjs --wizard        also capture the wizard,
 *                                                       reinstalling the current
 *                                                       release when nothing newer
 *                                                       exists
 *   node scripts/verify-self-update.cjs --installer <p> capture this installer
 *   node scripts/verify-self-update.cjs --no-app        skip the app, wizard only
 *   node scripts/verify-self-update.cjs --exe <path>    use another installation
 *   node scripts/verify-self-update.cjs --archive       copy the capture into
 *                                                       docs/media/releases/
 *                                                       <version>-wizard/ for
 *                                                       the release record
 *
 * Readiness: the app is started with an isolated profile, so the run does not
 * touch the user's settings, tabs or sessions. The installer itself still writes
 * the installation directory, because that is the thing being verified.
 */
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

function flag(name) {
  return args.includes(`--${name}`);
}

function option(name) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`--${name} needs a value`);
  return value;
}

const cdpPort = Number(process.env.KRYVEX_SELF_UPDATE_CDP_PORT || 9352);
const registryKey = 'HKCU\\Software\\net.xiondigital.kryvex';
const out = path.resolve(option('out') || path.join(root, '.tmp-self-update'));
const profile = path.join(out, 'profile');
const report = {
  startedAt: new Date().toISOString(),
  stages: [],
  wizard: null,
  checks: [],
};

fs.mkdirSync(out, { recursive: true });
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(path.join(profile, 'local'), { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function save() {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
}

function check(name, ok, detail) {
  report.checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

function run(commandLine) {
  return spawnSyncSafe(commandLine);
}

function spawnSyncSafe(commandLine, cwd, options = {}) {
  const { spawnSync } = require('node:child_process');
  return spawnSync(commandLine[0], commandLine.slice(1), {
    cwd: cwd || root,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
}

function productVersion(exe) {
  const result = run([
    'powershell.exe',
    '-NoProfile',
    '-Command',
    `(Get-Item -LiteralPath '${exe}').VersionInfo.ProductVersion`,
  ]);
  return (result.stdout || '').trim();
}

function installedExe() {
  const explicit = option('exe');
  if (explicit) return path.resolve(explicit);
  const query = run(['reg', 'query', registryKey, '/v', 'InstallLocation']);
  if (query.status === 0) {
    const match = /InstallLocation\s+REG_SZ\s+(.+)/.exec(query.stdout || '');
    if (match) {
      const candidate = path.join(match[1].trim(), 'Kryvex.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  const fallback = 'C:\\Kryvex\\Kryvex.exe';
  if (fs.existsSync(fallback)) return fallback;
  throw new Error('No installed Kryvex found; pass --exe <path to Kryvex.exe>.');
}

async function releaseInfo() {
  const response = await fetch('https://api.github.com/repos/XiONDiGiTaL/Kryvex/releases/latest', {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'kryvex-self-update-check' },
  });
  if (!response.ok) throw new Error(`the release feed answered ${response.status}`);
  const release = await response.json();
  const asset = name => release.assets.find(item => item.name === name);
  const sums = asset('SHA256SUMS.txt');
  if (!sums) throw new Error('the release has no SHA256SUMS.txt');
  const text = await fetch(sums.browser_download_url).then(item => {
    if (!item.ok) throw new Error(`SHA256SUMS.txt answered ${item.status}`);
    return item.text();
  });
  const checksums = new Map();
  for (const line of text.split('\n')) {
    const match = /^([0-9a-f]{64})\s+\*?(\S+)$/.exec(line.trim());
    if (match) checksums.set(match[2], match[1]);
  }
  return {
    version: String(release.tag_name || '').replace(/^v/, ''),
    setup: asset('Kryvex-Setup-' + String(release.tag_name).replace(/^v/, '') + '-x64.exe'),
    checksums,
    url: release.html_url,
  };
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function download(url, target) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'kryvex-self-update-check', Accept: 'application/octet-stream' },
  });
  if (!response.ok) throw new Error(`download answered ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(target, bytes);
  return bytes.length;
}

/* ------------------------------------------------------------------ wizard */

function captureWizard({ installer, processName, timeout = 420 }) {
  const script = path.join(root, 'scripts', 'verify-wizard.ps1');
  fs.rmSync(path.join(out, 'wizard'), { recursive: true, force: true });
  const commandLine = [
    'powershell.exe',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    script,
    ...(installer ? ['-Installer', installer] : ['-ProcessName', processName]),
    '-OutDir',
    path.join(out, 'wizard'),
    '-TimeoutSeconds',
    String(timeout),
  ];
  const result = spawnSyncSafe(commandLine, root, { timeout: (timeout + 120) * 1000 });
  const stdout = result.stdout || '';
  const manifest = path.join(out, 'wizard', 'wizard.json');
  let data = null;
  if (fs.existsSync(manifest)) {
    // Windows PowerShell writes a BOM with -Encoding UTF8; strip it.
    const raw = fs.readFileSync(manifest, 'utf8').replace(/^\uFEFF/, '');
    data = JSON.parse(raw);
  }
  return { status: result.status, stdout, stderr: result.stderr || '', data };
}

/* --------------------------------------------------------------- app drive */

function launchApp(exe) {
  const child = spawn(exe, [`--remote-debugging-port=${cdpPort}`], {
    cwd: path.dirname(exe),
    env: {
      ...process.env,
      KRYVEX_USER_DATA: path.join(profile, 'Kryvex'),
      APPDATA: profile,
      LOCALAPPDATA: path.join(profile, 'local'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', data => process.stderr.write(`[app:err] ${data}`));
  return child;
}

async function target() {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(response =>
        response.json(),
      );
      const page = list.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  throw new Error('the app did not expose a DevTools endpoint');
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
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'failed');
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { evaluate, send };
}

const PANEL = `(() => {
  const panel = document.querySelector('#updates');
  if (!panel) return null;
  const status = panel.querySelector('.update-status');
  return {
    header: (panel.querySelector('.section-head .muted-label') || {}).innerText || '',
    phase: [...(status ? status.classList : [])].find(name => name.startsWith('is-')) || '',
    title: (panel.querySelector('.update-status strong') || {}).innerText || '',
    detail: (panel.querySelector('.update-status p') || {}).innerText || '',
    verdict: (panel.querySelector('[data-testid="update-up-to-date"]') || {}).innerText || '',
    buttons: [...panel.querySelectorAll('.update-actions button')].map(button =>
      button.innerText.replace(/\\s+/g, ' ').trim(),
    ),
  };
})()`;

async function clickButton(cdp, label) {
  const clicked = await cdp.evaluate(`(() => {
    const panel = document.querySelector('#updates');
    const button = [...panel.querySelectorAll('button')].find(node =>
      node.innerText.replace(/\\s+/g, ' ').includes(${JSON.stringify(label)}),
    );
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`no button labelled "${label}" in the Updates panel`);
}

function normalizeVersion(value) {
  return String(value || '')
    .trim()
    .replace(/^v/i, '')
    .replace(/(\.0)+$/, '');
}

function sameVersion(a, b) {
  return normalizeVersion(a) === normalizeVersion(b) && normalizeVersion(a) !== '';
}

function recordFileAfter(exe) {
  const stat = fs.statSync(exe);
  return { bytes: stat.size, mtime: stat.mtime.toISOString() };
}

/**
 * The assertions that do not depend on which release is involved. NSIS restores
 * the archive timestamps of the files it copies, so an unchanged `Kryvex.exe`
 * mtime does not mean nothing was written (a same-version reinstall leaves it
 * untouched and still replaces `resources` and `locales`). Progress is therefore
 * judged from the wizard's own pages: an install page that actually ran, and a
 * finish page, with the installer's exit code.
 */
function assertWizardCapture(wizard) {
  const list = wizard.pages || [];
  check(
    'the wizard showed more than one page',
    wizard.pageCount >= 2,
    `${wizard.pageCount} pages: ${list.map(page => page.title || '(untitled)').join(' → ')}`,
  );
  check('the installer exited 0', wizard.exitCode === 0, `exit code ${wizard.exitCode}`);

  // "Choose Installation Options" and "Installation Complete" also contain
  // "install", so match the progress page by its own heading or its copy.
  const installing = list.find(
    page =>
      /^install(ing)?$/i.test(page.title) ||
      (page.texts || []).some(text => /please wait/i.test(text)),
  );
  check(
    'the wizard opened an install progress page',
    Boolean(installing),
    installing ? `"${installing.title}"` : 'no install page was captured',
  );
  const next = installing ? list.find(page => page.index === installing.index + 1) : null;
  if (installing && next) {
    const ms = new Date(next.at) - new Date(installing.at);
    check(
      'the install page ran instead of being skipped',
      ms >= 5000,
      `${ms} ms between "${installing.title}" and "${next.title}"`,
    );
  }
  const finishing = list.find(page => /complet|finish|success/i.test(page.title));
  check(
    'the wizard reached its finish page',
    Boolean(finishing),
    finishing ? `"${finishing.title}"` : 'no finish page was captured',
  );
  check(
    'every page was photographed',
    list.every(page => Boolean(page.image)),
    `${list.filter(page => page.image).length}/${list.length} pages`,
  );
}

/**
 * Copies the capture into the repository, next to the release record, so a tag
 * carries what its installer actually showed. Paths inside the manifest are
 * relative to that directory; the temp paths from the run are not recorded.
 */
function archiveCapture(version) {
  if (!report.wizard) {
    check('the capture was archived with the release record', false, 'no wizard capture in this run');
    return null;
  }
  const target = path.join(root, 'docs', 'media', 'releases', `${version}-wizard`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.join(target, 'pages'), { recursive: true });

  const pages = (report.wizard.pages || []).map(page => {
    const name = path.basename(page.image || `page-${page.index}.png`);
    if (page.image && fs.existsSync(page.image)) {
      fs.copyFileSync(page.image, path.join(target, 'pages', name));
    }
    return {
      index: page.index,
      title: page.title,
      windowTitle: page.windowTitle,
      texts: page.texts,
      buttons: page.buttons,
      image: page.image ? `pages/${name}` : null,
      at: page.at,
    };
  });

  const manifest = {
    version,
    installerVersion: report.installerVersion || null,
    installer: report.wizard.installer ? path.basename(report.wizard.installer) : null,
    recordedAt: new Date().toISOString(),
    startedHere: report.wizard.startedHere,
    exitCode: report.wizard.exitCode,
    pageCount: report.wizard.pageCount,
    durationMs: report.wizard.durationMs,
    pages,
  };
  fs.writeFileSync(path.join(target, 'wizard.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const rows = pages.map(page => {
    const detail = (page.texts || [])
      .slice(1, 4)
      .join(' · ')
      .replace(/\|/g, '\\|');
    const label = page.image
      ? `[${page.title || `Page ${page.index}`}](${page.image.split('/').map(encodeURIComponent).join('/')})`
      : page.title;
    return `| ${page.index} | ${label} | ${detail} |`;
  });
  const passes = report.checks
    .map(item => `- ${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`)
    .join('\n');
  const markdown = `# Wizard capture — Kryvex ${version}

Recorded ${manifest.recordedAt} by \`pnpm verify:self-update --wizard --archive\`.

| Field | Value |
| --- | --- |
| Installer | \`${manifest.installer || 'unknown'}\` |
| Installer version | ${manifest.installerVersion || 'unknown'} |
| Pages | ${manifest.pageCount} |
| Exit code | ${manifest.exitCode} |
| Mode | ${manifest.startedHere ? 'started by the harness' : 'attached to the installer the app launched'} |

| # | Page | Text on the page |
| --- | --- | --- |
${rows.join('\n')}

The wizard is a native Windows dialog, so these pages cannot appear in a CDP
screenshot of the shell. They are read from the dialog's own controls in visual
order, and the installer's exit code comes from a process handle opened while it
was alive.

## Checks from the run

${passes}
`;
  fs.writeFileSync(path.join(target, 'capture.md'), markdown);

  check(
    'the capture was archived with the release record',
    true,
    `docs/media/releases/${version}-wizard/`,
  );
  return target;
}

function kryvexPids() {
  const result = run([
    'powershell.exe',
    '-NoProfile',
    '-Command',
    "(Get-Process -Name Kryvex -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }) -join ','",
  ]);
  return (result.stdout || '')
    .trim()
    .split(',')
    .filter(Boolean)
    .map(Number);
}

async function stopNewApps(before) {
  if (flag('keep')) return [];
  const now = kryvexPids();
  const added = now.filter(pid => !before.includes(pid));
  for (const pid of added) {
    run(['taskkill', '/PID', String(pid), '/F']);
  }
  return added;
}

/* -------------------------------------------------------------------- main */

(async () => {
  const before = kryvexPids();
  const exe = flag('no-app') ? null : installedExe();
  const wizardOnly = flag('no-app');

  if (!wizardOnly) {
    const stat = fs.statSync(exe);
    report.installation = {
      exe,
      versionBefore: productVersion(exe),
      fileBefore: { bytes: stat.size, mtime: stat.mtime.toISOString() },
    };
    console.log(`installed: ${exe} (${report.installation.versionBefore})`);
  }

  const release = await releaseInfo();
  report.release = { version: release.version, url: release.url };
  console.log(`latest published: ${release.version}`);

  const requestedInstaller = option('installer');
  let installerToCapture = requestedInstaller ? path.resolve(requestedInstaller) : undefined;
  let versionAfter = null;

  if (!wizardOnly) {
    const child = launchApp(exe);
    let cdp = null;
    try {
      const page = await target();
      cdp = await connect(page.webSocketDebuggerUrl);
      const waitFor = async (expression, label, attempts = 400) => {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          const value = await cdp.evaluate(expression);
          if (value) return value;
          await sleep(250);
        }
        throw new Error(`timed out waiting for ${label}`);
      };

      await waitFor(`Boolean(document.querySelector('.app'))`, 'the shell');
      report.appInfo = await cdp.evaluate('window.kryvex.appInfo()');
      await cdp.evaluate(`window.location.hash = '#/settings'; true`);
      await waitFor(`Boolean(document.querySelector('#updates'))`, 'the Updates panel');
      await cdp.evaluate(
        `document.querySelector('#updates').scrollIntoView({ block: 'center' }); true`,
      );
      await sleep(400);
      report.stages.push({ stage: 'before-check', ...(await cdp.evaluate(PANEL)) });
      console.log(`before: ${report.stages.at(-1).title}`);

      await clickButton(cdp, 'Check for updates');
      const terminal = await waitFor(
        `(() => {
          const status = document.querySelector('#updates .update-status');
          if (!status) return null;
          const phase = [...status.classList].find(name => name.startsWith('is-'));
          return ['is-available', 'is-current', 'is-error'].includes(phase) ? phase : null;
        })()`,
        'a settled update check',
      );
      await sleep(400);
      report.stages.push({ stage: 'after-check', ...(await cdp.evaluate(PANEL)) });
      console.log(`after check: ${report.stages.at(-1).phase} — ${report.stages.at(-1).title}`);

      if (terminal === 'is-error') {
        throw new Error(`the update check failed: ${report.stages.at(-1).title}`);
      }

      const newer = terminal === 'is-available';
      check(
        'the live feed reports the installed version',
        newer || report.stages.at(-1).verdict.includes('UP TO DATE'),
        newer ? `offers ${release.version}` : 'up to date',
      );

      if (newer) {
        await clickButton(cdp, 'Download update');
        let ready = null;
        for (let attempt = 0; attempt < 2400; attempt += 1) {
          const state = await cdp.evaluate(PANEL);
          if (state.phase === 'is-ready') {
            ready = state;
            break;
          }
          if (state.phase === 'is-error') throw new Error(`download failed: ${state.title}`);
          await sleep(500);
        }
        if (!ready) throw new Error('the download never reported ready');
        report.stages.push({ stage: 'ready', ...ready });
        console.log(`ready: ${ready.title}`);

        const updatesDir = path.join(profile, 'Kryvex', 'updates');
        const files = fs.existsSync(updatesDir)
          ? fs.readdirSync(updatesDir).filter(name => name.endsWith('.exe'))
          : [];
        const downloaded = files
          .map(name => path.join(updatesDir, name))
          .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
        if (!downloaded) throw new Error('the app reported ready but wrote no installer');
        const digest = sha256(downloaded);
        const expected = release.checksums.get(path.basename(downloaded));
        report.download = {
          file: downloaded,
          bytes: fs.statSync(downloaded).size,
          sha256: digest,
          expected,
        };
        check(
          'the downloaded installer matches the published checksum',
          Boolean(expected) && digest === expected,
          `${path.basename(downloaded)} ${fs.statSync(downloaded).size} B`,
        );
        installerToCapture = downloaded;

        const expectedName = path.basename(downloaded, '.exe');
        await clickButton(cdp, 'Install and restart');
        report.stages.push({ stage: 'after-install-click', ...(await cdp.evaluate(PANEL)) });

        const exited = await Promise.race([
          new Promise(resolve => child.once('exit', code => resolve({ code, signal: null }))),
          sleep(90000).then(() => null),
        ]);
        report.appExit = exited;
        check('the app quit so the installer could run', Boolean(exited), JSON.stringify(exited));

        const capture = captureWizard({ processName: expectedName, timeout: 420 });
        report.wizard = capture.data;
        process.stdout.write(capture.stdout);
        if (capture.stderr) process.stderr.write(capture.stderr);
        report.installerVersion = productVersion(installerToCapture);
      } else {
        report.stages.push({ stage: 'up-to-date', ...(await cdp.evaluate(PANEL)) });
      }
    } finally {
      if (cdp) {
        try {
          cdp.close();
        } catch {
          /* the socket is already gone when the app quit to install */
        }
      }
      if (child.exitCode === null) {
        child.kill();
        await Promise.race([
          new Promise(resolve => child.once('exit', resolve)),
          sleep(8000),
        ]);
      }
    }

    versionAfter = productVersion(exe);
    report.installation.versionAfter = versionAfter;

    if (report.wizard) {
      assertWizardCapture(report.wizard);
      check(
        'the installed binary reports the released version',
        sameVersion(versionAfter, release.version),
        `${versionAfter}`,
      );
      report.installation.fileAfter = recordFileAfter(exe);
      report.installation.fileNote =
        'NSIS restores archive timestamps, so these file times are informational.';
    }
  }

  // A wizard run with no install in front of it: reinstall the current release
  // so the capture is exercised even when nothing newer is published.
  if (!report.wizard && (wizardOnly || flag('wizard'))) {
    let installer = installerToCapture;
    if (!installer) {
      if (!release.setup) throw new Error('the release has no Setup asset to capture');
      const target = path.join(out, release.setup.name);
      const expected = release.checksums.get(release.setup.name);
      let bytes = null;
      if (fs.existsSync(target) && expected && sha256(target) === expected) {
        bytes = fs.statSync(target).size;
        console.log(`reusing the verified ${release.setup.name} already in ${out}`);
      } else {
        console.log(`downloading ${release.setup.name} for the wizard run`);
        bytes = await download(release.setup.browser_download_url, target);
      }
      const digest = sha256(target);
      report.wizardInstaller = {
        file: target,
        bytes,
        sha256: digest,
        expected,
      };
      check(
        'the installer used for the wizard run matches the published checksum',
        Boolean(expected) && digest === expected,
        `${release.setup.name} ${bytes} B`,
      );
      installer = target;
    }
    const version = productVersion(installer);
    const capture = captureWizard({ installer, timeout: 420 });
    report.wizard = capture.data;
    process.stdout.write(capture.stdout);
    if (capture.stderr) process.stderr.write(capture.stderr);
    report.installerVersion = version;
    if (report.wizard) {
      assertWizardCapture(report.wizard);
      if (!wizardOnly) {
        const after = productVersion(exe);
        report.installation.versionAfter = after;
        report.installation.fileAfter = recordFileAfter(exe);
        check('the binary still reports the installer version', sameVersion(after, version), after);
      }
    } else {
      check('the wizard capture produced a manifest', false, 'no wizard.json');
    }
  }

  if (flag('archive')) {
    const archived = archiveCapture(release.version);
    if (archived) {
      report.archive = path.relative(root, archived).split(path.sep).join('/');
      console.log(`archived: ${report.archive}`);
    }
  }

  const closed = await stopNewApps(before);
  report.closedApps = closed;
  if (closed.length) console.log(`closed ${closed.length} Kryvex process(es) the installer relaunched`);

  report.finishedAt = new Date().toISOString();
  report.ok = report.checks.every(item => item.ok);
  save();
  console.log(`report: ${path.join(out, 'report.json')}`);
  console.log(report.ok ? 'self-update harness: PASS' : 'self-update harness: FAIL');
  if (!report.ok) process.exitCode = 1;
})().catch(error => {
  report.error = String(error && error.stack ? error.stack : error);
  report.ok = false;
  save();
  console.error('self-update harness: FAIL', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
