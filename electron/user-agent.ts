/**
 * A stable, browser-shaped user agent for embedded services.
 *
 * Electron's composed default mentions "Electron/x" and the app name. Several
 * web clients treat that as an unsupported browser: they show warnings, force
 * a fresh sign-in, or refuse passkey and OAuth flows. Kryvex still runs a
 * Chromium engine, so it reports exactly that engine and nothing else.
 *
 * The value is computed once at launch. Changing it between visits is itself a
 * fingerprint, so it must stay stable for the lifetime of the app session.
 */
/**
 * The agent the app compiled itself, captured before the Chrome one replaces
 * it.
 *
 * Google's account pages verify the browser before they let a sign-in through,
 * and they read the product token in the agent. The engine is Chromium, so the
 * value kept here is the one source both other agents are built from: the
 * Chrome agent for ordinary sites, and the bare Chromium agent for Google, which
 * is this agent with the shell's product tokens removed.
 */
let applicationAgent = '';

export function rememberApplicationAgent(agent: string): void {
  if (typeof agent === 'string' && agent) applicationAgent = agent;
}

export function applicationUserAgent(): string {
  return applicationAgent;
}

/**
 * The agent of the browser Kryvex actually is.
 *
 * Electron's default is a Chromium agent with two product tokens appended
 * (`Kryvex/0.8.9` and `Electron/44.9.3`). Removing them leaves exactly what the
 * engine sends in a plain Chromium build: the platform, the rendering engine and
 * a Chrome-versioned token, which is what every Chromium browser (Brave, Edge,
 * Opera, Electron itself) has always sent. Nothing is invented and no other
 * product is claimed.
 *
 * Google is the reason this exists. A guest that claims to be Google Chrome is
 * refused by the account pages, and a guest that announces Electron is treated
 * as an embedded browser there; the engine naming only itself is accepted.
 */
export function chromiumUserAgent(agent: string): string {
  if (typeof agent !== 'string' || !agent) return '';
  return agent
    .replace(/\s*Kryvex\/[\d.]+/gi, '')
    .replace(/\s*Electron\/[\d.]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Swaps in a given user agent and drops the Chrome client hints, because hints
 * assert the product brand at the header level and the caller sets its own.
 * Every other header is left as the privacy policy produced it.
 */
export function withUserAgent(
  headers: Record<string, string>,
  agent: string,
): Record<string, string> {
  if (!agent) return { ...headers };
  const next: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (/^sec-ch-ua/i.test(name)) continue;
    next[name] = value;
  }
  const existing = Object.keys(next).find(name => name.toLowerCase() === 'user-agent');
  next[existing ?? 'User-Agent'] = agent;
  return next;
}

export function stableUserAgent(platform: string, chromeVersion: string): string {
  const major = (String(chromeVersion || '').split('.')[0] ?? '').replace(/\D/g, '') || '140';
  const engine = `AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
  if (platform === 'darwin') {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${engine}`;
  }
  if (platform === 'linux') {
    return `Mozilla/5.0 (X11; Linux x86_64) ${engine}`;
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${engine}`;
}
