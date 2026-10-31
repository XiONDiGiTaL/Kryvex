import { describe, expect, it } from 'vitest';
import {
  CHANNEL_TEXT_LIMIT,
  channelLabel,
  flattenComments,
  githubTarget,
  paperTarget,
  parseArxivFeed,
  sanitizeChannel,
  sanitizeTarget,
} from '../electron/vexium-channels';
import { formatChannel, parsePlan } from '../electron/vexium-planner';

/**
 * The channel tools are network-bound, so the tests cover the parts that decide
 * what may be fetched and what the model is handed: the target parsers, the
 * feed parser and the planner. A live endpoint is not a contract, and a test
 * that depends on GitHub's uptime would fail for the wrong reason.
 */

describe('channel names', () => {
  it('accepts the planner names and the words models reach for', () => {
    for (const name of ['github', 'GitHub', 'repo', 'repository', 'code']) {
      expect(sanitizeChannel(name)).toBe('github');
    }
    for (const name of ['discussion', 'hackernews', 'hacker-news', 'hn', 'thread']) {
      expect(sanitizeChannel(name)).toBe('discussion');
    }
    for (const name of ['paper', 'arXiv', 'research', 'preprint']) {
      expect(sanitizeChannel(name)).toBe('paper');
    }
    expect(sanitizeChannel('reddit')).toBeNull();
    // The video channel is not offered: see the limits at the top of the module.
    expect(sanitizeChannel('video')).toBeNull();
    expect(sanitizeChannel('')).toBeNull();
    expect(sanitizeChannel(undefined)).toBeNull();
    expect(channelLabel('github')).toBe('GitHub');
    expect(channelLabel('discussion')).toBe('Hacker News');
    expect(channelLabel('paper')).toBe('arXiv');
  });

  it('keeps a target to one printable, bounded line', () => {
    expect(sanitizeTarget('  owner/name\n')).toBe('owner/name');
    expect(sanitizeTarget('sum\u0000mer')).toBe('sum mer');
    expect(sanitizeTarget('a')).toBeNull();
    expect(sanitizeTarget('x'.repeat(301))).toBeNull();
    expect(sanitizeTarget(42)).toBeNull();
  });
});

describe('github targets', () => {
  it('reads a repository, an issue and a URL', () => {
    expect(githubTarget('XiONDiGiTaL/Kryvex')).toEqual({
      kind: 'repo',
      owner: 'XiONDiGiTaL',
      repo: 'Kryvex',
    });
    expect(githubTarget('owner/name#12')).toEqual({
      kind: 'repo',
      owner: 'owner',
      repo: 'name',
      issue: 12,
    });
    expect(githubTarget('https://github.com/XiONDiGiTaL/Kryvex/issues/7')).toEqual({
      kind: 'repo',
      owner: 'XiONDiGiTaL',
      repo: 'Kryvex',
      issue: 7,
    });
    expect(githubTarget('https://github.com/owner/name.git')).toEqual({
      kind: 'repo',
      owner: 'owner',
      repo: 'name',
    });
  });

  it('falls back to a search phrase, and refuses a link that names no repository', () => {
    expect(githubTarget('userscript manager')).toEqual({
      kind: 'search',
      query: 'userscript manager',
    });
    // A github.com URL that did not resolve is a bad link, not a search term.
    expect(githubTarget('https://github.com/owner/')).toBeNull();
  });
});

describe('paper targets', () => {
  it('reads an id, a versioned id, a link and a phrase', () => {
    expect(paperTarget('2401.12345')).toEqual({ kind: 'id', id: '2401.12345' });
    expect(paperTarget('arXiv:2401.12345v2')).toEqual({ kind: 'id', id: '2401.12345' });
    expect(paperTarget('https://arxiv.org/abs/2401.12345')).toEqual({
      kind: 'id',
      id: '2401.12345',
    });
    expect(paperTarget('https://arxiv.org/pdf/hep-th/9901001v1.pdf')).toEqual({
      kind: 'id',
      id: 'hep-th/9901001',
    });
    expect(paperTarget('retrieval augmented generation')).toEqual({
      kind: 'search',
      query: 'retrieval augmented generation',
    });
    expect(paperTarget('ab')).toBeNull();
  });
});

describe('arxiv feeds', () => {
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="html">ArXiv Query</title>
  <entry>
    <id>http://arxiv.org/abs/2401.12345v1</id>
    <published>2024-01-22T18:00:00Z</published>
    <title>Retrieval &amp; Ranking at Scale</title>
    <summary>We study &lt;retrieval&gt; over large corpora.</summary>
    <author><name>Ada Lovelace</name></author>
    <author><name>Alan Turing</name></author>
  </entry>
</feed>`;

  it('reads one entry with its authors and decoded abstract', () => {
    const entries = parseArxivFeed(feed);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('http://arxiv.org/abs/2401.12345v1');
    expect(entries[0]?.title).toBe('Retrieval & Ranking at Scale');
    expect(entries[0]?.abstract).toBe('We study <retrieval> over large corpora.');
    expect(entries[0]?.authors).toEqual(['Ada Lovelace', 'Alan Turing']);
    expect(entries[0]?.published).toBe('2024-01-22');
  });

  it('returns nothing for a feed without entries', () => {
    expect(parseArxivFeed('<feed><title>nothing</title></feed>')).toEqual([]);
    expect(parseArxivFeed('')).toEqual([]);
  });
});

describe('hacker news comments', () => {
  it('takes top-level comments before their replies, bounded', () => {
    const tree = [
      {
        author: 'alice',
        text: '<p>first &amp; best</p>',
        children: [{ author: 'bob', text: 'reply', children: [] }],
      },
      { author: 'carol', text: '', children: [] },
      { author: 'dave', text: 'third', children: [] },
    ];
    const flat = flattenComments(tree, 2);
    expect(flat.map(comment => comment.author)).toEqual(['alice', 'bob']);
    expect(flat[0]?.text).toBe('first & best');
    expect(flattenComments(undefined)).toEqual([]);
  });
});

describe('the channel plan', () => {
  it('accepts a channel and its target', () => {
    expect(
      parsePlan('{"action":"channel","channel":"github","target":"owner/name"}'),
    ).toMatchObject({ action: 'channel', channel: 'github', target: 'owner/name' });
    // A model that renames the fields still lands on a valid read.
    expect(parsePlan('{"action":"channel","site":"arxiv","url":"2401.12345"}')).toMatchObject({
      action: 'channel',
      channel: 'paper',
      target: '2401.12345',
    });
    expect(parsePlan('{"tool":"channel","channel":"hn","query":"llama.cpp"}')).toMatchObject({
      action: 'channel',
      channel: 'discussion',
      target: 'llama.cpp',
    });
  });

  it('falls back to a plain answer when the channel or target is missing', () => {
    expect(parsePlan('{"action":"channel","channel":"reddit","target":"x"}')).toEqual({
      action: 'answer',
    });
    expect(parsePlan('{"action":"channel","channel":"video","target":"dQw4w9WgXcQ"}')).toEqual({
      action: 'answer',
    });
    expect(parsePlan('{"action":"channel","channel":"github"}')).toEqual({ action: 'answer' });
    expect(parsePlan('{"action":"channel","target":"owner/name"}')).toEqual({ action: 'answer' });
  });
});

describe('channel context', () => {
  it('numbers its sources and stays inside the context budget', () => {
    const context = formatChannel({
      channel: 'github',
      label: 'GitHub',
      text: 'GITHUB REPOSITORY\nowner/name',
      sources: [
        { title: 'owner/name', url: 'https://github.com/owner/name' },
        { title: 'second', url: 'https://example.com/second' },
      ],
    });
    expect(context).toContain('[1] owner/name\nhttps://github.com/owner/name');
    expect(context).toContain('[2] second\nhttps://example.com/second');
  });

  it('adds no source section for a read that found nothing', () => {
    const context = formatChannel({
      channel: 'discussion',
      label: 'Hacker News',
      text: 'HACKER NEWS SEARCH\nNo story matched "zzz".',
      sources: [],
    });
    expect(context).not.toContain('SOURCES');
    expect(context.length).toBeLessThanOrEqual(CHANNEL_TEXT_LIMIT);
  });
});
