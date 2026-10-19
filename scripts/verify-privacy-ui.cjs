/* eslint-disable no-console */
const PORT = Number(process.env.KRYVEX_CDP_PORT || 9335);
const LOCAL = 'http://127.0.0.1:8765/scripts/privacy-test.html';
const HTTP_ONLY = 'http://127.0.0.1.nip.io/scripts/privacy-test.html';

const DRAW = `(function () {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 90;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 240, 90);
  gradient.addColorStop(0, '#123456');
  gradient.addColorStop(1, '#abcdef');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 240, 90);
  ctx.fillStyle = '#ff00aa';
  ctx.font = '28px sans-serif';
  ctx.fillText('Kryvex', 12, 50);
  return canvas.toDataURL();
})()`;

const WEBGL_HASH = `(function () {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) return null;
  gl.clearColor(0.2, 0.4, 0.6, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const pixels = new Uint8Array(64 * 64 * 4);
  gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let hash = 2166136261;
  for (let index = 0; index < pixels.length; index += 1) {
    hash = Math.imul(hash ^ pixels[index], 16777619) >>> 0;
  }
  return hash;
})()`;

const HASH = `(function () {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 90;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#13579b';
  ctx.fillRect(0, 0, 240, 90);
  ctx.fillStyle = '#f0e';
  ctx.font = '24px sans-serif';
  ctx.fillText('farble', 18, 52);
  const data = ctx.getImageData(0, 0, 240, 90).data;
  let hash = 2166136261;
  for (let index = 0; index < data.length; index += 1) {
    hash = Math.imul(hash ^ data[index], 16777619) >>> 0;
  }
  return hash;
})()`;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

  const guest = async expression => {
    const result = await evaluate(`(async () => {
      const webview = document.querySelector('webview');
      if (!webview) return { __error: 'no webview' };
      try {
        return await webview.executeJavaScript(${JSON.stringify(expression)});
      } catch (error) {
        return { __error: String(error) };
      }
    })()`);
    if (result && result.__error) throw new Error(result.__error);
    return result;
  };

  const waitFor = async (expression, label, timeout = 30_000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = await evaluate(expression);
      if (value) return value;
      await delay(250);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };

  const waitGuest = async (label, predicate, timeout = 30_000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const state = await evaluate(`(() => {
        const webview = document.querySelector('webview');
        if (!webview) return null;
        try { return { url: webview.getURL(), loading: webview.isLoading() }; }
        catch (error) { return { error: String(error) }; }
      })()`);
      if (state?.url && state.loading === false && predicate(state.url)) return state.url;
      await delay(250);
    }
    const state = await evaluate(`(() => {
      const webview = document.querySelector('webview');
      return webview ? { url: webview.getURL(), loading: webview.isLoading() } : null;
    })()`);
    throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`);
  };

  const navigate = async (url, label, predicate = () => true) => {
    const loaded = await evaluate(`(async () => {
      const webview = document.querySelector('webview');
      if (!webview) return false;
      try {
        await webview.loadURL(${JSON.stringify(url)});
      } catch {
        // A privacy redirect or a failed HTTPS attempt rejects the original
        // loadURL promise while the fallback navigation continues.
      }
      return true;
    })()`);
    if (!loaded) {
      await evaluate(
        `window.location.hash = '#/browser?url=' + encodeURIComponent(${JSON.stringify(url)}); true`,
      );
      await waitFor(`Boolean(document.querySelector('webview'))`, 'initial webview');
    }
    return waitGuest(label, predicate);
  };

  try {
    await send('Runtime.enable');
    await send('Page.enable');

    const status = await evaluate(`window.kryvex.shieldStatus()`);
    if (typeof status.httpsUpgrade !== 'boolean' || typeof status.stripTracking !== 'boolean') {
      throw new Error('Shield status is missing the new privacy options');
    }

    const refreshed = await waitFor(
      `(async () => {
        const current = await window.kryvex.shieldStatus();
        if (current.lists.includes('EasyList Cookie')) return current;
        if (current.phase === 'loading' || window.__kryvexCookieUpdate) return null;
        window.__kryvexCookieUpdate = true;
        await window.kryvex.shieldUpdate();
        return null;
      })()`,
      'EasyList Cookie filter list',
      120_000,
    );
    if (!refreshed.lists.includes('EasyList Cookie')) {
      throw new Error(`Cookie list missing from shield: ${refreshed.lists.join(', ')}`);
    }

    await evaluate(
      `window.location.hash = '#/browser?url=' + encodeURIComponent('https://example.com/?utm_source=kryvex&keep=1'); true`,
    );
    await waitFor(`Boolean(document.querySelector('webview'))`, 'webview');

    const strippedUrl = await waitGuest(
      'tracking-parameter redirect',
      url => url.startsWith('https://example.com/') && !url.includes('utm_source'),
      45_000,
    );
    if (!strippedUrl.includes('keep=1')) {
      throw new Error(`Functional query parameter was removed: ${strippedUrl}`);
    }

    const fallbackUrl = await navigate(
      HTTP_ONLY,
      'HTTPS fallback',
      url => url.startsWith('http://127.0.0.1.nip.io/'),
    );
    if (!/^http:\/\//i.test(fallbackUrl)) {
      throw new Error(`HTTP fallback did not settle on HTTP: ${fallbackUrl}`);
    }

    await navigate(LOCAL, 'local privacy probe', url => url.startsWith(LOCAL));
    const nativeHash = await evaluate(HASH);
    const nativeData = await evaluate(DRAW);
    const nativeWebgl = await evaluate(WEBGL_HASH);
    const farbledHash = await guest(HASH);
    const farbledData = await guest(DRAW);
    const farbledAgain = await guest(DRAW);
    const farbledWebgl = await guest(WEBGL_HASH);

    if (farbledHash === nativeHash) {
      throw new Error('Canvas getImageData was not farbled');
    }
    if (farbledData === nativeData) {
      throw new Error('Canvas toDataURL was not farbled');
    }
    if (farbledAgain !== farbledData) {
      throw new Error('Canvas farbling is not stable between reads');
    }
    if (nativeWebgl !== null && farbledWebgl !== null && farbledWebgl === nativeWebgl) {
      throw new Error('WebGL readPixels was not farbled');
    }

    await evaluate(`window.kryvex.shieldSetOption('fingerprint', false)`);
    await navigate(LOCAL, 'local probe with farbling off', url => url.startsWith(LOCAL));
    const plainHash = await guest(HASH);
    if (plainHash !== nativeHash) {
      throw new Error('Canvas readback still differs when fingerprinting is disabled');
    }

    const restored = await evaluate(`window.kryvex.shieldSetOption('fingerprint', true)`);
    if (!restored.fingerprint) throw new Error('Fingerprint toggle did not restore');

    console.log('privacy UI harness: PASS');
    console.log(
      JSON.stringify({
        strippedUrl,
        fallbackUrl,
        cookieList: refreshed.lists.includes('EasyList Cookie'),
        filters: refreshed.filters,
        nativeHash,
        farbledHash,
        nativeWebgl,
        farbledWebgl,
        stable: farbledAgain === farbledData,
        plainHash,
        options: {
          httpsUpgrade: restored.httpsUpgrade,
          stripTracking: restored.stripTracking,
          fingerprint: restored.fingerprint,
        },
        stats: {
          httpsUpgrades: restored.httpsUpgrades,
          paramsStripped: restored.paramsStripped,
        },
      }),
    );
  } finally {
    socket.close();
  }
}

main().catch(error => {
  console.error('privacy UI harness: FAIL', error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
