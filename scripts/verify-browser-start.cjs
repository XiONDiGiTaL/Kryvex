/* eslint-disable no-console */
/**
 * Exercises the browser start page against the real Electron app.
 *
 * The fixture server serves an RSS feed, an Atom feed and an OPML file, so the
 * start page's reader is tested through its actual UI and the main-process
 * fetcher. The run also proves that a private tab records no history and is not
 * restored, that the options menu can open one, and that closing private tabs
 * clears them. Run `pnpm build` first.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.tmp-browser-start-profile');
const shots = path.join(root, 'screenshots');
const port = Number(process.env.KRYVEX_CDP_PORT || 9346);
const feedPort = Number(process.env.KRYVEX_FEED_PORT || 8126);
let child = null;

const rss = `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>Kryvex start fixture</title>
  <item><title>Feed fixture one</title><link>http://127.0.0.1:${feedPort}/article</link>
    <description>A local story for the start page.</description>
    <pubDate>Tue, 21 Oct 2026 10:00:00 GMT</pubDate></item>
  <item><title>Feed fixture two</title><link>http://127.0.0.1:${feedPort}/article?two</link>
    <description>Second local story.</description>
    <pubDate>Mon, 20 Oct 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <title>Kryvex atom fixture</title>
  <entry><title>Atom fixture</title>
    <link rel="alternate" href="http://127.0.0.1:${feedPort}/article?atom"/>
    <summary>An Atom entry.</summary><updated>2026-10-19T10:00:00Z</updated></entry>
</feed>`;

const opml = `<?xml version="1.0"?><opml version="2.0"><body>
  <outline text="Fixture" type="rss" xmlUrl="http://127.0.0.1:${feedPort}/atom"/>
</body></opml>`;

const server = http.createServer((request, response) => {
  if (request.url === '/rss') {
    response.writeHead(200, { 'Content-Type': 'application/rss+xml' });
    response.end(rss);
    return;
  }
  if (request.url === '/atom') {
    response.writeHead(200, { 'Content-Type': 'application/atom+xml' });
    response.end(atom);
    return;
  }
  if (request.url === '/opml') {
    response.writeHead(200, { 'Content-Type': 'text/xml' });
    response.end(opml);
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end('<!doctype html><title>Start fixture article</title><h1>Article fixture</h1>');
});

fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(path.join(profile, 'local'), { recursive: true });
fs.mkdirSync(shots, { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function launch() {
  child = spawn(electron, ['.', `--remote-debugging-port=${port}`], {
    cwd: root,
    env: {
      ...process.env,
      KRYVEX_USER_DATA: path.join(profile, 'Kryvex'),
      APPDATA: profile,
      LOCALAPPDATA: path.join(profile, 'local'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', data => process.stderr.write(`[app:err] ${data}`));
}

async function target() {
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
  throw new Error('Electron DevTools endpoint did not appear.');
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
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text ||
          'Failed.',
      );
    }
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { evaluate, send, close: () => socket.close() };
}

async function waitFor(evaluate, expression, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = await evaluate(expression);
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function check(name, ok, detail) {
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  console.log(`PASS ${name}${detail ? `: ${detail}` : ''}`);
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(5000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function savedState() {
  const file = path.join(profile, 'Kryvex', 'kryvex-state.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

async function screenshot(cdp, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`captured screenshots/${name}.png`);
}

server.listen(feedPort, '127.0.0.1');

(async () => {
  try {
    launch();
    const page = await target();
    const cdp = await connect(page.webSocketDebuggerUrl);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'shell');
    // A fresh profile opens the first-run theme sheet over the workspace. The
    // start page must not be photographed through it.
    await cdp.evaluate(`document.querySelector('[data-shot="gallery-skip"]')?.click(); true`);
    await sleep(500);
    await cdp.evaluate(`window.location.hash = '#/browser?newtab=1'; true`);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.browser-start'))`, 'start page');

    const cards = await cdp.evaluate(
      `[...document.querySelectorAll('.start-card')].map(card => card.className)`,
    );
    check('the start page renders its four cards', cards.length === 4, cards.join(' · '));
    check(
      'the shield, guide, feeds and launch cards are present',
      ['start-card-shield', 'start-card-guide', 'start-card-feeds', 'start-card-launch'].every(
        name => cards.some(value => value.includes(name)),
      ),
    );
    check(
      'the toolbar has a home button on the left',
      await cdp.evaluate(
        `document.querySelector('.browser-toolbar > button:first-child')?.getAttribute('aria-label') === 'Home'`,
      ),
    );

    // Add the RSS fixture through the visible form.
    await cdp.evaluate(`document.querySelector('.feed-add input').focus(); true`);
    await cdp.send('Input.insertText', { text: `http://127.0.0.1:${feedPort}/rss` });
    await cdp.evaluate(`document.querySelector('.feed-add button').click(); true`);
    const story = await waitFor(
      cdp.evaluate,
      `(() => { const node = [...document.querySelectorAll('.start-story strong')].find(item => item.textContent.includes('Feed fixture one')); return node ? node.textContent : null; })()`,
      'the RSS fixture story',
    );
    check('a pasted RSS feed reaches the start page', Boolean(story), story);

    // Import the Atom fixture through the real file input.
    await cdp.evaluate(`(() => {
      const input = document.querySelector('.start-file-input');
      const file = new File([${JSON.stringify(opml)}], 'fixtures.opml', { type: 'text/xml' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitFor(
      cdp.evaluate,
      `document.querySelectorAll('.feed-chip').length === 2`,
      'the imported OPML feed',
    );
    const chips = await cdp.evaluate(
      `[...document.querySelectorAll('.feed-chip')].map(chip => chip.textContent.trim())`,
    );
    check('OPML import adds the second feed', chips.length === 2, chips.join(' · '));
    await waitFor(
      cdp.evaluate,
      `[...document.querySelectorAll('.start-story strong')].some(node => node.textContent.includes('Atom fixture'))`,
      'the Atom fixture story',
    );
    // Let the two success toasts clear and drop focus from the add-field so the
    // capture shows the page, not transient chrome.
    await sleep(4600);
    await cdp.evaluate(`document.activeElement?.blur(); true`);
    await screenshot(cdp, 'browser-start');

    // Options menu → private tab.
    await cdp.evaluate(
      `document.querySelector('button[aria-label="Browser options"]').click(); true`,
    );
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.browser-menu'))`, 'options menu');
    const menuItems = await cdp.evaluate(
      `[...document.querySelectorAll('.browser-menu [role="menuitem"]')].map(item => item.textContent.replace(/\\s+/g, ' ').trim())`,
    );
    check(
      'the options menu offers a private tab',
      menuItems.some(label => label.includes('New private tab')),
      menuItems.join(' · '),
    );
    await cdp.evaluate(`(() => {
      const button = [...document.querySelectorAll('.browser-menu button')].find(node =>
        node.textContent.includes('New private tab'));
      button.click();
      return true;
    })()`);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.tab.is-private'))`, 'private tab');
    await waitFor(
      cdp.evaluate,
      `Boolean(document.querySelector('.browser-start.is-private'))`,
      'private start page',
    );
    check(
      'the private tab is marked in the tab strip and on the start page',
      await cdp.evaluate(
        `document.querySelector('.browser-start.is-private') !== null && document.querySelector('.tab.is-private') !== null`,
      ),
    );
    await sleep(4600);
    await cdp.evaluate(`document.activeElement?.blur(); true`);
    await screenshot(cdp, 'browser-private');

    // Open a story in the private tab: no history may be recorded.
    await cdp.evaluate(`(() => {
      const button = [...document.querySelectorAll('.start-story')].find(node =>
        node.textContent.includes('Feed fixture one'));
      button.click();
      return true;
    })()`);
    const privateUrl = `http://127.0.0.1:${feedPort}/article`;
    await waitFor(
      cdp.evaluate,
      `(() => { const w = document.querySelector('webview'); if (!w) return false; try { return w.getURL().startsWith(${JSON.stringify(privateUrl)}); } catch { return false; } })()`,
      'the article in the private tab',
    );
    await sleep(900);
    const privateState = savedState();
    const privateTabSaved =
      privateState?.browser?.tabs?.some(
        tab => String(tab.title).includes('private') || String(tab.url).includes('/article'),
      ) ?? false;
    check('a private tab is not written to the saved session', !privateTabSaved);
    check(
      'a private visit is not written to history',
      !(privateState?.history ?? []).some(entry => entry.url.includes('/article')),
    );

    // Home returns to the start page, then an ordinary tab records history.
    await cdp.evaluate(
      `document.querySelector('.browser-toolbar > button[aria-label="Home"]').click(); true`,
    );
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.browser-start'))`, 'home return');
    await cdp.evaluate(
      `document.querySelector('button[aria-label="Browser options"]').click(); true`,
    );
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.browser-menu'))`, 'menu again');
    await cdp.evaluate(`(() => {
      const button = [...document.querySelectorAll('.browser-menu button')].find(node =>
        node.textContent.includes('New tab'));
      button.click();
      return true;
    })()`);
    await waitFor(
      cdp.evaluate,
      `!document.querySelector('.browser-start.is-private')`,
      'ordinary tab',
    );
    await cdp.evaluate(`(() => {
      const button = [...document.querySelectorAll('.start-story')].find(node =>
        node.textContent.includes('Feed fixture one'));
      button.click();
      return true;
    })()`);
    await waitFor(
      cdp.evaluate,
      `(() => { const w = document.querySelector('webview'); if (!w) return false; try { return w.getURL().startsWith(${JSON.stringify(privateUrl)}); } catch { return false; } })()`,
      'the article in the ordinary tab',
    );
    let historySaved = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const current = savedState();
      if ((current?.history ?? []).some(entry => entry.url.includes('/article'))) {
        historySaved = true;
        break;
      }
      await sleep(200);
    }
    check('an ordinary visit is written to history', historySaved);

    // Close every private tab from the menu.
    await cdp.evaluate(
      `document.querySelector('.browser-toolbar > button[aria-label="Home"]').click(); true`,
    );
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.browser-start'))`, 'start again');
    await cdp.evaluate(
      `document.querySelector('button[aria-label="Browser options"]').click(); true`,
    );
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.browser-menu'))`, 'menu for close');
    const closed = await cdp.evaluate(`(() => {
      const button = [...document.querySelectorAll('.browser-menu button')].find(node =>
        node.textContent.includes('Close private tabs') && !node.disabled);
      if (!button) return false;
      button.click();
      return true;
    })()`);
    check('private tabs can be closed from the options menu', closed);
    if (closed) {
      await waitFor(
        cdp.evaluate,
        `document.querySelectorAll('.tab.is-private').length === 0`,
        'no private tabs',
      );
    }

    const errors = await cdp.evaluate(
      `[...document.querySelectorAll('.browser-start .start-note')].filter(node => /could not|error/i.test(node.textContent)).length`,
    );
    check('the start page reports no feed errors', errors === 0);

    cdp.close();
    await stop();
    console.log('browser start harness: PASS');
  } catch (error) {
    console.error('browser start harness: FAIL', error.stack || error);
    await stop();
    process.exitCode = 1;
  } finally {
    server.close();
  }
})();
