import {
  MAX_RECENT_SEARCHES,
  rememberSearch,
  sanitizeRecentSearches,
} from '../electron/search-rules';
import { describe, expect, it } from 'vitest';
import {
  MAX_SEARCH_QUERY,
  SEARCH_RESULT_LIMIT,
  matchScore,
  rankItems,
  sanitizeSearchHits,
  searchTerms,
  type SearchItem,
} from '../electron/search-rules';
import { collectIndex, searchLocal } from '../electron/search';

const item = (over: Partial<SearchItem> = {}): SearchItem => ({
  id: 'history:1',
  source: 'history',
  title: 'Inbox',
  url: 'https://mail.google.com/',
  at: 1000,
  ...over,
});

describe('the query', () => {
  it('splits into whole lower-case terms and drops repeats', () => {
    expect(searchTerms('  Gmail  Documentation gmail ')).toEqual(['gmail', 'documentation']);
    expect(searchTerms('a')).toEqual(['a']);
  });

  it('refuses a query that is not worth running', () => {
    expect(searchTerms('')).toBeNull();
    expect(searchTerms('   ')).toBeNull();
    expect(searchTerms(42)).toBeNull();
    expect(searchTerms(null)).toBeNull();
    expect(searchTerms(undefined)).toBeNull();
  });

  it('caps a pasted paragraph instead of failing it', () => {
    const terms = searchTerms('one two three four five six seven eight nine ten');
    expect(terms).toHaveLength(8);
    expect(terms?.[0]).toBe('one');
    const long = searchTerms('x'.repeat(MAX_SEARCH_QUERY * 2));
    expect(long?.[0]?.length).toBe(MAX_SEARCH_QUERY);
  });
});

describe('scoring', () => {
  it('ranks a title start above a word inside the title, and that above a URL', () => {
    const start = matchScore({ title: 'Gmail – inbox' }, ['gmail']);
    const word = matchScore({ title: 'Mail from Gmail archive' }, ['gmail']);
    const part = matchScore({ title: 'Webgmail backup' }, ['gmail']);
    const secondary = matchScore({ title: 'Inbox', url: 'https://mail.google.com/gmail' }, ['gmail']);
    expect(start).toBeGreaterThan(word ?? 0);
    expect(word).toBeGreaterThan(part ?? 0);
    expect(part).toBeGreaterThan(secondary ?? 0);
    expect(matchScore({ title: 'Inbox' }, ['gmail'])).toBeNull();
  });

  it('requires every term, and lets each one match a different field', () => {
    const both = matchScore({ title: 'Project notes', subtitle: 'github.com' }, ['notes', 'github']);
    expect(both).not.toBeNull();
    expect(matchScore({ title: 'Project notes' }, ['notes', 'github'])).toBeNull();
  });

  it('does not treat a later substring as a word start', () => {
    const word = matchScore({ title: 'Search: gmail' }, ['gmail']);
    const part = matchScore({ title: 'Webgmail' }, ['gmail']);
    expect(word).toBeGreaterThan(part ?? 0);
  });
});

describe('ranking', () => {
  it('orders by score, then by recency, then by name', () => {
    const hits = rankItems(
      [
        item({ id: 'a', title: 'Old mail', at: 10 }),
        item({ id: 'b', title: 'Mail', at: 10 }),
        item({ id: 'c', title: 'Mail', at: 5000 }),
        item({ id: 'd', title: 'Unrelated', url: 'https://example.com/', at: 9000 }),
      ],
      ['mail'],
    );
    expect(hits.map(hit => hit.id)).toEqual(['c', 'b', 'a']);
    expect(hits.every(hit => hit.score > 0)).toBe(true);
  });

  it('caps the answer and refuses to run without terms', () => {
    const many = Array.from({ length: 60 }, (_value, index) =>
      item({ id: `i${index}`, title: `Note ${index}` }),
    );
    expect(rankItems(many, ['note'])).toHaveLength(SEARCH_RESULT_LIMIT);
    expect(rankItems(many, [])).toEqual([]);
    expect(rankItems(many, ['note'], 5)).toHaveLength(5);
  });
});

describe('what the renderer accepts back', () => {
  it('drops records it cannot draw and keeps the rest', () => {
    const hits = sanitizeSearchHits([
      { id: 'history:1', source: 'history', title: 'Inbox', url: 'https://mail.google.com/', score: 40 },
      { id: 'x', source: 'nonsense', title: 'Nope' },
      { id: 'y', source: 'bookmark', title: '   ' },
      { source: 'bookmark', title: 'No id' },
      'not an object',
      null,
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe('Inbox');
    expect(hits[0]?.url).toBe('https://mail.google.com/');
    expect(sanitizeSearchHits('nope')).toEqual([]);
    expect(sanitizeSearchHits({})).toEqual([]);
  });

  it('never hands the renderer a non-web URL or an unusable score', () => {
    const [hit] = sanitizeSearchHits([
      { id: 'a', source: 'download', title: 'file.txt', url: 'file:///etc/passwd', score: 'high' },
    ]);
    expect(hit?.url).toBeUndefined();
    expect(hit?.score).toBe(0);
  });
});

describe('the local index', () => {
  const state = {
    services: [
      { id: 's1', name: 'Gmail', url: 'https://mail.google.com/', lastOpened: 3000 },
      { id: 's2', name: 'Broken' },
    ],
    history: [
      { id: 'h1', url: 'https://example.com/notes', title: 'Notes on search', visitedAt: 2000 },
      { id: 'h2', url: 'javascript:alert(1)', title: 'Never indexed' },
    ],
    bookmarks: [{ id: 'b1', url: 'https://github.com/XiONDiGiTaL/Kryvex', title: 'Kryvex', createdAt: 1500 }],
  };
  const downloads = [
    {
      id: 'd1',
      filename: 'vexium-core.gguf',
      url: 'https://github.com/XiONDiGiTaL/Vexium-Core/releases/download/v2/x.gguf',
      savePath: 'C:\\Users\\tester\\Downloads\\vexium-core.gguf',
      receivedBytes: 10,
      totalBytes: 10,
      state: 'completed' as const,
      startedAt: 1200,
      updatedAt: 1300,
    },
  ];

  it('indexes services, history, bookmarks and downloads', () => {
    const sources = collectIndex({ state, downloads }).map(entry => entry.source);
    expect(sources).toEqual(['service', 'history', 'bookmark', 'download']);
  });

  it('skips a record it cannot trust instead of dropping the list', () => {
    const index = collectIndex({ state, downloads });
    expect(index.map(entry => entry.id)).not.toContain('service:s2');
    expect(index.map(entry => entry.url)).not.toContain('javascript:alert(1)');
    expect(index).toHaveLength(4);
    expect(collectIndex({ state: null, downloads: [] })).toEqual([]);
  });

  it('answers one query across every source', () => {
    expect(searchLocal({ state, downloads }, 'notes').map(hit => hit.source)).toEqual(['history']);
    expect(searchLocal({ state, downloads }, 'kryvex').map(hit => hit.source)).toEqual(['bookmark']);
    // The download is found by its own name, not by the repository it came from.
    expect(searchLocal({ state, downloads }, 'vexium').map(hit => hit.source)).toEqual(['download']);
    expect(searchLocal({ state, downloads }, 'gmail').map(hit => hit.source)).toEqual(['service']);
    expect(searchLocal({ state, downloads }, '')).toEqual([]);
  });

  it('keeps a download file on disk addressable without exposing it in the row text', () => {
    const [hit] = searchLocal({ state, downloads }, 'vexium');
    expect(hit?.path).toBe('C:\\Users\\tester\\Downloads\\vexium-core.gguf');
    expect(hit?.subtitle).toBe('github.com');
  });
});

describe('remembered searches', () => {
  it('puts the newest query first, once', () => {
    expect(rememberSearch([], 'krita')).toEqual(['krita']);
    expect(rememberSearch(['krita'], 'godot')).toEqual(['godot', 'krita']);
    expect(rememberSearch(['godot', 'krita'], 'krita')).toEqual(['krita', 'godot']);
  });

  it('does not keep two spellings of the same query', () => {
    expect(rememberSearch(['Krita'], 'krita')).toEqual(['krita']);
    expect(rememberSearch(['  krita  '], 'KRITA')).toEqual(['KRITA']);
  });

  it('caps the list, dropping the oldest', () => {
    let list: string[] = [];
    for (let index = 0; index < MAX_RECENT_SEARCHES + 4; index += 1) {
      list = rememberSearch(list, `query ${index}`);
    }
    expect(list).toHaveLength(MAX_RECENT_SEARCHES);
    expect(list[0]).toBe(`query ${MAX_RECENT_SEARCHES + 3}`);
    expect(list).not.toContain('query 0');
  });

  it('ignores what is not a query', () => {
    expect(sanitizeRecentSearches(null)).toEqual([]);
    expect(sanitizeRecentSearches('krita')).toEqual([]);
    expect(sanitizeRecentSearches([1, null, {}, '  ', 'ok'])).toEqual(['ok']);
    expect(rememberSearch(['ok'], '   ')).toEqual(['ok']);
    expect(rememberSearch(['ok'], 42)).toEqual(['ok']);
  });

  it('collapses whitespace and caps a long query', () => {
    expect(rememberSearch([], '  alpha   beta ')).toEqual(['alpha beta']);
    const long = rememberSearch([], 'x'.repeat(400));
    expect(long[0]?.length).toBe(120);
  });
});
