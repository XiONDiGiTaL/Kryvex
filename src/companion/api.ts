/**
 * The phone's half of the Kryvex Link protocol.
 *
 * Every call is same-origin: this page is served by Kryvex itself, so there is
 * no CORS dance and no third party in the path. The pairing token is kept in
 * `localStorage` and sent as a header, except on the two requests that cannot
 * carry one (`EventSource` and a file download, both of which get it in the
 * query string because the browser builds those requests for us).
 */

const TOKEN_KEY = 'kryvex-link-token';
const NAME_KEY = 'kryvex-link-name';
/**
 * Where a paired phone used to keep its token, before the product name was
 * spelled correctly. It is read once and moved rather than dropped, so a phone
 * that paired with the older build stays paired.
 */
const LEGACY_TOKEN_KEY = 'kyvex-link-token';
const LEGACY_NAME_KEY = 'kyvex-link-name';

export interface CompanionFile {
  id: string;
  name: string;
  size: number;
  at: number;
}

export interface CompanionDevice {
  label: string;
  address: string;
  pairedAt: number;
  lastSeenAt: number;
}

export interface CompanionState {
  version: string;
  clipboard: string;
  devices: CompanionDevice[];
  files: { received: CompanionFile[]; offered: CompanionFile[] };
  remote: {
    playing: boolean;
    title: string;
    artist: string;
    volume: number;
    muted: boolean;
  };
}

export type CompanionCommand =
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'volume-up'
  | 'volume-down'
  | 'mute'
  | 'focus'
  | 'rooms'
  | 'home';

export interface PairResult {
  ok: boolean;
  token?: string;
  label?: string;
  state?: CompanionState;
  error?: string;
}

export interface Events {
  hello?: (payload: { version: string; state: CompanionState }) => void;
  clipboard?: (payload: { text: string; at: number; from: 'desktop' | 'phone' }) => void;
  notice?: (payload: { title: string; body: string; at: number }) => void;
  files?: (payload: { state: CompanionState }) => void;
  devices?: (payload: { devices: CompanionDevice[] }) => void;
  remote?: (payload: { state: CompanionState; ok: boolean }) => void;
}

/**
 * Reads a stored value, moving it forward from the older key if that is where
 * it lives. A phone that paired before the product name was spelled correctly
 * therefore stays paired instead of asking for the code again.
 */
function readStored(key: string, legacy: string): string {
  try {
    const current = localStorage.getItem(key);
    if (current !== null) return current;
    const older = localStorage.getItem(legacy);
    if (older === null) return '';
    localStorage.setItem(key, older);
    localStorage.removeItem(legacy);
    return older;
  } catch {
    return '';
  }
}

export function readToken(): string {
  return readStored(TOKEN_KEY, LEGACY_TOKEN_KEY);
}

export function writeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode: the page still works until it is reloaded */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    // Unpairing clears both spellings, so an old key cannot resurrect a token
    // that was already retired on this phone.
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function readName(fallback: string): string {
  return readStored(NAME_KEY, LEGACY_NAME_KEY).trim() || fallback;
}

export function writeName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private mode */
  }
}

async function call(
  path: string,
  options: { method?: string; body?: unknown; raw?: { name: string; file: File }; token?: string } = {},
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const token = options.token ?? readToken();
  const headers: Record<string, string> = {};
  if (token) headers['x-link-token'] = token;
  let body: BodyInit | undefined;
  if (options.raw) {
    headers['content-type'] = 'application/octet-stream';
    body = options.raw.file;
  } else if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const target = options.raw
    ? `${path}?name=${encodeURIComponent(options.raw.name)}`
    : path;
  try {
    const response = await fetch(target, {
      method: options.method ?? (body === undefined ? 'GET' : 'POST'),
      headers,
      body,
      cache: 'no-store',
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      data = {};
    }
    return { ok: response.ok && data.ok !== false, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'offline' } };
  }
}

export async function hello(token = readToken()) {
  const answer = await call('/api/hello', { token });
  return {
    reachable: answer.status !== 0,
    paired: answer.ok && answer.data.paired === true,
    version: typeof answer.data.version === 'string' ? answer.data.version : '',
  };
}

export async function pair(code: string, label: string): Promise<PairResult> {
  const answer = await call('/api/pair', { body: { code, label } });
  const result = answer.data as unknown as PairResult;
  if (answer.ok && typeof result.token === 'string') {
    writeToken(result.token);
    writeName(label);
  }
  return { ...result, ok: answer.ok };
}

export async function fetchState(): Promise<CompanionState | null> {
  const answer = await call('/api/state');
  if (!answer.ok) return null;
  const state = answer.data.state;
  return state && typeof state === 'object' ? (state as CompanionState) : null;
}

/** Clipboard text for the desktop; the desktop's own clipboard takes it. */
export async function sendText(text: string): Promise<boolean> {
  const answer = await call('/api/text', { body: { text } });
  return answer.ok;
}

/** Free text, or a link the desktop opens in its browser. */
export async function sendToDesktop(value: string): Promise<boolean> {
  const answer = await call('/api/send', { body: { text: value } });
  return answer.ok;
}

export async function sendCommand(command: CompanionCommand): Promise<boolean> {
  const answer = await call('/api/command', { body: { command } });
  return answer.ok;
}

export async function unpair(): Promise<void> {
  await call('/api/unpair', { method: 'POST' });
  clearToken();
}

/**
 * An upload with progress. `fetch` cannot report upload bytes in any shipped
 * browser, and a 200 MB video on a phone needs a bar more than it needs
 * elegance, so this one request uses `XMLHttpRequest`.
 */
export function upload(
  name: string,
  file: File,
  onProgress?: (sent: number, total: number) => void,
): Promise<boolean> {
  return new Promise(resolve => {
    const token = readToken();
    const request = new XMLHttpRequest();
    request.open('POST', `/api/upload?name=${encodeURIComponent(name)}`);
    request.setRequestHeader('content-type', 'application/octet-stream');
    if (token) request.setRequestHeader('x-link-token', token);
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    request.onload = () => resolve(request.status === 200);
    request.onerror = () => resolve(false);
    request.onabort = () => resolve(false);
    request.send(file);
  });
}

export function downloadUrl(id: string): string {
  const token = readToken();
  return `/api/outbox/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`;
}

/** The live channel. A dropped socket reconnects on its own. */
export function subscribe(handlers: Events, onStatus?: (live: boolean) => void): () => void {
  const token = readToken();
  if (!token) return () => undefined;
  const source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
  for (const [name, handler] of Object.entries(handlers)) {
    source.addEventListener(name, event => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as never;
        (handler as (value: never) => void)(payload);
      } catch {
        /* a malformed frame is dropped, never acted on */
      }
    });
  }
  if (onStatus) {
    source.addEventListener('hello', () => onStatus(true));
    source.onopen = () => onStatus(true);
    source.onerror = () => onStatus(false);
  }
  return () => source.close();
}
