import { describe, expect, it } from 'vitest';
import { feedRequestUrl } from '../electron/rss-rules';

describe('feedRequestUrl', () => {
  it('accepts http(s) URLs and drops the fragment', () => {
    expect(feedRequestUrl('https://example.com/rss#top')).toBe('https://example.com/rss');
    expect(feedRequestUrl('http://127.0.0.1:8126/rss')).toBe('http://127.0.0.1:8126/rss');
  });

  it('rejects bare hosts, other schemes and credentials', () => {
    expect(feedRequestUrl('example.com/rss')).toBe('');
    expect(feedRequestUrl('javascript:alert(1)')).toBe('');
    expect(feedRequestUrl('file:///C:/feed.xml')).toBe('');
    expect(feedRequestUrl('https://user:pass@example.com/rss')).toBe('');
  });

  it('rejects a hostname without a domain and overlong input', () => {
    expect(feedRequestUrl('https://intranet/rss')).toBe('');
    expect(feedRequestUrl(`https://example.com/${'a'.repeat(2100)}`)).toBe('');
    expect(feedRequestUrl(null)).toBe('');
  });
});
