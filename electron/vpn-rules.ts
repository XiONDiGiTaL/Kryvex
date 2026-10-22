export interface VpnConfig {
  enabled: boolean;
  binaryPath: string;
  configPath: string;
  extraArgs: string;
  dns: string;
  proxy: string;
  autoConnect: boolean;
}

export type VpnPhase = 'idle' | 'connecting' | 'connected' | 'error' | 'missing' | 'stopped';

export interface VpnStatus {
  phase: VpnPhase;
  binaryFound: boolean;
  configFound: boolean;
  /** Echoed back so the renderer can persist a path picked in the dialog. */
  binaryPath: string;
  configPath: string;
  detail: string;
  log: string;
  since: number | null;
}

export const DEFAULT_VPN_CONFIG: VpnConfig = {
  enabled: false,
  binaryPath: '',
  configPath: '',
  extraArgs: '',
  dns: '',
  proxy: '',
  autoConnect: false,
};

function text(value: unknown, limit: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, limit)
    : '';
}

export function sanitizeVpnConfig(raw: unknown): VpnConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_VPN_CONFIG };
  const source = raw as Record<string, unknown>;
  return {
    enabled: source.enabled === true,
    binaryPath: text(source.binaryPath, 1024),
    configPath: text(source.configPath, 1024),
    // Flags are whitespace-sensitive: a stripped control character must not
    // leave a double space behind in the argv.
    extraArgs: text(source.extraArgs, 500).replace(/\s+/g, ' '),
    dns: text(source.dns, 200),
    proxy: text(source.proxy, 300),
    autoConnect: source.autoConnect === true,
  };
}

/** Flags that hand control to another executable are never forwarded. */
const BLOCKED_FLAGS = new Set([
  '--plugin',
  '--up',
  '--down',
  '--ipchange',
  '--route-up',
  '--route-pre-down',
  '--client-connect',
  '--client-disconnect',
  '--learn-address',
  '--auth-user-pass-verify',
  '--tls-verify',
  '--config',
  '--daemon',
  '--service',
  '--management',
  '--management-client',
  '--script-security',
]);

/** Splits the extra-arguments field, honouring simple quoting. */
export function tokenizeArgs(raw: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (const character of raw) {
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += character;
  }
  if (current) tokens.push(current);
  return tokens;
}

export function validateExtraArgs(raw: string): { args: string[]; error?: string } {
  if (/[\u0000\r\n]/.test(raw)) return { args: [], error: 'Extra arguments must stay on one line.' };
  const args = tokenizeArgs(raw);
  if (args.length > 32) return { args: [], error: 'Use at most 32 extra arguments.' };
  for (const arg of args) {
    if (arg.length > 200) return { args: [], error: 'An argument is too long.' };
    if (/^[;&|<>`]/.test(arg)) return { args: [], error: 'Shell characters are not allowed.' };
    const flag = arg.split('=')[0]?.toLowerCase() ?? '';
    if (BLOCKED_FLAGS.has(flag)) {
      return { args: [], error: `${flag} can run another program, so Kryvex will not pass it.` };
    }
  }
  return { args };
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

export function parseDns(raw: string): string[] {
  const entries = raw
    .split(/[\s,]+/)
    .map(value => value.trim())
    .filter(Boolean);
  return entries.filter(value => IPV4.test(value) || (value.includes(':') && IPV6.test(value)));
}

/**
 * Converts the optional proxy URL into OpenVPN's own flags. Credentials are
 * rejected rather than placed on a command line where another process could
 * read them; use the profile's auth file for that.
 */
export function proxyArgs(raw: string): { args: string[]; error?: string } {
  const value = raw.trim();
  if (!value) return { args: [] };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { args: [], error: 'The proxy must be an http:// or socks5:// URL.' };
  }
  if (url.username || url.password) {
    return { args: [], error: 'Put proxy credentials in the OpenVPN profile, not the URL.' };
  }
  const port = url.port || (url.protocol === 'socks5:' ? '1080' : url.protocol === 'https:' ? '443' : '8080');
  if (url.protocol === 'socks5:') return { args: ['--socks-proxy', url.hostname, port] };
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return { args: ['--http-proxy', url.hostname, port, 'auto'] };
  }
  return { args: [], error: 'Only http, https and socks5 proxies are supported.' };
}

/**
 * The argv OpenVPN receives. Every entry is a separate argument and the
 * process is started without a shell, so a profile path containing spaces or
 * an ampersand is data, not syntax.
 */
export function buildVpnArgs(config: VpnConfig): { ok: boolean; args: string[]; error?: string } {
  if (!config.configPath) return { ok: false, args: [], error: 'Choose an OpenVPN profile first.' };
  if (!config.binaryPath) return { ok: false, args: [], error: 'Choose the OpenVPN executable first.' };
  const extra = validateExtraArgs(config.extraArgs);
  if (extra.error) return { ok: false, args: [], error: extra.error };
  const proxy = proxyArgs(config.proxy);
  if (proxy.error) return { ok: false, args: [], error: proxy.error };
  const dns = parseDns(config.dns);
  if (config.dns.trim() && dns.length === 0) {
    return { ok: false, args: [], error: 'DNS entries must be IP addresses, separated by spaces or commas.' };
  }

  const args = ['--config', config.configPath, '--verb', '3', ...proxy.args];
  for (const server of dns) args.push('--dhcp-option', 'DNS', server);
  args.push(...extra.args);
  return { ok: true, args };
}

export type VpnEvent =
  | { kind: 'connected'; message: string }
  | { kind: 'auth-failed'; message: string }
  | { kind: 'error'; message: string }
  | null;

/** Reads OpenVPN's human output; it has no machine-readable event stream. */
export function readVpnLine(line: string): VpnEvent {
  const value = line.replace(/[\u0000-\u001f]/g, ' ').trim();
  if (!value) return null;
  if (/Initialization Sequence Completed/i.test(value)) {
    return { kind: 'connected', message: 'Tunnel established.' };
  }
  if (/AUTH_FAILED|authentication failed/i.test(value)) {
    return { kind: 'auth-failed', message: 'OpenVPN rejected the profile credentials.' };
  }
  if (/Cannot open TUN\/TAP|All TAP-Windows adapters|operation not permitted/i.test(value)) {
    return { kind: 'error', message: 'The VPN adapter could not be opened. Run OpenVPN as administrator or install its TAP driver.' };
  }
  if (/Options error|Exiting due to fatal error|ERROR:/i.test(value)) {
    return { kind: 'error', message: value.slice(0, 240) };
  }
  return null;
}

/** Keeps the log tail bounded and free of control characters. */
export function appendLog(current: string, chunk: string): string {
  const clean = chunk
    .replace(/\r/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .slice(-2000);
  return `${current}${clean}`.slice(-5000);
}
