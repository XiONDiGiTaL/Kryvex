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
