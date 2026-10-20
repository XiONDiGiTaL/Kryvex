import { describe, expect, it } from 'vitest';
import {
  CUSTOM_THEME_ID,
  DEFAULT_CUSTOM_THEME,
  DEFAULT_THEME_ID,
  THEMES,
  buildCustomTheme,
  getTheme,
  isThemeId,
  sanitizeCustomTheme,
} from '../src/lib/themes';
import { relativeLuminance } from '../src/lib/color';

const REQUIRED = ['bg', 'surface', 'raised', 'line', 'ink', 'muted', 'accent', 'accentSoft'];

describe('theme catalogue', () => {
  it('ships a broad periodic catalogue plus the donkey plugin', () => {
    expect(THEMES).toHaveLength(38);
    expect(THEMES.filter(theme => !theme.plugin)).toHaveLength(37);
    expect(THEMES.map(theme => theme.id)).toEqual(
      expect.arrayContaining([
        'kryvex-dark',
        'kryvex-light',
        'sunburst',
        'violet',
        'lapis-lazuli',
        'turquoise',
        'platinum',
        'terminal',
        'carbon',
        'gold',
        'mercury',
        'oxygen',
        'special-donkey',
      ]),
    );
    const donkey = getTheme('special-donkey');
    expect(donkey.plugin).toBe(true);
    expect(donkey.mark).toBe('donkey');
    expect(donkey.symbol).toBe('Dk');
    expect(donkey.tokens.accent).toBe('#F2C94C');
    expect(donkey.tokens.bg).toBe('#070605');
  });

  it('gives every theme a complete token set and a picker identity', () => {
    const symbols = new Set<string>();
    for (const theme of THEMES) {
      for (const token of REQUIRED) {
        expect(theme.tokens[token], `${theme.id}.${token}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
      expect(['dark', 'light']).toContain(theme.mode);
      expect(theme.symbol, `${theme.id}.symbol`).toMatch(/^[A-Z][a-z]$/);
      expect(symbols.has(theme.symbol ?? ''), `${theme.id}.symbol unique`).toBe(false);
      symbols.add(theme.symbol ?? '');
      expect(theme.number).toBeGreaterThan(0);
      expect([
        'core',
        'spectrum',
        'element',
        'metal',
        'light',
        'terminal',
        'custom',
      ]).toContain(theme.family);
    }
  });

  it('marks gradient, glass and terminal options', () => {
    expect(THEMES.filter(theme => theme.gradient).length).toBeGreaterThan(5);
    expect(THEMES.filter(theme => theme.glass).map(theme => theme.id)).toEqual([
      'platinum',
      'mercury',
    ]);
    expect(THEMES.find(theme => theme.id === 'terminal')?.mono).toBe(true);
    expect(THEMES.find(theme => theme.id === 'sunburst')?.gradient).toBe(true);
  });

  it('defaults to Kryvex Dark and accepts the custom id', () => {
    expect(DEFAULT_THEME_ID).toBe('kryvex-dark');
    expect(getTheme('nope').id).toBe('kryvex-dark');
    expect(isThemeId('kryvex-light')).toBe(true);
    expect(isThemeId(CUSTOM_THEME_ID)).toBe(true);
    expect(isThemeId('dracula')).toBe(false);
  });

  it('uses the brand palette for the default theme', () => {
    const theme = getTheme('kryvex-dark');
    expect(theme.tokens.bg).toBe('#0B0E12');
    expect(theme.tokens.accent).toBe('#38BDF8');
    expect(theme.tokens.accentSoft).toBe('#2DD4BF');
  });
});

describe('custom themes', () => {
  it('builds a complete palette from five colours', () => {
    const theme = buildCustomTheme({
      name: 'Signal',
      bg: '#081018',
      surface: '#0E1A26',
      accent: '#FF7A00',
      accentSoft: '#FFD166',
      ink: '#F7FAFC',
    });
    expect(theme.id).toBe(CUSTOM_THEME_ID);
    expect(theme.name).toBe('Signal');
    expect(theme.symbol).toBe('Cx');
    expect(theme.family).toBe('custom');
    expect(theme.mode).toBe('dark');
    for (const token of REQUIRED) expect(theme.tokens[token]).toMatch(/^#[0-9A-F]{6}$/);
    expect(theme.tokens.raised).not.toBe(theme.tokens.surface);
    expect(theme.tokens.muted).not.toBe(theme.tokens.ink);
  });

  it('derives light mode from a light background', () => {
    const theme = buildCustomTheme({
      ...DEFAULT_CUSTOM_THEME,
      bg: '#F7F4EC',
      surface: '#FFFFFF',
      ink: '#1A1510',
    });
    expect(relativeLuminance('#F7F4EC')).toBeGreaterThan(0.52);
    expect(theme.mode).toBe('light');
  });

  it('sanitises malformed saved colours field by field', () => {
    const theme = sanitizeCustomTheme({
      name: '  Saved  ',
      bg: 'red',
      surface: '#abc',
      accent: '#123456',
      accentSoft: 'nope',
      ink: '#000000',
    });
    expect(theme.name).toBe('Saved');
    expect(theme.bg).toBe(DEFAULT_CUSTOM_THEME.bg);
    expect(theme.surface).toBe('#AABBCC');
    expect(theme.accent).toBe('#123456');
    expect(theme.accentSoft).toBe(DEFAULT_CUSTOM_THEME.accentSoft);
    expect(theme.ink).toBe('#000000');
    expect(sanitizeCustomTheme(null)).toEqual(DEFAULT_CUSTOM_THEME);
  });
});
