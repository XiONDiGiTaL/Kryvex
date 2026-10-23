import { describe, expect, it } from 'vitest';
import { stableUserAgent, withApplicationUserAgent } from '../electron/user-agent';

describe('stableUserAgent', () => {
  it('reports the bundled Chromium engine and never the Electron shell', () => {
    for (const platform of ['win32', 'darwin', 'linux']) {
      const agent = stableUserAgent(platform, '140.0.7339.41');
      expect(agent).toContain('Chrome/140.0.0.0');
      expect(agent).not.toMatch(/Electron|Kryvex/i);
    }
  });

  it('uses a platform-shaped user agent', () => {
    expect(stableUserAgent('win32', '140.1.2.3')).toContain('Windows NT 10.0; Win64; x64');
    expect(stableUserAgent('darwin', '140.1.2.3')).toContain('Macintosh; Intel Mac OS X');
    expect(stableUserAgent('linux', '140.1.2.3')).toContain('X11; Linux x86_64');
  });

  it('falls back to a plausible major version for an unknown engine', () => {
    expect(stableUserAgent('win32', 'nonsense')).toContain('Chrome/140.0.0.0');
  });
});

describe('withApplicationUserAgent', () => {
  const appAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Kryvex/0.8.8 Chrome/140.0.7339.41 Electron/44.9.3 Safari/537.36';

  it('replaces the user agent and drops the Chrome client hints', () => {
    const headers = withApplicationUserAgent(
      {
        'user-agent': 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Google Chrome";v="140"',
        'Sec-CH-UA-Platform': '"Windows"',
        accept: 'text/html',
      },
      appAgent,
    );
    expect(Object.keys(headers).filter(name => /^sec-ch-ua/i.test(name))).toEqual([]);
    expect(headers['user-agent']).toBe(appAgent);
    expect(headers.accept).toBe('text/html');
    expect(Object.keys(headers).filter(name => name.toLowerCase() === 'user-agent')).toHaveLength(1);
  });

  it('leaves the headers alone when no application agent was captured', () => {
    expect(withApplicationUserAgent({ accept: 'text/html' }, '')).toEqual({ accept: 'text/html' });
  });
});
