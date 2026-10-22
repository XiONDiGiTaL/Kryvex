import { describe, expect, it } from 'vitest';
import {
  appendLog,
  buildVpnArgs,
  parseDns,
  proxyArgs,
  readVpnLine,
  sanitizeVpnConfig,
  tokenizeArgs,
  validateExtraArgs,
} from '../electron/vpn-rules';

const base = {
  enabled: true,
  binaryPath: 'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe',
  configPath: 'C:\\vpn\\work profile.ovpn',
  extraArgs: '',
  dns: '',
  proxy: '',
  autoConnect: false,
};

describe('vpn-rules', () => {
  it('sanitises stored settings and drops control characters', () => {
    const config = sanitizeVpnConfig({
      ...base,
      extraArgs: '--proto\u0000 udp',
      dns: '1.1.1.1',
      enabled: true,
    });
    expect(config.extraArgs).toBe('--proto udp');
    expect(config.enabled).toBe(true);
    expect(config.autoConnect).toBe(false);
  });

  it('builds an argv with the profile first and never a shell string', () => {
    const built = buildVpnArgs({ ...base, dns: '1.1.1.1, 9.9.9.9' });
    expect(built.ok).toBe(true);
    expect(built.args).toEqual([
      '--config',
      base.configPath,
      '--verb',
      '3',
      '--dhcp-option',
      'DNS',
      '1.1.1.1',
      '--dhcp-option',
      'DNS',
      '9.9.9.9',
    ]);
  });

  it('rejects an incomplete setup and invalid DNS', () => {
    expect(buildVpnArgs({ ...base, configPath: '' }).error).toMatch(/profile/i);
    expect(buildVpnArgs({ ...base, binaryPath: '' }).error).toMatch(/executable/i);
    expect(buildVpnArgs({ ...base, dns: 'not-an-ip' }).error).toMatch(/DNS/i);
  });

  it('refuses flags that hand control to another program', () => {
    for (const flag of ['--plugin evil.dll', '--up C:\\evil.bat', '--script-security 2', '--config other.ovpn']) {
      expect(validateExtraArgs(flag).error).toBeTruthy();
    }
    expect(validateExtraArgs('--proto udp --port 1194').args).toEqual(['--proto', 'udp', '--port', '1194']);
    expect(validateExtraArgs('--proto\nudp').error).toBeTruthy();
  });

  it('tokenises quoted arguments', () => {
    expect(tokenizeArgs('--remote "vpn example" 1194')).toEqual(['--remote', 'vpn example', '1194']);
  });

  it('maps proxy URLs to OpenVPN flags without exposing credentials', () => {
    expect(proxyArgs('socks5://127.0.0.1:1080').args).toEqual(['--socks-proxy', '127.0.0.1', '1080']);
    expect(proxyArgs('http://proxy.local').args).toEqual(['--http-proxy', 'proxy.local', '8080', 'auto']);
    expect(proxyArgs('http://user:pass@proxy.local').error).toMatch(/credentials/i);
    expect(proxyArgs('ftp://proxy.local').error).toMatch(/http/i);
  });

  it('accepts IPv4 and IPv6 DNS entries only', () => {
    expect(parseDns('1.1.1.1 2606:4700:4700::1111, 9.9.9.9')).toEqual([
      '1.1.1.1',
      '2606:4700:4700::1111',
      '9.9.9.9',
    ]);
    expect(parseDns('dns.example.com')).toEqual([]);
    expect(parseDns('999.1.1.1')).toEqual([]);
  });

  it('reads OpenVPN output without inventing success', () => {
    const connected = readVpnLine('Mon Oct 21 12:00:00 2026 Initialization Sequence Completed');
    expect(connected?.kind).toBe('connected');
    expect(readVpnLine('AUTH_FAILED')?.kind).toBe('auth-failed');
    expect(readVpnLine('Cannot open TUN/TAP dev')?.kind).toBe('error');
    expect(readVpnLine('Mon Oct 21 12:00:00 2026 TLS: Initial packet')).toBeNull();
  });

  it('keeps the log tail bounded', () => {
    let log = '';
    for (let index = 0; index < 800; index += 1) log = appendLog(log, `line ${index}\n`);
    expect(log.length).toBe(5000);
    expect(log.endsWith('line 799\n')).toBe(true);
    // Output that streams past the cap stays bounded instead of growing.
    expect(appendLog(log, 'x'.repeat(9000)).length).toBe(5000);
  });
});
