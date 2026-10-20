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
  it('ships a broad periodic catalogue plus the two creator plugins', () => {
    expect(THEMES).toHaveLength(80);
    expect(THEMES.filter(theme => !theme.plugin)).toHaveLength(78);
    expect(THEMES.filter(theme => theme.plugin)).toHaveLength(2);
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
        'special-xion',
        'crimson',
        'vermillion',
        'coral',
        'blush',
        'magenta',
        'fuchsia',
        'strontium',
        'cesium',
        'ruby',
        'sapphire',
        'opal',
        'tourmaline',
        'mercury-planet',
        'jupiter',
        'uranus',
        'neptune',
        'pluto',
        'nibiru',
      ]),
    );
    const donkey = getTheme('special-donkey');
    expect(donkey.plugin).toBe(true);
    expect(donkey.mark).toBe('donkey');
    expect(donkey.symbol).toBe('Dk');
    expect(donkey.tokens.accent).toBe('#F2C94C');
    expect(donkey.tokens.bg).toBe('#070605');

    const xion = getTheme('special-xion');
    expect(xion.plugin).toBe(true);
    expect(xion.mark).toBe('xion');
    expect(xion.symbol).toBe('Xi');
    expect(xion.tokens.accent).toBe('#33B5E5');
    expect(xion.tokens.accentSoft).toBe('#7FE3FF');
    expect(xion.tokens.bg).toBe('#04060A');
    expect(xion.gradient).toBe(true);
    expect(xion.glass).toBe(true);
    expect(relativeLuminance(xion.tokens.bg ?? '')).toBeLessThan(0.02);
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
        'gem',
        'planet',
        'light',
        'terminal',
        'custom',
      ]).toContain(theme.family);
    }
  });

  it('covers the gem and red families with their own tokens', () => {
    const gems = THEMES.filter(theme => theme.family === 'gem');
    expect(gems).toHaveLength(12);
    expect(gems.map(theme => theme.name)).toEqual(
      expect.arrayContaining(['Garnet', 'Diamond', 'Pearl', 'Ruby', 'Sapphire', 'Opal', 'Moonstone']),
    );
    expect(THEMES.find(theme => theme.id === 'ruby')?.tokens.accent).toBe('#E0115F');
    expect(THEMES.find(theme => theme.id === 'crimson')?.tokens.accent).toBe('#DC143C');
    expect(THEMES.find(theme => theme.id === 'vermillion')?.tokens.accent).toBe('#E6411B');
    expect(THEMES.find(theme => theme.id === 'fuchsia')?.tokens.accent).toBe('#FF2FB3');
    expect(THEMES.find(theme => theme.id === 'diamond')?.mode).toBe('light');
  });

  it('ships a full planet band with mixed gradient palettes', () => {
    const planets = THEMES.filter(theme => theme.family === 'planet');
    expect(planets).toHaveLength(12);
    expect(planets.every(theme => theme.gradient)).toBe(true);

    const jupiter = THEMES.find(theme => theme.id === 'jupiter');
    expect(jupiter?.tokens.accent).toBe('#E8C08A');
    expect(jupiter?.tokens.accentSoft).toBe('#C2452F');

    const uranus = THEMES.find(theme => theme.id === 'uranus');
    expect(uranus?.tokens.accent).toBe('#3F8E92');
    expect(uranus?.tokens.bg).toBe('#8DDDE2');
    expect(uranus?.mode).toBe('light');

    const neptune = THEMES.find(theme => theme.id === 'neptune');
    expect(neptune?.tokens.accent).toBe('#477EFD');
    expect(neptune?.tokens.accentSoft).toBe('#74D6FD');
    expect(neptune?.mode).toBe('dark');

    const pluto = THEMES.find(theme => theme.id === 'pluto');
    expect(pluto?.mode).toBe('light');
    expect(pluto?.tokens.accent).toBe('#8C4A32');

    const nibiru = THEMES.find(theme => theme.id === 'nibiru');
    expect(nibiru?.mode).toBe('dark');
    expect(relativeLuminance(nibiru?.tokens.bg ?? '')).toBeLessThan(0.01);
    expect(nibiru?.tokens.accent).toBe('#A8363A');

    expect(THEMES.find(theme => theme.id === 'mercury')).toMatchObject({ name: 'Quicksilver' });
  });

  it('keeps the pale turquoise theme readable on its own ground', () => {
    const turquoise = THEMES.find(theme => theme.id === 'turquoise');
    expect(turquoise?.mode).toBe('light');
    expect(turquoise?.tokens.bg).toBe('#B3ECEC');
    expect(turquoise?.tokens.accent).toBe('#0F7A72');
    // Body copy has to stay legible on the pale background it now sits on.
    expect(relativeLuminance(turquoise?.tokens.ink ?? '')).toBeLessThan(
      relativeLuminance(turquoise?.tokens.bg ?? ''),
    );
    expect(relativeLuminance(turquoise?.tokens.accent ?? '')).toBeLessThan(
      relativeLuminance(turquoise?.tokens.bg ?? ''),
    );
  });

  it('marks gradient, glass and terminal options', () => {
    expect(THEMES.filter(theme => theme.gradient).length).toBeGreaterThan(5);
    expect(THEMES.filter(theme => theme.glass).map(theme => theme.id)).toEqual([
      'platinum',
      'mercury',
      'special-xion',
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
