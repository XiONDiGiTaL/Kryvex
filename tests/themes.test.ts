import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_ID, THEMES, getTheme, isThemeId } from '../src/lib/themes';

const REQUIRED = ['bg', 'surface', 'raised', 'line', 'ink', 'muted', 'accent', 'accentSoft'];

describe('theme catalogue', () => {
  it('ships six core themes plus the donkey plugin', () => {
    expect(THEMES).toHaveLength(7);
    expect(THEMES.map(theme => theme.id)).toEqual([
      'kryvex-dark',
      'kryvex-light',
      'midnight',
      'graphite',
      'oled-black',
      'high-contrast',
      'special-donkey',
    ]);
    const donkey = getTheme('special-donkey');
    expect(donkey.plugin).toBe(true);
    expect(donkey.mark).toBe('donkey');
    expect(donkey.tokens.accent).toBe('#F2C94C');
    expect(donkey.tokens.bg).toBe('#070605');
  });

  it('gives every theme a complete token set', () => {
    for (const theme of THEMES) {
      for (const token of REQUIRED) {
        expect(theme.tokens[token], `${theme.id}.${token}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
      expect(['dark', 'light']).toContain(theme.mode);
    }
  });

  it('defaults to Kryvex Dark', () => {
    expect(DEFAULT_THEME_ID).toBe('kryvex-dark');
    expect(getTheme('nope').id).toBe('kryvex-dark');
    expect(isThemeId('kryvex-light')).toBe(true);
    expect(isThemeId('dracula')).toBe(false);
  });

  it('uses the brand palette for the default theme', () => {
    const theme = getTheme('kryvex-dark');
    expect(theme.tokens.bg).toBe('#0B0E12');
    expect(theme.tokens.accent).toBe('#38BDF8');
    expect(theme.tokens.accentSoft).toBe('#2DD4BF');
  });
});
