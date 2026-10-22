import { describe, expect, it } from 'vitest';
import {
  feedLabel,
  mergeFeedItems,
  normalizeFeedUrl,
  parseFeed,
  parseOpml,
  sanitizeFeeds,
  stripMarkup,
} from '../src/lib/rss';

describe('feed URL rules', () => {
  it('accepts bare hosts and http(s) URLs', () => {
    expect(normalizeFeedUrl('feeds.example.com/rss')).toBe('https://feeds.example.com/rss');
    expect(normalizeFeedUrl('http://example.com/atom.xml')).toBe('http://example.com/atom.xml');
  });

  it('rejects scripts, missing domains and empty values', () => {
    expect(normalizeFeedUrl('javascript:alert(1)')).toBe('');
    expect(normalizeFeedUrl('file:///C:/feed.xml')).toBe('');
    expect(normalizeFeedUrl('https://localhost-feed')).toBe('');
    expect(normalizeFeedUrl('')).toBe('');
    expect(normalizeFeedUrl(null)).toBe('');
  });

  it('falls back to the host as a feed label', () => {
    expect(feedLabel('https://www.example.com/rss.xml')).toBe('example.com');
  });
});

describe('parseFeed', () => {
  const rss = `<?xml version="1.0"?>
    <rss version="2.0"><channel>
      <title>Kryvex &amp; Friends</title>
      <item>
        <title><![CDATA[Start pages, done properly]]></title>
        <link>https://example.com/start</link>
        <description><![CDATA[<p>A <b>real</b> start page.</p>]]></description>
        <pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate>
        <guid>https://example.com/start</guid>
      </item>
      <item>
        <title>Feed without a link</title>
        <description>Skipped.</description>
      </item>
      <item>
        <title>Second post</title>
        <link>/second</link>
        <description>Relative links resolve against the feed.</description>
        <pubDate>Mon, 19 Oct 2026 10:00:00 GMT</pubDate>
      </item>
    </channel></rss>`;

  it('reads channel metadata, CDATA, entities and relative links', () => {
    const parsed = parseFeed(rss, 'https://example.com/feed.xml');
    expect(parsed.title).toBe('Kryvex & Friends');
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toEqual({
      id: 'https://example.com/start',
      title: 'Start pages, done properly',
      url: 'https://example.com/start',
      summary: 'A real start page.',
      publishedAt: Date.parse('Tue, 20 Oct 2026 10:00:00 GMT'),
    });
    expect(parsed.items[1]?.url).toBe('https://example.com/second');
  });

  it('reads Atom alternate links and titles', () => {
    const atom = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Atom Example</title>
        <entry>
          <title>Hello Atom</title>
          <link rel="self" href="https://example.com/entry/1"/>
          <link rel="alternate" href="https://example.com/posts/hello"/>
          <summary>An entry summary.</summary>
          <updated>2026-10-21T08:00:00Z</updated>
        </entry>
      </feed>`;
    const parsed = parseFeed(atom, 'https://example.com/atom.xml');
    expect(parsed.title).toBe('Atom Example');
    expect(parsed.items[0]?.url).toBe('https://example.com/posts/hello');
    expect(parsed.items[0]?.publishedAt).toBe(Date.parse('2026-10-21T08:00:00Z'));
  });

  it('falls back to the feed host when there is no channel title', () => {
    const parsed = parseFeed('<rss><channel><item><title>No title</title></item></channel></rss>', 'https://example.com/rss');
    expect(parsed.title).toBe('example.com');
    expect(parsed.items).toHaveLength(0);
  });

  it('caps a hostile feed at twelve items', () => {
    const items = Array.from({ length: 40 }, (_, index) => `
      <item><title>Item ${index}</title><link>https://example.com/${index}</link></item>`).join('');
    const parsed = parseFeed(`<rss><channel>${items}</channel></rss>`, 'https://example.com/feed');
    expect(parsed.items).toHaveLength(12);
  });

  it('ignores a document that is not XML-shaped', () => {
    expect(parseFeed('', 'https://example.com/feed')).toEqual({ title: '', items: [] });
    expect(parseFeed('<html>not a feed</html>', 'https://example.com/feed').items).toEqual([]);
  });
});

describe('feed text', () => {
  it('strips markup and decodes named and numeric entities', () => {
    expect(stripMarkup('<p>Tom &amp; Jerry&#8217;s <b>show</b></p>')).toBe('Tom & Jerry’s show');
    expect(stripMarkup('<script>alert(1)</script>Safe')).toBe('Safe');
  });

  it('sorts merged items newest first and keeps undated items last', () => {
    const merged = mergeFeedItems(
      [
        { id: 'a', title: 'A', url: 'https://a', summary: '', publishedAt: 100 },
        { id: 'b', title: 'B', url: 'https://b', summary: '', publishedAt: null },
        { id: 'c', title: 'C', url: 'https://c', summary: '', publishedAt: 300 },
      ],
      2,
    );
    expect(merged.map(item => item.id)).toEqual(['c', 'a']);
  });

  it('does not repeat a story syndicated by two feeds', () => {
    const merged = mergeFeedItems([
      { id: 'a', title: 'A', url: 'https://example.com/story', summary: '', publishedAt: 100 },
      { id: 'b', title: 'A again', url: 'https://example.com/story', summary: '', publishedAt: 90 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.title).toBe('A');
  });
});

describe('OPML import', () => {
  it('reads nested outlines and decodes escaped titles', () => {
    const opml = `<?xml version="1.0"?>
      <opml version="2.0"><body>
        <outline text="Tech">
          <outline text="Kryvex &amp; Friends" type="rss" xmlUrl="https://example.com/rss"/>
          <outline title="Second" type="rss" xmlUrl="https://example.com/atom.xml"/>
        </outline>
      </body></opml>`;
    expect(parseOpml(opml)).toEqual([
      { title: 'Kryvex & Friends', url: 'https://example.com/rss' },
      { title: 'Second', url: 'https://example.com/atom.xml' },
    ]);
  });

  it('deduplicates feeds and refuses non-web URLs', () => {
    const opml = `<outline xmlUrl="https://example.com/rss"/>
      <outline xmlUrl="https://example.com/rss"/>
      <outline xmlUrl="file:///tmp/feed.xml"/>`;
    expect(parseOpml(opml)).toEqual([{ title: 'example.com', url: 'https://example.com/rss' }]);
  });
});

describe('sanitizeFeeds', () => {
  it('keeps valid, unique feeds and stops at the limit', () => {
    const feeds = sanitizeFeeds([
      { id: 'f-1', title: 'One', url: 'https://example.com/rss', addedAt: 5 },
      { id: 'f-1', title: 'Duplicate id', url: 'https://example.org/rss' },
      { id: 'f-2', title: 'Duplicate URL', url: 'https://example.com/rss' },
      { id: '../bad', title: 'Bad id', url: 'https://bad.example/rss' },
      { id: 'f-3', title: '<b>Three</b>', url: 'javascript:alert(1)' },
    ]);
    expect(feeds).toEqual([
      { id: 'f-1', title: 'One', url: 'https://example.com/rss', addedAt: 5 },
    ]);
  });

  it('fills a missing title from the host', () => {
    const [feed] = sanitizeFeeds([{ id: 'f-1', url: 'https://www.example.com/rss' }]);
    expect(feed?.title).toBe('example.com');
    expect(feed?.addedAt).toBeTypeOf('number');
  });
});
