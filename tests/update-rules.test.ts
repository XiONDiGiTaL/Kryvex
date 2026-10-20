import { describe, expect, it } from 'vitest';
import {
  UPDATE_RELEASES_API,
  UPDATE_RELEASES_PAGE,
  checksumFor,
  compareVersions,
  formatBytes,
  isNewer,
  isTrustedAssetUrl,
  normalizeVersion,
  parseChecksums,
  parseRelease,
  releaseAssetFor,
} from '../electron/update-rules';

const ASSET_BASE = 'https://github.com/XiONDiGiTaL/Kryvex/releases/download/v0.6.1';

function release(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'v0.6.1',
    name: 'Kryvex 0.6.1',
    body: 'Notes',
    published_at: '2026-10-20T00:00:00Z',
    html_url: 'https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.6.1',
    draft: false,
    prerelease: false,
    assets: [
      {
        name: 'Kryvex-Setup-0.6.1-x64.exe',
        browser_download_url: `${ASSET_BASE}/Kryvex-Setup-0.6.1-x64.exe`,
        size: 120_000_000,
      },
      {
        name: 'Kryvex-Portable-0.6.1-x64.exe',
        browser_download_url: `${ASSET_BASE}/Kryvex-Portable-0.6.1-x64.exe`,
        size: 119_000_000,
      },
      {
        name: 'SHA256SUMS.txt',
        browser_download_url: `${ASSET_BASE}/SHA256SUMS.txt`,
        size: 200,
      },
    ],
    ...overrides,
  };
}

describe('version comparison', () => {
  it('normalises tags and prereleases', () => {
    expect(normalizeVersion('v0.6.1')).toBe('0.6.1');
    expect(normalizeVersion('0.7.0-beta.2')).toBe('0.7.0-beta.2');
    expect(normalizeVersion('release-1')).toBeNull();
  });

  it('orders releases numerically, not lexically', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('v0.6.1', '0.6.0')).toBeGreaterThan(0);
    expect(compareVersions('0.6.0', '0.6.0')).toBe(0);
    expect(isNewer('0.6.0', 'v0.6.0')).toBe(false);
  });

  it('treats a prerelease as older than the final release', () => {
    expect(compareVersions('0.7.0-beta.1', '0.7.0')).toBeLessThan(0);
    expect(compareVersions('0.7.0', '0.7.0-beta.1')).toBeGreaterThan(0);
    expect(compareVersions('0.7.0-beta.2', '0.7.0-beta.10')).toBeLessThan(0);
  });
});

describe('release parsing', () => {
  it('reads the installer, portable and checksum assets', () => {
    const parsed = parseRelease(release());
    expect(parsed?.version).toBe('0.6.1');
    expect(parsed?.setup?.name).toBe('Kryvex-Setup-0.6.1-x64.exe');
    expect(parsed?.portable?.name).toBe('Kryvex-Portable-0.6.1-x64.exe');
    expect(parsed?.checksums?.name).toBe('SHA256SUMS.txt');
    expect(releaseAssetFor(parsed!, false)?.size).toBe(120_000_000);
    expect(releaseAssetFor(parsed!, true)?.size).toBe(119_000_000);
  });

  it('rejects drafts, prereleases and malformed tags', () => {
    expect(parseRelease(release({ draft: true }))).toBeNull();
    expect(parseRelease(release({ prerelease: true }))).toBeNull();
    expect(parseRelease(release({ tag_name: 'latest' }))).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });

  it('drops assets from unknown hosts and mismatched versions', () => {
    const parsed = parseRelease(
      release({
        assets: [
          {
            name: 'Kryvex-Setup-0.6.1-x64.exe',
            browser_download_url: 'https://evil.example/Kryvex-Setup-0.6.1-x64.exe',
            size: 10,
          },
          {
            name: 'Kryvex-Setup-0.6.0-x64.exe',
            browser_download_url: `${ASSET_BASE}/Kryvex-Setup-0.6.0-x64.exe`,
            size: 10,
          },
        ],
      }),
    );
    expect(parsed?.setup).toBeNull();
    expect(parsed?.checksums).toBeNull();
  });

  it('allows a loopback test feed only when its origin is supplied', () => {
    const local = {
      name: 'Kryvex-Setup-0.6.1-x64.exe',
      browser_download_url: 'http://127.0.0.1:8123/Kryvex-Setup-0.6.1-x64.exe',
      size: 10,
    };
    expect(parseRelease(release({ assets: [local] }))?.setup).toBeNull();
    expect(
      parseRelease(release({ assets: [local] }), { devOrigin: 'http://127.0.0.1:8123' })?.setup
        ?.name,
    ).toBe('Kryvex-Setup-0.6.1-x64.exe');
  });

  it('falls back to the releases page for an unexpected html_url', () => {
    const parsed = parseRelease(release({ html_url: 'https://example.com/phish' }));
    expect(parsed?.pageUrl).toBe(UPDATE_RELEASES_PAGE);
    expect(UPDATE_RELEASES_API).toContain('releases/latest');
  });
});

describe('asset URL policy', () => {
  it('accepts GitHub release hosts over https', () => {
    expect(isTrustedAssetUrl(`${ASSET_BASE}/Kryvex-Setup-0.6.1-x64.exe`)).toBe(true);
    expect(
      isTrustedAssetUrl('https://objects.githubusercontent.com/github-production-release-asset/x'),
    ).toBe(true);
  });

  it('rejects http, foreign hosts and non-URLs', () => {
    expect(isTrustedAssetUrl('http://github.com/file.exe')).toBe(false);
    expect(isTrustedAssetUrl('https://github.com.evil.example/file.exe')).toBe(false);
    expect(isTrustedAssetUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isTrustedAssetUrl(null)).toBe(false);
  });
});

describe('checksums', () => {
  const hash = 'a'.repeat(64);

  it('parses both sha256sum formats', () => {
    const map = parseChecksums(
      `${hash}  Kryvex-Setup-0.6.1-x64.exe\n${'b'.repeat(64)} *Kryvex-Portable-0.6.1-x64.exe\n`,
    );
    expect(checksumFor(map, 'Kryvex-Setup-0.6.1-x64.exe')).toBe(hash);
    expect(checksumFor(map, 'kryvex-portable-0.6.1-x64.exe')).toBe('b'.repeat(64));
    expect(checksumFor(map, 'missing.exe')).toBeNull();
  });

  it('ignores malformed and unsafe lines', () => {
    const map = parseChecksums(`nonsense\n${hash}  ../../evil.exe\n${'c'.repeat(63)} short\n`);
    expect(map.size).toBe(0);
  });
});

describe('formatBytes', () => {
  it('formats download sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(120_000_000)).toBe('114 MB');
  });
});
