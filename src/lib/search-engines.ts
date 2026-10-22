import type { SearchEngine, SearchRegion } from '../types';

export interface SearchRegionDef {
  id: SearchRegion;
  label: string;
  hint: string;
}

export interface SearchEngineDef {
  id: SearchEngine;
  name: string;
  /** Host shown in Settings and used for the favicon-free label. */
  host: string;
  purpose: string;
  region: SearchRegion;
  /** The query is URL-encoded and substituted for `{q}`. */
  template: string;
}

export const SEARCH_REGIONS: ReadonlyArray<SearchRegionDef> = [
  { id: 'global', label: 'Worldwide', hint: 'Every engine, grouped by region.' },
  { id: 'cn', label: 'China', hint: 'Chinese-language engines.' },
  { id: 'kr', label: 'South Korea', hint: 'Korean-language engines.' },
  { id: 'cz', label: 'Czech Republic', hint: 'Czech-language engines.' },
  { id: 'vn', label: 'Vietnam', hint: 'Vietnamese-language engines.' },
  { id: 'intl', label: 'International', hint: 'Regional engines that serve many countries.' },
];

/**
 * One table for the address bar, the Settings picker and the offline
 * assistant's search fallback. Brand names are intentionally not translated.
 */
export const SEARCH_ENGINES: ReadonlyArray<SearchEngineDef> = [
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    host: 'duckduckgo.com',
    purpose: 'Private general search',
    region: 'global',
    template: 'https://duckduckgo.com/?q={q}',
  },
  {
    id: 'google',
    name: 'Google',
    host: 'google.com',
    purpose: 'General search',
    region: 'global',
    template: 'https://www.google.com/search?q={q}',
  },
  {
    id: 'bing',
    name: 'Bing',
    host: 'bing.com',
    purpose: 'General search',
    region: 'global',
    template: 'https://www.bing.com/search?q={q}',
  },
  {
    id: 'mojeek',
    name: 'Mojeek',
    host: 'mojeek.com',
    purpose: 'Independent index, privacy',
    region: 'global',
    template: 'https://www.mojeek.com/search?q={q}',
  },
  {
    id: 'kagi',
    name: 'Kagi',
    host: 'kagi.com',
    purpose: 'Paid, ad-free search',
    region: 'global',
    template: 'https://kagi.com/search?q={q}',
  },
  {
    id: 'swisscows',
    name: 'Swisscows',
    host: 'swisscows.com',
    purpose: 'Privacy, family-friendly filtering',
    region: 'global',
    template: 'https://swisscows.com/en/web?query={q}',
  },
  {
    id: 'metager',
    name: 'MetaGer',
    host: 'metager.org',
    purpose: 'Privacy-oriented metasearch',
    region: 'global',
    template: 'https://metager.org/meta/meta.ger3?eingabe={q}',
  },
  {
    id: 'searxng',
    name: 'SearXNG',
    host: 'searx.space',
    purpose: 'Self-hostable metasearch',
    region: 'global',
    // searx.space indexes public instances; the official demo instance runs
    // the same software and accepts a query directly.
    template: 'https://searx.be/search?q={q}',
  },
  {
    id: 'dogpile',
    name: 'Dogpile',
    host: 'dogpile.com',
    purpose: 'Aggregated results',
    region: 'global',
    template: 'https://www.dogpile.com/serp?q={q}',
  },
  {
    id: 'marginalia',
    name: 'Marginalia Search',
    host: 'marginalia-search.com',
    purpose: 'Smaller, independent, text-focused sites',
    region: 'global',
    template: 'https://search.marginalia.nu/search?query={q}',
  },
  {
    id: 'yep',
    name: 'Yep',
    host: 'yep.com',
    purpose: 'Alternative general search',
    region: 'global',
    template: 'https://yep.com/web?q={q}',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    host: 'perplexity.ai',
    purpose: 'AI-assisted web research',
    region: 'global',
    template: 'https://www.perplexity.ai/search?q={q}',
  },
  {
    id: 'you',
    name: 'You.com',
    host: 'you.com',
    purpose: 'AI-assisted search and answers',
    region: 'global',
    template: 'https://you.com/search?q={q}',
  },
  {
    id: 'baidu',
    name: 'Baidu',
    host: 'baidu.com',
    purpose: 'China, Chinese',
    region: 'cn',
    template: 'https://www.baidu.com/s?wd={q}',
  },
  {
    id: 'sogou',
    name: 'Sogou',
    host: 'sogou.com',
    purpose: 'China, Chinese',
    region: 'cn',
    template: 'https://www.sogou.com/web?query={q}',
  },
  {
    id: 'naver',
    name: 'Naver',
    host: 'naver.com',
    purpose: 'South Korea, Korean',
    region: 'kr',
    template: 'https://search.naver.com/search.naver?query={q}',
  },
  {
    id: 'daum',
    name: 'Daum',
    host: 'daum.net',
    purpose: 'South Korea, Korean',
    region: 'kr',
    template: 'https://search.daum.net/search?q={q}',
  },
  {
    id: 'seznam',
    name: 'Seznam',
    host: 'seznam.cz',
    purpose: 'Czech Republic, Czech',
    region: 'cz',
    template: 'https://search.seznam.cz/?q={q}',
  },
  {
    id: 'coccoc',
    name: 'Cốc Cốc',
    host: 'coccoc.com',
    purpose: 'Vietnam, Vietnamese',
    region: 'vn',
    template: 'https://coccoc.com/search?query={q}',
  },
  {
    id: 'petal',
    name: 'Petal Search',
    host: 'petalsearch.com',
    purpose: 'International, regional',
    region: 'intl',
    template: 'https://petalsearch.com/search?query={q}',
  },
] as const;

const BY_ID = new Map(SEARCH_ENGINES.map(engine => [engine.id, engine]));

export function isSearchEngine(value: unknown): value is SearchEngine {
  return typeof value === 'string' && BY_ID.has(value as SearchEngine);
}

export function isSearchRegion(value: unknown): value is SearchRegion {
  return SEARCH_REGIONS.some(region => region.id === value);
}

export function searchEngine(id: SearchEngine): SearchEngineDef {
  return BY_ID.get(id) ?? SEARCH_ENGINES[0]!;
}

export function searchUrl(engine: SearchEngine, query: string): string {
  const template = searchEngine(engine).template;
  return template.replace('{q}', encodeURIComponent(query.trim()));
}

/** Engines visible for a region: Worldwide lists everything. */
export function enginesForRegion(region: SearchRegion): SearchEngineDef[] {
  return region === 'global'
    ? [...SEARCH_ENGINES]
    : SEARCH_ENGINES.filter(engine => engine.region === region);
}

/** Grouped list for a native <select>; the region filter narrows it first. */
export function engineGroups(region: SearchRegion): Array<{
  label: string;
  engines: SearchEngineDef[];
}> {
  const visible = enginesForRegion(region);
  if (region !== 'global') {
    return [{ label: SEARCH_REGIONS.find(item => item.id === region)?.label ?? 'Regional', engines: visible }];
  }
  const groups = new Map<SearchRegion, SearchEngineDef[]>();
  for (const engine of visible) {
    const list = groups.get(engine.region) ?? [];
    list.push(engine);
    groups.set(engine.region, list);
  }
  // Worldwide is its own group so a native <select> can show every engine.
  return SEARCH_REGIONS.flatMap(item => {
    const engines = groups.get(item.id) ?? [];
    return engines.length > 0 ? [{ label: item.label, engines }] : [];
  });
}
