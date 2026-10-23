import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * YouTube refuses to configure its embed when the parent document is a
 * `file://` shell (Error 153). This loopback page exists for one reason: it is
 * a normal http origin with a real Referer, so YouTube's embed runs. It renders
 * a single video and forwards the embed's postMessage API to the shell.
 *
 * The server binds to 127.0.0.1 on an ephemeral port, serves only `/youtube`,
 * and reads no files. The video id is validated before it reaches the HTML.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function page(videoId: string, autoplay: boolean): string {
  const source =
    `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` +
    `?enablejsapi=1&autoplay=${autoplay ? '1' : '0'}` +
    '&controls=0&playsinline=1&rel=0&modestbranding=1';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>Kryvex player bridge</title>
<style>
  html, body { margin: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
  iframe { display: block; width: 100%; height: 100%; border: 0; background: #000; }
</style>
</head>
<body>
<iframe id="yt" src="${escapeAttribute(source)}" allow="autoplay; encrypted-media; picture-in-picture"
  referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
<script>
  (() => {
    const frame = document.getElementById('yt');
    const forward = data => {
      try { parent.postMessage(JSON.stringify(data), '*'); } catch {}
    };
    const command = (func, args) => {
      try {
        frame.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func, args: Array.isArray(args) ? args : [] }),
          '*',
        );
      } catch {}
    };
    window.addEventListener('message', event => {
      if (event.source !== parent) return;
      let data = event.data;
      try { data = typeof data === 'string' ? JSON.parse(data) : data; } catch { return; }
      if (data && data.event === 'command' && typeof data.func === 'string') {
        command(data.func, data.args);
      }
    });
    window.addEventListener('message', event => {
      if (event.source !== frame.contentWindow) return;
      let data = event.data;
      try { data = typeof data === 'string' ? JSON.parse(data) : data; } catch { return; }
      if (!data || typeof data !== 'object') return;
      if (
        data.event === 'onReady' ||
        data.event === 'onError' ||
        data.event === 'onStateChange' ||
        data.event === 'infoDelivery'
      ) {
        forward(data);
      }
    });
    const listen = () => {
      try {
        frame.contentWindow.postMessage(
          JSON.stringify({ event: 'listening', id: 'kryvex-player', channel: 'widget' }),
          '*',
        );
      } catch {}
    };
    frame.addEventListener('load', () => window.setTimeout(listen, 300));
  })();
</script>
</body>
</html>`;
}

export class PlayerEmbedServer {
  private server: http.Server | null = null;
  private origin = '';

  async start(): Promise<void> {
    if (this.server) return;
    const server = http.createServer((request, response) => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      if (!port) {
        response.writeHead(503, { 'cache-control': 'no-store' });
        response.end();
        return;
      }
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
      if (request.method !== 'GET' || url.pathname !== '/youtube') {
        response.writeHead(404, { 'cache-control': 'no-store' });
        response.end('Not found');
        return;
      }
      const videoId = url.searchParams.get('v') ?? '';
      if (!VIDEO_ID.test(videoId)) {
        response.writeHead(400, { 'cache-control': 'no-store' });
        response.end('Invalid video id');
        return;
      }
      const autoplay = url.searchParams.get('autoplay') === '1';
      const html = page(videoId, autoplay);
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'content-security-policy':
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src https://www.youtube.com;",
      });
      response.end(html);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        const address = server.address() as AddressInfo | null;
        if (!address) {
          reject(new Error('player bridge has no address'));
          return;
        }
        this.server = server;
        this.origin = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  }

  /** Only a validated id and an autoplay flag cross this boundary. */
  url(videoId: unknown, autoplay: unknown): string | null {
    if (!this.server || typeof videoId !== 'string' || !VIDEO_ID.test(videoId)) return null;
    return `${this.origin}/youtube?v=${encodeURIComponent(videoId)}&autoplay=${
      autoplay === true ? '1' : '0'
    }`;
  }

  dispose(): void {
    this.server?.close();
    this.server = null;
    this.origin = '';
  }
}

export const playerEmbed = new PlayerEmbedServer();
