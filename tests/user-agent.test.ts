import { describe, expect, it } from 'vitest';
import { stableUserAgent } from '../electron/user-agent';

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
