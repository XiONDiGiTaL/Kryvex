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
 * and a user agent that claims Chrome while the engine fails Chrome's own
 * checks is refused with "This browser or app may not be secure". Reporting the
 * real product there is what makes the flow continue, so the original agent is
 * kept for that one surface.
 */
let applicationAgent = '';

export function rememberApplicationAgent(agent: string): void {
  if (typeof agent === 'string' && agent) applicationAgent = agent;
}

export function applicationUserAgent(): string {
  return applicationAgent;
}

/**
 * Swaps in the application's own user agent and drops the Chrome client hints,
 * because hints assert the Chrome brand at the header level. Every other
 * header is left as the privacy policy produced it.
 */
export function withApplicationUserAgent(
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
