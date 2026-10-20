import { describe, expect, it } from 'vitest';
import {
  MAX_CUSTOM_BYTES,
  MAX_CUSTOM_LINES,
  YOUTUBE_FILTERS,
  activeCustomLines,
  composeFilterSource,
  customLineCount,
  isPrivilegedFilter,
  sanitizeCustomFilters,
} from '../electron/shield-rules';

const YOUTUBE_SAMPLE = [
  '! =========================',
  '! YouTube Popup/Ad Flags',
  '! =========================',
  'www.youtube.com##+js(set, yt.config_.openPopupConfig.enabled, false)',
  'www.youtube.com##ytd-ad-slot-renderer',
  '||youtube.com/pagead/',
  '||doubleclick.net^$domain=www.youtube.com',
].join('\n');

describe('sanitizeCustomFilters', () => {
  it('normalizes line endings and trims trailing whitespace', () => {
    expect(sanitizeCustomFilters('a##.ad   \r\nb##.ad\t\r\n')).toBe('a##.ad\nb##.ad');
  });

  it('ignores anything that is not a string', () => {
    expect(sanitizeCustomFilters(undefined)).toBe('');
    expect(sanitizeCustomFilters({ rules: [] })).toBe('');
    expect(sanitizeCustomFilters(12)).toBe('');
  });

  it('drops NUL bytes instead of storing them', () => {
    expect(sanitizeCustomFilters('a##.ad\u0000\nb##.ad')).toBe('a##.ad\nb##.ad');
  });

  it('caps the list at the documented limits', () => {
    const many = Array.from({ length: MAX_CUSTOM_LINES + 50 }, () => 'example.com##.ad').join('\n');
    expect(customLineCount(sanitizeCustomFilters(many))).toBe(MAX_CUSTOM_LINES);

    const wide = `${'x'.repeat(200)}\n`.repeat(MAX_CUSTOM_BYTES);
    expect(Buffer.byteLength(sanitizeCustomFilters(wide), 'utf8')).toBeLessThanOrEqual(
      MAX_CUSTOM_BYTES,
    );
  });
});

describe('isPrivilegedFilter', () => {
  it('flags scriptlets, html filters, redirects and replacements', () => {
    expect(isPrivilegedFilter('www.youtube.com##+js(set, a, false)')).toBe(true);
    expect(isPrivilegedFilter('example.com##^script')).toBe(true);
    expect(isPrivilegedFilter('||example.com/ad.js$redirect=noop.js')).toBe(true);
    expect(isPrivilegedFilter('||example.com/ad.js$replace=/a/b/')).toBe(true);
  });

  it('leaves ordinary rules alone', () => {
    expect(isPrivilegedFilter('||ads.example.com^')).toBe(false);
    expect(isPrivilegedFilter('example.com##.ad-slot')).toBe(false);
    expect(isPrivilegedFilter('example.com#@#.ad-slot')).toBe(false);
  });
});

describe('activeCustomLines', () => {
  it('counts rules and comments separately', () => {
    const report = activeCustomLines(YOUTUBE_SAMPLE, { scriptlets: true });
    expect(report.rules).toBe(4);
    expect(report.comments).toBe(3);
    expect(report.skipped).toBe(0);
  });

  it('holds scriptlets back when trust is off, but keeps the rest', () => {
    const report = activeCustomLines(YOUTUBE_SAMPLE, { scriptlets: false });
    expect(report.rules).toBe(3);
    expect(report.skipped).toBe(1);
  });

  it('reports zero for an empty list', () => {
    expect(activeCustomLines('', { scriptlets: true })).toEqual({
      rules: 0,
      comments: 0,
      skipped: 0,
      bytes: 0,
      truncated: false,
    });
  });
});

describe('composeFilterSource', () => {
  it('puts base lists first, the bundle next and custom rules last', () => {
    const source = composeFilterSource({
      base: '||base.example^',
      custom: 'example.com##.mine',
      youtube: true,
      options: { scriptlets: true },
    });
    const base = source.indexOf('||base.example^');
    const bundle = source.indexOf('ytd-ad-slot-renderer');
    const mine = source.indexOf('example.com##.mine');
    expect(base).toBeGreaterThanOrEqual(0);
    expect(bundle).toBeGreaterThan(base);
    expect(mine).toBeGreaterThan(bundle);
  });

  it('omits disabled parts instead of emitting empty headers', () => {
    const source = composeFilterSource({
      base: '||base.example^',
      custom: '   ',
      youtube: false,
      options: { scriptlets: true },
    });
    expect(source).toBe('||base.example^');
  });

  it('keeps a custom exception able to override the bundle', () => {
    const source = composeFilterSource({
      base: '',
      custom: 'www.youtube.com#@#ytd-ad-slot-renderer',
      youtube: true,
      options: { scriptlets: true },
    });
    expect(source.trimEnd().endsWith('www.youtube.com#@#ytd-ad-slot-renderer')).toBe(true);
  });

  it('drops scriptlet rules from the composed source when trust is off', () => {
    const source = composeFilterSource({
      base: '||base.example^',
      custom: YOUTUBE_SAMPLE,
      youtube: false,
      options: { scriptlets: false },
    });
    expect(source).not.toContain('##+js(');
    expect(source).toContain('www.youtube.com##ytd-ad-slot-renderer');
  });
});

describe('YOUTUBE_FILTERS', () => {
  it('covers ads, sponsorship and feed noise without touching other sites', () => {
    for (const needle of [
      'ytd-display-ad-renderer',
      'ytd-ad-slot-renderer',
      'Sponsored',
      'ytd-shelf-renderer',
      '||youtube.com/pagead/',
    ]) {
      expect(YOUTUBE_FILTERS).toContain(needle);
    }
    const networkRules = YOUTUBE_FILTERS.split('\n').filter(line => line.startsWith('||'));
    for (const rule of networkRules) {
      expect(rule.includes('youtube.com') || rule.includes('$domain=www.youtube.com')).toBe(true);
    }
  });
});
