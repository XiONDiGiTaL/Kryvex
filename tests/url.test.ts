import { describe, expect, it } from 'vitest';
import { hostOf, normalizeUrl, resolveAddress, searchUrl } from '../src/lib/url';

describe('normalizeUrl', () => {
  it('adds https to bare hosts', () => {
    expect(normalizeUrl('notion.so')).toBe('https://notion.so');
    expect(normalizeUrl('  linear.app/team  ')).toBe('https://linear.app/team');
  });

  it('keeps explicit http and https URLs', () => {
    expect(normalizeUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
  });

  it('rejects non-http protocols and nonsense', () => {
    expect(() => normalizeUrl('javascript:alert(1)')).toThrow(/Only http/i);
    expect(() => normalizeUrl('file:///etc/passwd')).toThrow(/Only http/i);
    expect(() => normalizeUrl('')).toThrow(/Enter a URL/i);
    expect(() => normalizeUrl('not a url')).toThrow(/valid URL/i);
  });

  it('rejects hosts without a domain', () => {
    expect(() => normalizeUrl('intranet')).toThrow(/missing a domain/i);
  });

  it('drops fragments so the same page is not duplicated', () => {
    expect(normalizeUrl('https://example.com/doc#section')).toBe('https://example.com/doc');
  });
});

describe('hostOf', () => {
  it('strips the scheme and www prefix', () => {
    expect(hostOf('https://www.notion.so/page')).toBe('notion.so');
    expect(hostOf('http://localhost:3000')).toBe('localhost:3000');
  });

  it('falls back to the raw value when parsing fails', () => {
    expect(hostOf('not a url')).toBe('not a url');
  });
});

describe('resolveAddress', () => {
  it('navigates when the value looks like a host', () => {
    expect(resolveAddress('github.com/XiONDiGiTaL', 'duckduckgo')).toBe(
      'https://github.com/XiONDiGiTaL',
    );
  });

  it('searches otherwise, using the configured engine', () => {
    expect(resolveAddress('kryvex electron', 'duckduckgo')).toContain('duckduckgo.com');
    expect(resolveAddress('kryvex electron', 'google')).toContain('google.com/search');
    expect(resolveAddress('kryvex electron', 'bing')).toContain('bing.com/search');
  });

  it('passes through explicit schemes untouched', () => {
    expect(resolveAddress('https://example.com/a b', 'google')).toBe('https://example.com/a b');
  });

  it('returns about:blank for empty input', () => {
    expect(resolveAddress('   ', 'google')).toBe('about:blank');
  });
});

describe('searchUrl', () => {
  it('encodes the query', () => {
    expect(searchUrl('google', 'a & b')).toBe('https://www.google.com/search?q=a%20%26%20b');
  });
});
