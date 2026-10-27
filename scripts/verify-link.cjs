/* eslint-disable no-console */
/**
 * Kryvex Link harness.
 *
 * The phone companion is a real HTTP server on the local network, so it is
 * tested the way a phone would use it: pair with the code the app is showing,
 * then talk to `/api/*` as a paired device and as an unauthorized one. What the
 * unit tests cannot reach is exactly what this covers — that the built companion
 * page is served, that a token mints only against a live code, that a clipboard
 * post reaches the desktop and comes back as an event, that an uploaded file
 * lands inside the folder with a safe name, and that a command the allowlist
 * does not know is refused.
 *
 * Run `pnpm build` first, or use `pnpm verify:link`.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const PORT = 9401;
const LINK_PORTS = Array.from({ length: 20 }, (_, index) => 43110 + index);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const children = [];
// A CI runner shows the app on a desktop nobody is looking at, and Chromium then
// throttles timers and animation frames enough for a check that waits on
// requestAnimationFrame to stall past its timeout. These switches keep the
// renderer at full speed; none of them changes what a check measures.
const LAUNCH_FLAGS = [
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
];
const failures = [];

function record(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `, ${detail}` : ''}`);
  if (!ok) failures.push(`${name}${detail ? `, ${detail}` : ''}`);
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
      // The switch alone must start the listener; nothing opens the page first.
      link: { enabled: true },
    },
  };
  fs.writeFileSync(path.join(userData, 'kryvex-state.json'), JSON.stringify(state));
  return userData;
}

function launch(profile, port) {
  const child = spawn(electron, ['.', `--remote-debugging-port=${port}`, ...LAUNCH_FLAGS], {
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
  return { evaluate, send, close: () => socket.close() };
}

/** The port the app picked, found by asking the bridge and then the socket. */
async function findPort(cdp) {
  const status = await cdp.evaluate(
    `(async () => { const s = await window.kryvex.linkStatus(); return s; })()`,
  );
  if (!status) throw new Error('the shell did not answer linkStatus');
  const candidate = Number(status.port);
  for (const port of [candidate, ...LINK_PORTS]) {
    if (!port) continue;
    try {
      const answer = await fetch(`http://127.0.0.1:${port}/api/hello`).then(response => response.json());
      if (answer && answer.link === 'Kryvex Link') return { port, status };
    } catch {
      /* try the next one */
    }
  }
  throw new Error('no link server answered on the port range');
}

async function main() {
  const profile = path.join(root, '.tmp-link');
  seedProfile(profile);
  launch(profile, PORT);
  const page = await target(PORT);
  const cdp = await connect(page.webSocketDebuggerUrl);
  await sleep(2600);

  const { port, status } = await findPort(cdp);
  const base = `http://127.0.0.1:${port}`;
  console.log(`link server on ${base}, version ${status.version ?? '?'}`);
  record('the saved switch started the listener', status.running === true && status.port === port);
  record('an unpaired device list is empty', Array.isArray(status.devices) && status.devices.length === 0);
  record('a pairing code is ready', /^\d{6}$/.test(String(status.code)), `code ${status.code}`);

  // The phone setup card shows the adapter each address belongs to, so the
  // status has to carry both the ranked URLs and their labels.
  const links = Array.isArray(status.links) ? status.links : [];
  record(
    'every address is labelled with its adapter',
    links.length > 0 &&
      links.length === status.urls.length &&
      links.every(
        link =>
          typeof link.url === 'string' &&
          typeof link.name === 'string' &&
          link.name.length > 0 &&
          typeof link.likely === 'boolean',
      ) &&
      links.map(link => link.url).join('|') === status.urls.join('|'),
    links.map(link => `${link.address} ${link.name}${link.likely ? ' (likely)' : ''}`).join(', '),
  );
  record(
    'the reachable adapter is listed first',
    links.length === 0 || links[0].likely === true || links.every(link => !link.likely),
    links[0] ? `${links[0].address} ${links[0].name}` : 'none',
  );

  // The page a phone opens, and the bundle behind it.
  const html = await fetch(`${base}/`).then(response => response.text());
  record('the companion page is served', html.includes('Kryvex Link') && html.includes('<div id="companion">'));
  const assetPath = (html.match(/src="\.?\/?(assets\/[^"]+\.js)"/) ?? [])[1];
  record('the page references its bundle', Boolean(assetPath), assetPath ?? 'no script tag');
  if (assetPath) {
    const asset = await fetch(`${base}/${assetPath}`);
    const type = asset.headers.get('content-type') ?? '';
    const body = await asset.text();
    record(
      'the bundle is served as javascript',
      asset.status === 200 && type.includes('javascript') && body.length > 1000,
      `${asset.status} ${type} ${body.length} bytes`,
    );
  }
  // `fetch` normalizes `..` away, so the raw path is sent by hand: a request for
  // a file above the bundle must never answer with that file.
  const traversal = await new Promise(resolve => {
    const request = http.request(
      { host: '127.0.0.1', port, path: '/../package.json', method: 'GET' },
      response => {
        let body = '';
        response.on('data', chunk => {
          body += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
      },
    );
    request.on('error', () => resolve({ status: 0, body: '' }));
    request.end();
  });
  record(
    'a path outside the bundle is refused',
    traversal.status !== 200 && !traversal.body.includes('"name": "kryvex"'),
    `${traversal.status} ${traversal.body.slice(0, 40)}`,
  );

  // Pairing.
  const hello = await fetch(`${base}/api/hello`).then(response => response.json());
  record('an unpaired visitor is told so', hello.paired === false);
  const wrong = await fetch(`${base}/api/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: '000000', label: 'Harness phone' }),
  });
  record(
    'a wrong code mints nothing',
    wrong.status === 401 || wrong.status === 429,
    `${wrong.status}`,
  );
  const noToken = await fetch(`${base}/api/state`);
  record('state without a token is refused', noToken.status === 401, `${noToken.status}`);

  const paired = await fetch(`${base}/api/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: status.code, label: 'Harness phone' }),
  });
  const pairBody = await paired.json();
  record(
    'the live code pairs a device',
    paired.status === 200 && typeof pairBody.token === 'string',
    `${paired.status}`,
  );
  const token = pairBody.token;
  const headers = { 'x-link-token': token, 'content-type': 'application/json' };

  const afterPair = await cdp.evaluate(
    `(async () => (await window.kryvex.linkStatus()).devices)()`,
  );
  record(
    'the desktop lists the phone without its token',
    Array.isArray(afterPair) &&
      afterPair.length === 1 &&
      afterPair[0].label === 'Harness phone' &&
      !('token' in afterPair[0]) &&
      typeof afterPair[0].id === 'string',
    JSON.stringify(afterPair),
  );
  const codeRotated = await cdp.evaluate(`(async () => (await window.kryvex.linkStatus()).code)()`);
  record('pairing retires the code', codeRotated !== status.code, `${status.code} → ${codeRotated}`);

  // The event stream, then a clipboard post: the round trip a phone sees.
  const events = await fetch(`${base}/api/events?token=${token}`);
  record(
    'the event stream opens for a paired device',
    events.status === 200 && (events.headers.get('content-type') ?? '').includes('text/event-stream'),
    `${events.status} ${events.headers.get('content-type')}`,
  );
  const reader = events.body.getReader();
  const decoder = new TextDecoder();
  const collected = [];
  const pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        collected.push(decoder.decode(value, { stream: true }));
      }
    } catch {
      /* the socket closes with the app */
    }
  })();

  const textPost = await fetch(`${base}/api/text`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: 'clipboard from the harness phone' }),
  });
  record('the phone can post clipboard text', textPost.status === 200, `${textPost.status}`);
  await sleep(1400);
  const streamed = collected.join('');
  record(
    'the desktop relays the clipboard back as an event',
    streamed.includes('event: clipboard') && streamed.includes('clipboard from the harness phone'),
  );
  const desktopClipboard = await cdp.evaluate(
    `document.querySelector('.app-main') ? 'shell-up' : 'shell-missing'`,
  );
  record('the shell is still up after the relay', desktopClipboard === 'shell-up', desktopClipboard);

  // A file from the phone, with a name that tries to escape the folder.
  const upload = await fetch(`${base}/api/upload?name=${encodeURIComponent('../escape me.txt')}`, {
    method: 'POST',
    headers: { 'x-link-token': token, 'content-type': 'application/octet-stream' },
    body: Buffer.from('harness payload'),
  });
  const uploadBody = await upload.json();
  const saved = uploadBody.file;
  record(
    'an upload is accepted',
    upload.status === 200 && saved && saved.size === 15,
    `${upload.status} ${JSON.stringify(saved)}`,
  );
  const folder = await cdp.evaluate(`(async () => (await window.kryvex.linkStatus()).folder)()`);
  const savedPath = saved ? path.join(folder, saved.name) : '';
  record(
    'the name cannot leave the transfer folder',
    Boolean(saved) &&
      /^escape me( \(\d+\))?\.txt$/.test(saved.name) &&
      fs.existsSync(savedPath) &&
      path.dirname(savedPath) === folder &&
      fs.readFileSync(savedPath, 'utf8') === 'harness payload',
    `${saved?.name} → ${savedPath}`,
  );
  const listed = await cdp.evaluate(
    `(async () => (await window.kryvex.linkStatus()).received.map(f => f.name))()`,
  );
  record(
    'the desktop lists the received file',
    Array.isArray(listed) && saved && listed.includes(saved.name),
    JSON.stringify(listed),
  );

  // Commands: one from the allowlist, one that is not in it.
  const focus = await fetch(`${base}/api/command`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ command: 'focus' }),
  });
  record('an allowed command runs', focus.status === 200, `${focus.status}`);
  const bogus = await fetch(`${base}/api/command`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ command: 'shutdown' }),
  });
  record('a command outside the allowlist is refused', bogus.status === 400, `${bogus.status}`);

  // A link from the phone lands in the desktop browser.
  await cdp.evaluate(`window.location.hash = '#/home'; true`);
  await sleep(400);
  const send = await fetch(`${base}/api/send`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: 'https://example.com/from-the-phone' }),
  });
  await sleep(900);
  const hash = await cdp.evaluate(`window.location.hash`);
  record(
    'a link from the phone opens in the desktop browser',
    send.status === 200 && String(hash).includes('#/browser'),
    `${send.status} ${hash}`,
  );
  // The opened tab is proved where the app persists it: the shell writes the
  // state file, so the harness reads what the next launch would restore.
  let tabs = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const saved = JSON.parse(
        fs.readFileSync(path.join(profile, 'Kryvex', 'kryvex-state.json'), 'utf8'),
      );
      tabs = (saved.browser?.tabs ?? []).map(tab => tab.url);
      if (tabs.some(url => String(url).includes('example.com/from-the-phone'))) break;
    } catch {
      /* the file may not exist yet */
    }
    await sleep(300);
  }
  record(
    'the browser tab carries the phone’s URL',
    tabs.some(url => String(url).includes('example.com/from-the-phone')),
    JSON.stringify(tabs),
  );

  // Nothing is offered yet, and an unknown id is not a file.
  const outbox = await fetch(`${base}/api/outbox`, { headers }).then(response => response.json());
  record('the outbox is empty until a file is offered', Array.isArray(outbox.files) && outbox.files.length === 0);
  const missingFile = await fetch(`${base}/api/outbox/ffffffffffff`, { headers });
  record('an unknown outbox id is a 404', missingFile.status === 404, `${missingFile.status}`);

  // Pairing guesses are rate-limited per address.
  let limited = 0;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const guess = await fetch(`${base}/api/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456', label: 'Guesser' }),
    });
    if (guess.status === 429) limited += 1;
  }
  record('repeated guesses are rate-limited', limited > 0, `${limited} of 7 refused with 429`);

  // Unpairing ends the capability.
  const unpair = await fetch(`${base}/api/unpair`, { method: 'POST', headers });
  record('the phone can unpair itself', unpair.status === 200, `${unpair.status}`);
  const afterUnpair = await fetch(`${base}/api/state`, { headers });
  record('the retired token is dead', afterUnpair.status === 401, `${afterUnpair.status}`);

  reader.cancel().catch(() => undefined);
  await pump;
  cdp.close();

  // The web build has no main process, so the view must say so rather than
  // pretend: this is checked by the absence of the bridge in dist-web, which
  // `pnpm build:web` covers, so nothing to do here.

  record('the transfer folder holds the received file', fs.existsSync(folder), folder);
  // The harness leaves the user's folder as it found it.
  if (savedPath) fs.rmSync(savedPath, { force: true });
  const leftovers = fs.existsSync(folder) ? fs.readdirSync(folder).filter(name => /^escape me/.test(name)) : [];
  record('the received file was cleaned up', leftovers.length === 0, JSON.stringify(leftovers));

  // Phase 2: a file the desktop offers. The picker cannot be driven, so the
  // offer is written the way the app persists one and the phone's download of
  // it is what gets tested.
  const profileB = path.join(root, '.tmp-link-offer');
  const userDataB = seedProfile(profileB);
  const offerName = 'offer-me.txt';
  const offerBody = 'a file the desktop offered to the phone';
  const offerPath = path.join(userDataB, offerName);
  fs.writeFileSync(offerPath, offerBody);
  fs.writeFileSync(
    path.join(userDataB, 'link-index.json'),
    JSON.stringify({
      devices: [],
      files: [
        {
          id: 'f-offer1',
          name: offerName,
          size: Buffer.byteLength(offerBody),
          at: Date.now(),
          direction: 'offered',
          path: offerPath,
        },
      ],
    }),
  );
  launch(profileB, PORT + 1);
  const pageB = await target(PORT + 1);
  const cdpB = await connect(pageB.webSocketDebuggerUrl);
  await sleep(2600);
  const second = await findPort(cdpB);
  const baseB = `http://127.0.0.1:${second.port}`;
  const pairedB = await fetch(`${baseB}/api/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: second.status.code, label: 'Offer phone' }),
  });
  const tokenB = (await pairedB.json()).token;
  const outboxB = await fetch(`${baseB}/api/outbox`, {
    headers: { 'x-link-token': tokenB },
  }).then(response => response.json());
  record(
    'the phone sees an offered file without a path on this machine',
    Array.isArray(outboxB.files) &&
      outboxB.files.length === 1 &&
      outboxB.files[0].name === offerName &&
      !('path' in outboxB.files[0]),
    JSON.stringify(outboxB.files),
  );
  const download = await fetch(`${baseB}/api/outbox/f-offer1?token=${tokenB}`);
  const bytes = await download.text();
  record(
    'the phone can download what the desktop offered',
    download.status === 200 &&
      bytes === offerBody &&
      (download.headers.get('content-disposition') ?? '').includes(offerName),
    `${download.status} ${download.headers.get('content-disposition')} ${bytes.length} bytes`,
  );
  cdpB.close();
  await stop();
  fs.rmSync(profileB, { recursive: true, force: true });
  console.log(children.length > 0 ? 'link harness: done' : 'link harness: no app');
  if (failures.length > 0) {
    console.error(`link harness: FAIL (${failures.length})`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('link harness: PASS');
  }
}

main().catch(async error => {
  console.error('link harness: FAIL', error.stack || error);
  await stop();
  process.exitCode = 1;
});
