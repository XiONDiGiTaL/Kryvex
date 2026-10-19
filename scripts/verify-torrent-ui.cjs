/* eslint-disable no-console */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.KRYVEX_CDP_PORT || 9333);
const HASH = crypto.randomBytes(20).toString('hex');
const MAGNET = `magnet:?xt=urn:btih:${HASH}&dn=Kryvex%20Loopback%20Test`;

async function main() {
  const pages = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(response => response.json());
  const page = pages.find(item => item.type === 'page' && item.title === 'Kryvex');
  if (!page) throw new Error('Kryvex page was not found on the DevTools port');

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let sequence = 0;

  socket.onmessage = event => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  };

  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('DevTools socket failed'));
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Renderer evaluation failed');
    }
    return result.result.value;
  };

  try {
    await send('Runtime.enable');
    await send('Page.enable');

    const state = await evaluate(`(async () => {
      const info = await window.kryvex.appInfo();
      const result = await window.kryvex.torrentsAddMagnet(${JSON.stringify(MAGNET)});
      window.location.hash = '#/browser?panel=downloads';
      await new Promise(resolve => setTimeout(resolve, 1400));
      return {
        version: info.version,
        ok: result.ok,
        message: result.message,
        record: result.record,
        count: document.querySelectorAll('.torrent-item').length,
        text: document.querySelector('.torrent-hub')?.innerText || '',
      };
    })()`);

    if (!state.ok || !state.record) throw new Error(`Torrent add failed: ${state.message}`);
    if (state.count < 1) throw new Error('Torrent record did not render in the Downloads hub');
    if (!state.text.includes('Kryvex Loopback Test')) {
      throw new Error('Torrent name is missing from the Downloads hub');
    }
    if (!state.text.includes('Seeds') && !state.text.includes('S 0')) {
      throw new Error('Torrent peer stats are missing from the Downloads hub');
    }

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const target = path.join(process.cwd(), 'screenshots', 'browser-torrents.png');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(shot.data, 'base64'));

    await evaluate(`window.kryvex.torrentsRemove(${JSON.stringify(state.record.id)}, true)`);
    console.log('torrent UI harness: PASS');
    console.log(
      JSON.stringify({
        version: state.version,
        records: state.count,
        name: state.record.name,
        infoHash: state.record.infoHash,
        protocols: state.record.protocols,
        screenshot: 'screenshots/browser-torrents.png',
      }),
    );
  } finally {
    socket.close();
  }
}

main().catch(error => {
  console.error('torrent UI harness: FAIL', error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
