import { describe, expect, it } from 'vitest';
import {
  canonicalUrl,
  isLocalHost,
  sameSite,
  stripTrackingParams,
  upgradeToHttps,
} from '../electron/brave-rules';

describe('stripTrackingParams', () => {
  it('removes campaign and click identifiers but keeps functional parameters', () => {
    const result = stripTrackingParams(
      'https://news.example/story?utm_source=mail&utm_campaign=launch&fbclid=abc&id=42&page=2#top',
    );
    expect(result).toBe('https://news.example/story?id=42&page=2#top');
  });

  it('removes prefixes and common ad identifiers case-insensitively', () => {
    const result = stripTrackingParams(
      'https://shop.example/?UTM_Medium=email&gclid=123&_hsenc=p2&q=shoes',
    );
    expect(result).toBe('https://shop.example/?q=shoes');
  });

  it('leaves same-site and non-http URLs alone', () => {
    expect(
      stripTrackingParams('https://app.example/inbox?utm_source=nav', 'https://app.example/home'),
    ).toBeNull();
    expect(
      stripTrackingParams('https://www.example.com/?utm_source=x', 'https://example.com/'),
    ).toBeNull();
    expect(stripTrackingParams('file:///tmp/a?utm_source=x')).toBeNull();
  });

  it('does not rewrite a URL that has no tracking parameters', () => {
    expect(stripTrackingParams('https://example.com/?q=term')).toBeNull();
    expect(stripTrackingParams('not a url')).toBeNull();
  });
});

describe('upgradeToHttps', () => {
  it('upgrades a default-port public HTTP URL', () => {
    expect(upgradeToHttps('http://example.com/story?utm_source=x')).toBe(
      'https://example.com/story?utm_source=x',
    );
    expect(upgradeToHttps('http://example.com')).toBe('https://example.com/');
  });

  it('does not upgrade HTTPS, custom ports, or local destinations', () => {
    expect(upgradeToHttps('https://example.com/')).toBeNull();
    expect(upgradeToHttps('http://example.com:8080/')).toBeNull();
    expect(upgradeToHttps('http://localhost:3000/')).toBeNull();
    expect(upgradeToHttps('http://127.0.0.1/')).toBeNull();
    expect(upgradeToHttps('http://192.168.1.1/')).toBeNull();
    expect(upgradeToHttps('http://printer.local/')).toBeNull();
  });
});

describe('isLocalHost', () => {
  it('recognises loopback, private and local names', () => {
    for (const host of ['localhost', 'app.localhost', '127.0.0.1', '10.1.2.3', '172.16.4.2', '192.168.0.1', 'fe80::1', 'nas.local']) {
      expect(isLocalHost(host), host).toBe(true);
    }
  });

  it('does not treat public names or addresses as local', () => {
    for (const host of ['example.com', '172.32.0.1', '8.8.8.8']) {
      expect(isLocalHost(host), host).toBe(false);
    }
  });
});

describe('sameSite', () => {
  it('treats parent and child hosts as one site', () => {
    expect(sameSite('www.example.com', 'example.com')).toBe(true);
    expect(sameSite('api.example.com', 'www.example.com')).toBe(false);
  });
});

describe('canonicalUrl', () => {
  it('drops fragments and tolerates invalid values', () => {
    expect(canonicalUrl('https://example.com/a#section')).toBe('https://example.com/a');
    expect(canonicalUrl('not a url')).toBe('not a url');
  });
});
