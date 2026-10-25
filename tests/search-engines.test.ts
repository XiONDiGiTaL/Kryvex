import { describe, expect, it } from 'vitest';
import {
  SEARCH_ENGINES,
  SEARCH_REGIONS,
  engineGroups,
  enginesForRegion,
  isSearchEngine,
  isSearchRegion,
  searchEngine,
  searchUrl,
} from '../src/lib/search-engines';

describe('search engine catalogue', () => {
  it('includes every engine the picker promises', () => {
    const ids = SEARCH_ENGINES.map(engine => engine.id);
    for (const id of [
      'duckduckgo',
      'google',
      'bing',
      'yandex',
      'mojeek',
      'kagi',
      'swisscows',
      'metager',
      'searxng',
      'dogpile',
      'marginalia',
      'yep',
      'perplexity',
      'you',
      'baidu',
      'naver',
      'daum',
      'seznam',
      'coccoc',
      'sogou',
      'petal',
    ]) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('builds a query URL for an engine, encoding the query', () => {
    expect(searchUrl('google', 'a & b')).toBe('https://www.google.com/search?q=a%20%26%20b');
    expect(searchUrl('mojeek', 'kryvex')).toBe('https://www.mojeek.com/search?q=kryvex');
    expect(searchUrl('baidu', '你好')).toContain('baidu.com/s?wd=');
    expect(searchEngine('kagi').host).toBe('kagi.com');
  });

  it('filters regional engines and lists everything worldwide', () => {
    expect(enginesForRegion('global')).toHaveLength(SEARCH_ENGINES.length);
    expect(enginesForRegion('cn').map(engine => engine.id)).toEqual(['baidu', 'sogou']);
    expect(enginesForRegion('kr').map(engine => engine.id)).toEqual(['naver', 'daum']);
    expect(enginesForRegion('cz').map(engine => engine.id)).toEqual(['seznam']);
    expect(enginesForRegion('vn').map(engine => engine.id)).toEqual(['coccoc']);
    expect(enginesForRegion('intl').map(engine => engine.id)).toEqual(['petal']);
  });

  it('groups worldwide engines by region for a native select', () => {
    const groups = engineGroups('global');
    expect(groups.length).toBe(SEARCH_REGIONS.length);
    expect(groups[0]?.label).toBe('Worldwide');
    expect(groups.flatMap(group => group.engines)).toHaveLength(SEARCH_ENGINES.length);
    expect(engineGroups('kr')).toEqual([
      { label: 'South Korea', engines: expect.arrayContaining([expect.objectContaining({ id: 'naver' })]) },
    ]);
  });

  it('validates persisted engine and region ids', () => {
    expect(isSearchEngine('yep')).toBe(true);
    expect(isSearchEngine('altavista')).toBe(false);
    expect(isSearchRegion('kr')).toBe(true);
    expect(isSearchRegion('global')).toBe(true);
    expect(isSearchRegion('mars')).toBe(false);
  });
});

describe('Yandex', () => {
  it('builds an encoded query URL and validates the id', () => {
    expect(isSearchEngine('yandex')).toBe(true);
    expect(searchEngine('yandex').name).toBe('Yandex');
    expect(searchUrl('yandex', 'hello world & co')).toBe(
      'https://yandex.com/search/?text=hello%20world%20%26%20co',
    );
    expect(enginesForRegion('global').map(engine => engine.id)).toContain('yandex');
  });
});
