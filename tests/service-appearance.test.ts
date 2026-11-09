import { describe, expect, it } from 'vitest';
import {
  ARCADE_SKIN,
  APPEARANCE_SHEET_LIMIT,
  GRAPHITE_SKIN,
  appearanceTargetFor,
  appearanceValueFor,
  buildServiceCss,
  parseAppearanceValue,
  sanitizeServiceAppearance,
} from '../src/lib/service-appearance';
import { getTheme, THEMES } from '../src/lib/themes';

const ACTIVE = THEMES[0]!;

describe('sanitizeServiceAppearance', () => {
  it('treats off, unknown and missing values as no appearance', () => {
    expect(sanitizeServiceAppearance(undefined)).toBeUndefined();
    expect(sanitizeServiceAppearance(null)).toBeUndefined();
    expect(sanitizeServiceAppearance('follow')).toBeUndefined();
    expect(sanitizeServiceAppearance({ skin: 'off' })).toBeUndefined();
    expect(sanitizeServiceAppearance({ skin: 'neon' })).toBeUndefined();
    expect(sanitizeServiceAppearance([])).toBeUndefined();
  });

  it('keeps the three fixed skins', () => {
    expect(sanitizeServiceAppearance({ skin: 'follow' })).toEqual({ skin: 'follow' });
    expect(sanitizeServiceAppearance({ skin: 'graphite' })).toEqual({ skin: 'graphite' });
    expect(sanitizeServiceAppearance({ skin: 'arcade' })).toEqual({ skin: 'arcade' });
  });

  it('keeps a pinned theme only when the catalogue knows it', () => {
    expect(sanitizeServiceAppearance({ skin: 'theme', themeId: 'neptune' })).toEqual({
      skin: 'theme',
      themeId: 'neptune',
    });
    expect(sanitizeServiceAppearance({ skin: 'custom' })).toBeUndefined();
    expect(sanitizeServiceAppearance({ skin: 'theme', themeId: 'not-a-theme' })).toBeUndefined();
    expect(sanitizeServiceAppearance({ skin: 'theme' })).toBeUndefined();
  });
});

describe('the select value', () => {
  it('round-trips every valid choice and folds the rest into off', () => {
    for (const appearance of [
      undefined,
      { skin: 'follow' as const },
      { skin: 'graphite' as const },
      { skin: 'arcade' as const },
      { skin: 'theme' as const, themeId: 'jupiter' },
    ]) {
      const value = appearanceValueFor(appearance);
      expect(parseAppearanceValue(value)).toEqual(appearance);
    }
    expect(appearanceValueFor({ skin: 'theme', themeId: 'gone' })).toBe('off');
    expect(parseAppearanceValue('theme:not-a-theme')).toBeUndefined();
    expect(parseAppearanceValue('nonsense')).toBeUndefined();
  });
});

describe('appearanceTargetFor', () => {
  it('recognises Discord and its own subdomains', () => {
    expect(appearanceTargetFor('https://discord.com/app')).toBe('discord');
    expect(appearanceTargetFor('https://canary.discord.com/channels/@me')).toBe('discord');
    expect(appearanceTargetFor('https://discordapp.com/')).toBe('discord');
  });

  it('does not mistake a lookalike for Discord', () => {
    expect(appearanceTargetFor('https://discord.com.evil.test/app')).toBe('generic');
    expect(appearanceTargetFor('https://notdiscord.com/')).toBe('generic');
    expect(appearanceTargetFor('https://example.com/')).toBe('generic');
    expect(appearanceTargetFor('not a url')).toBe('generic');
  });
});

describe('buildServiceCss', () => {
  const context = { target: 'discord' as const, theme: ACTIVE };

  it('produces nothing when the site should keep its own colours', () => {
    expect(buildServiceCss(undefined, context)).toBe('');
    expect(buildServiceCss({ skin: 'off' }, context)).toBe('');
  });

  it('follows the app theme, so a planet theme reaches a module', () => {
    const neptune = THEMES.find(theme => theme.id === 'neptune')!;
    const css = buildServiceCss(
      { skin: 'follow' },
      { target: 'discord', theme: neptune },
    );
    expect(css).toContain(neptune.tokens.accent!);
    expect(css).toContain(neptune.tokens.surface!);
    expect(css).toContain('--background-primary');
    expect(css).toContain('--brand-500');
  });

  it('pins one catalogue theme when asked for it', () => {
    const jupiter = THEMES.find(theme => theme.id === 'jupiter')!;
    const css = buildServiceCss({ skin: 'theme', themeId: 'jupiter' }, context);
    expect(css).toContain(jupiter.tokens.accent!);
  });

  it('resolves the Custom theme from the profile that owns it', () => {
    const css = buildServiceCss(
      { skin: 'theme', themeId: 'custom' },
      {
        target: 'discord',
        theme: ACTIVE,
        customTheme: {
          name: 'Mine',
          bg: '#101010',
          surface: '#202020',
          accent: '#ff8800',
          accentSoft: '#ffcc00',
          ink: '#ffffff',
        },
      },
    );
    // The catalogue stores this palette in upper case; the sheet copies the
    // token as written rather than rewriting it.
    expect(css.toLowerCase()).toContain('#ff8800');
    expect(css.toLowerCase()).toContain('#202020');
  });

  it('carries the shipped userscript palette as Graphite', () => {
    const css = buildServiceCss({ skin: 'graphite' }, context);
    expect(GRAPHITE_SKIN.tokens.accent).toBe('#8b7cf6');
    expect(css).toContain('--background-primary: #181b23');
    expect(css).toContain('--text-normal: #e6e8ee');
    expect(css).toContain('--brand-500: #8b7cf6');
  });

  it('carries the arcade palette as its own skin', () => {
    const css = buildServiceCss({ skin: 'arcade' }, context);
    expect(ARCADE_SKIN.tokens.bg).toBe('#050607');
    expect(css).toContain('--background-secondary: #050607');
    expect(css).toContain('--brand-500: #3f80ff');
    expect(css).toContain('--text-normal: #ecedef');
  });

  it('gives a non-Discord site the small generic sheet', () => {
    const css = buildServiceCss(
      { skin: 'follow' },
      { target: 'generic', theme: ACTIVE },
    );
    expect(css).toContain('color-scheme');
    expect(css).toContain('background-color');
    expect(css).toContain('scrollbar-color');
    expect(css).not.toContain('--background-primary');
  });
});

describe('the generated sheets', () => {
  it('are stylesheets only: no import, no url, no script surface', () => {
    for (const theme of THEMES) {
      for (const target of ['discord', 'generic'] as const) {
        const css = buildServiceCss({ skin: 'follow' }, { target, theme });
        expect(css).not.toMatch(/@import/i);
        expect(css).not.toMatch(/url\(/i);
        expect(css).not.toMatch(/expression\s*\(/i);
        expect(css).not.toMatch(/javascript:/i);
        expect(css).not.toContain('undefined');
        expect(css.length).toBeLessThanOrEqual(APPEARANCE_SHEET_LIMIT);
      }
    }
  });

  it('covers every catalogue theme with a complete palette', () => {
    for (const theme of THEMES) {
      const css = buildServiceCss({ skin: 'follow' }, { target: 'discord', theme });
      expect(css.startsWith(`/* Kryvex appearance: ${theme.name} */`)).toBe(true);
      expect(css).toContain('--header-primary');
      expect(css).toContain('--interactive-muted');
      expect(css).toContain('--scrollbar-auto-thumb');
      // Alpha washes only attach to a six-digit hex, so a short token must not
      // produce a broken colour such as "#abc0a".
      expect(css).not.toMatch(/#[0-9a-f]{4,5}\b/i);
    }
  });

  it('never emits a colour that is not a hex value', () => {
    const css = buildServiceCss({ skin: 'graphite' }, { target: 'generic', theme: ACTIVE });
    const colours = css.match(/:\s*([^;]+);/g) ?? [];
    expect(colours.length).toBeGreaterThan(3);
    for (const entry of colours) {
      expect(entry).not.toMatch(/NaN|none none|#[0-9a-f]{1,2}\b/i);
    }
  });
});

describe('getTheme fallback', () => {
  it('still resolves the active theme used by follow', () => {
    expect(getTheme(ACTIVE.id).id).toBe(ACTIVE.id);
  });
});
