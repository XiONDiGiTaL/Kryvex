import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { LinkFileInfo } from './types';
import {
  LINK_MAX_DEVICES,
  LINK_MAX_LABEL,
  LINK_MAX_TEXT,
  LINK_MAX_UPLOAD,
  LINK_MAX_URL,
  LINK_PAIR_ATTEMPTS,
  LINK_PAIR_WINDOW_MS,
  LINK_PORT_FIRST,
  LINK_PORT_LAST,
  clampText,
  deviceLabel,
  isLinkCommand,
  isLinkToken,
  isPrivateAddress,
  linkableUrl,
  normalizePairCode,
  safeFileName,
} from './link-rules';

/**
 * The HTTP half of Kryvex Link.
 *
 * It owns sockets, routes, size caps and the event stream, and nothing else:
 * every decision about who may pair, what a file is called and what a command
 * means lives in the backend (`link.ts`) and the pure rules (`link-rules.ts`).
 * That split keeps the transport testable with a stub backend and keeps the
 * policy in one place.
 *
 * It only ever serves the built companion page and the `/api/*` routes. There is
 * no directory listing, no file read outside the bundle and no route that takes
 * a path from the phone.
 */

/** What the transport needs from the link service. */
export interface LinkBackend {
  version(): string;
  /** Mint a device against a live pairing code, or null when the code is wrong. */
  pair(code: string, label: string, address: string): { token: string; label: string } | null;
  /** Does this token belong to a device that may still talk to us? */
  authorize(token: string): boolean;
  /** Refresh a device's last-seen stamp; called for every authorized request. */
  seen(token: string, address: string): void;
  unpair(token: string): void;
  snapshot(): unknown;
  /** Clipboard text from the phone. */
  receiveText(token: string, text: string): void;
  /** "Send to desktop": free text, or a link to open in the Kryvex browser. */
  receiveSend(token: string, value: string): void;
  receiveUpload(token: string, name: string, data: Buffer): Promise<LinkFileInfo | null>;
  receiveCommand(token: string, command: string): Promise<boolean>;
  /** Files the desktop offers to the phone, newest first. */
  outbox(): LinkFileInfo[];
  /** The absolute path behind an offered file id, or null. */
  outboxPath(id: string): { path: string; name: string; size: number } | null;
}

interface Subscriber {
  token: string;
  response: http.ServerResponse;
}

const ASSET_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const HEARTBEAT_MS = 20_000;

export class LinkServer {
  private server: http.Server | null = null;
  private port = 0;
  private subscribers = new Set<Subscriber>();
  private attempts = new Map<string, { count: number; at: number }>();
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(
    private backend: LinkBackend,
    /** Absolute directory holding the built renderer, which also holds the companion page. */
    private root: string,
  ) {}

  get origin(): string {
    return this.port ? `http://127.0.0.1:${this.port}` : '';
  }

  get listening(): boolean {
    return this.server !== null;
  }

  get boundPort(): number {
    return this.port;
  }

  /** Binds the first free port in the range; a taken port moves on, not fails. */
  async start(): Promise<void> {
    if (this.server) return;
    for (let port = LINK_PORT_FIRST; port <= LINK_PORT_LAST; port += 1) {
      const server = http.createServer((request, response) => {
        this.handle(request, response).catch(() => {
          if (!response.headersSent) this.json(response, 500, { ok: false, error: 'server' });
          else response.end();
        });
      });
      // A listening socket accepts the whole LAN: the phone is not on loopback.
      const bound = await new Promise<boolean>(resolve => {
        server.once('error', () => resolve(false));
        server.listen(port, '0.0.0.0', () => {
          server.off('error', () => undefined);
          resolve(true);
        });
      });
      if (!bound) {
        server.close();
        continue;
      }
      this.server = server;
      this.port = (server.address() as AddressInfo | null)?.port ?? port;
      this.heartbeat = setInterval(() => this.ping(), HEARTBEAT_MS);
      this.heartbeat.unref?.();
      return;
    }
    throw new Error('no free port for Kryvex Link');
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const subscriber of this.subscribers) {
      try {
        subscriber.response.end();
      } catch {
        /* the phone is already gone */
      }
    }
    this.subscribers.clear();
    this.attempts.clear();
    this.server?.close();
    this.server = null;
    this.port = 0;
  }

  /** Pushes one event to every paired phone. */
  broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const subscriber of [...this.subscribers]) {
      try {
        subscriber.response.write(payload);
      } catch {
        this.subscribers.delete(subscriber);
      }
    }
  }

  /** Drops a revoked device's open streams so it stops receiving events now. */
  disconnect(token: string): void {
    for (const subscriber of [...this.subscribers]) {
      if (subscriber.token !== token) continue;
      this.subscribers.delete(subscriber);
      try {
        subscriber.response.end();
      } catch {
        /* already closed */
      }
    }
  }

  private ping(): void {
    for (const subscriber of [...this.subscribers]) {
      try {
        subscriber.response.write(': ping\n\n');
      } catch {
        this.subscribers.delete(subscriber);
      }
    }
  }

  /**
   * A pairing attempt is limited per source address: six digits are only 10^6
   * possibilities, so unlimited guesses would fall in minutes.
   */
  private tooManyAttempts(address: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(address);
    if (!record || now - record.at > LINK_PAIR_WINDOW_MS) {
      this.attempts.set(address, { count: 1, at: now });
      return false;
    }
    record.count += 1;
    return record.count > LINK_PAIR_ATTEMPTS;
  }

  private json(response: http.ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    });
    response.end(payload);
  }

  /** The token a request carries: a header for fetch, a query for EventSource. */
  private tokenOf(request: http.IncomingMessage, url: URL): string {
    const header = request.headers['x-link-token'];
    const raw = Array.isArray(header) ? header[0] : header;
    if (isLinkToken(raw)) return raw;
    const query = url.searchParams.get('token');
    return isLinkToken(query) ? query : '';
  }

  private async readBody(request: http.IncomingMessage, limit: number): Promise<Buffer | null> {
    return new Promise(resolve => {
      const chunks: Buffer[] = [];
      let size = 0;
      let settled = false;
      const finish = (value: Buffer | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      request.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > limit) {
          // Stop reading the moment the cap is passed; the caller answers 413.
          request.destroy();
          finish(null);
          return;
        }
        chunks.push(chunk);
      });
      request.on('end', () => finish(Buffer.concat(chunks)));
      request.on('error', () => finish(null));
    });
  }

  private async readJson(request: http.IncomingMessage): Promise<Record<string, unknown> | null> {
    const body = await this.readBody(request, 64 * 1024);
    if (!body) return null;
    try {
      const parsed: unknown = JSON.parse(body.toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Serves one file from the built bundle. The path is normalized and must stay
   * inside the bundle root, and only the extension list above is served, so a
   * crafted URL cannot read a source map or reach another directory.
   */
  private serveAsset(response: http.ServerResponse, urlPath: string): void {
    const relative = urlPath === '/' || urlPath === '' ? 'companion.html' : urlPath.slice(1);
    const target = path.resolve(this.root, relative);
    const base = path.resolve(this.root);
    if (target !== base && !target.startsWith(base + path.sep)) {
      this.json(response, 404, { ok: false, error: 'not-found' });
      return;
    }
    const type = ASSET_TYPES[path.extname(target).toLowerCase()];
    if (!type) {
      this.json(response, 404, { ok: false, error: 'not-found' });
      return;
    }
    let body: Buffer;
    try {
      body = fs.readFileSync(target);
    } catch {
      // A source checkout that has never run a build has no companion page.
      this.json(response, 503, { ok: false, error: 'no-bundle' });
      return;
    }
    response.writeHead(200, {
      'content-type': type,
      'content-length': body.length,
      'cache-control': relative === 'companion.html' ? 'no-store' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    });
    response.end(body);
  }

  private streamFile(
    response: http.ServerResponse,
    file: { path: string; name: string; size: number },
  ): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file.path);
    } catch {
      this.json(response, 404, { ok: false, error: 'gone' });
      return;
    }
    // The header is a quoted, escaped name: a name cannot inject a second header.
    const safe = file.name.replace(/["\\\r\n]/g, '');
    response.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': stat.size,
      'content-disposition': `attachment; filename="${safe}"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    const stream = fs.createReadStream(file.path);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  }

  private events(request: http.IncomingMessage, response: http.ServerResponse, token: string): void {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-content-type-options': 'nosniff',
    });
    response.write('retry: 3000\n\n');
    const subscriber: Subscriber = { token, response };
    this.subscribers.add(subscriber);
    this.backend.seen(token, String(request.socket.remoteAddress ?? ''));
    response.write(
      `event: hello\ndata: ${JSON.stringify({ version: this.backend.version(), state: this.backend.snapshot() })}\n\n`,
    );
    const close = () => this.subscribers.delete(subscriber);
    request.on('close', close);
    request.on('error', close);
  }

  private async handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const address = String(request.socket.remoteAddress ?? '');
    // Refuse a public source before reading a byte of the request.
    if (!isPrivateAddress(address)) {
      this.json(response, 403, { ok: false, error: 'off-network' });
      return;
    }
    const method = request.method ?? 'GET';
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'link.local'}`);
    const route = url.pathname;

    if (method === 'GET' && (route === '/' || route === '/companion.html' || route.startsWith('/assets/'))) {
      this.serveAsset(response, route);
      return;
    }

    if (route === '/api/hello' && method === 'GET') {
      const token = this.tokenOf(request, url);
      const paired = Boolean(token) && this.backend.authorize(token);
      if (paired) this.backend.seen(token, address);
      this.json(response, 200, { ok: true, app: 'Kryvex', link: 'Kryvex Link', version: this.backend.version(), paired });
      return;
    }

    if (route === '/api/pair' && method === 'POST') {
      if (this.tooManyAttempts(address)) {
        this.json(response, 429, { ok: false, error: 'too-many' });
        return;
      }
      const body = await this.readJson(request);
      const code = normalizePairCode(body?.code);
      const label = deviceLabel(body?.label);
      if (!code) {
        this.json(response, 400, { ok: false, error: 'code' });
        return;
      }
      const device = this.backend.pair(code, label, address);
      if (!device) {
        this.json(response, 401, { ok: false, error: 'code' });
        return;
      }
      this.attempts.delete(address);
      this.json(response, 200, { ok: true, token: device.token, label: device.label, state: this.backend.snapshot() });
      return;
    }

    if (route === '/api/events' && method === 'GET') {
      const token = this.tokenOf(request, url);
      if (!token || !this.backend.authorize(token)) {
        this.json(response, 401, { ok: false, error: 'token' });
        return;
      }
      this.events(request, response, token);
      return;
    }

    // Every remaining route needs a valid device token.
    const token = this.tokenOf(request, url);
    if (!token || !this.backend.authorize(token)) {
      this.json(response, 401, { ok: false, error: 'token' });
      return;
    }
    this.backend.seen(token, address);

    if (route === '/api/state' && method === 'GET') {
      this.json(response, 200, { ok: true, state: this.backend.snapshot() });
      return;
    }

    if (route === '/api/text' && method === 'POST') {
      const body = await this.readJson(request);
      const text = clampText(body?.text);
      if (!text) {
        this.json(response, 400, { ok: false, error: 'empty' });
        return;
      }
      this.backend.receiveText(token, text);
      this.json(response, 200, { ok: true });
      return;
    }

    if (route === '/api/send' && method === 'POST') {
      const body = await this.readJson(request);
      const text = clampText(body?.text);
      const url = typeof body?.url === 'string' ? body.url.slice(0, LINK_MAX_URL) : '';
      if (!text && !url) {
        this.json(response, 400, { ok: false, error: 'empty' });
        return;
      }
      this.backend.receiveSend(token, text || url);
      this.json(response, 200, { ok: true });
      return;
    }

    if (route === '/api/command' && method === 'POST') {
      const body = await this.readJson(request);
      const command = body?.command;
      if (!isLinkCommand(command)) {
        this.json(response, 400, { ok: false, error: 'command' });
        return;
      }
      const done = await this.backend.receiveCommand(token, command);
      this.json(response, done ? 200 : 409, { ok: done });
      return;
    }

    if (route === '/api/upload' && method === 'POST') {
      const name = safeFileName(url.searchParams.get('name'));
      if (!name) {
        this.json(response, 400, { ok: false, error: 'name' });
        return;
      }
      const body = await this.readBody(request, LINK_MAX_UPLOAD);
      if (!body) {
        this.json(response, 413, { ok: false, error: 'too-large' });
        return;
      }
      if (body.length === 0) {
        this.json(response, 400, { ok: false, error: 'empty' });
        return;
      }
      const file = await this.backend.receiveUpload(token, name, body);
      if (!file) {
        this.json(response, 507, { ok: false, error: 'not-saved' });
        return;
      }
      this.json(response, 200, { ok: true, file });
      return;
    }

    if (route === '/api/outbox' && method === 'GET') {
      this.json(response, 200, { ok: true, files: this.backend.outbox() });
      return;
    }

    if (route.startsWith('/api/outbox/') && method === 'GET') {
      const id = route.slice('/api/outbox/'.length);
      const file = /^[a-z0-9-]{4,64}$/i.test(id) ? this.backend.outboxPath(id) : null;
      if (!file) {
        this.json(response, 404, { ok: false, error: 'not-found' });
        return;
      }
      this.streamFile(response, file);
      return;
    }

    if (route === '/api/unpair' && method === 'POST') {
      this.backend.unpair(token);
      this.disconnect(token);
      this.json(response, 200, { ok: true });
      return;
    }

    if (route === '/api/open' && method === 'POST') {
      const body = await this.readJson(request);
      const target = linkableUrl(body?.url);
      if (!target) {
        this.json(response, 400, { ok: false, error: 'url' });
        return;
      }
      this.backend.receiveSend(token, target);
      this.json(response, 200, { ok: true });
      return;
    }

    this.json(response, 404, { ok: false, error: 'not-found' });
  }
}

/** The pairing ceiling, exported so the view can explain the limit. */
export const LINK_LIMITS = {
  devices: LINK_MAX_DEVICES,
  label: LINK_MAX_LABEL,
  text: LINK_MAX_TEXT,
  upload: LINK_MAX_UPLOAD,
} as const;
