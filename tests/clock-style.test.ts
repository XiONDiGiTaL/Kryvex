import { describe, expect, it } from 'vitest';
import {
  CLOCK_ACCENTS,
  CLOCK_FONTS,
  CLOCK_STYLES,
  DEFAULT_CLOCK_ACCENT,
  DEFAULT_CLOCK_FONT,
  DEFAULT_CLOCK_STYLE,
  clockClasses,
  clockStyleVars,
  isClockAccent,
  isClockStyle,
} from '../src/lib/clock-style';
import { DEFAULT_HOME } from '../src/lib/defaults';
import { sanitizeHome } from '../src/lib/store';

describe('clock look', () => {
  it('offers three styles, three accents and the curated families', () => {
    expect(CLOCK_STYLES.map(entry => entry.id)).toEqual(['bare', 'card', 'mono']);
    expect(CLOCK_ACCENTS.map(entry => entry.id)).toEqual(['theme', 'accent', 'muted']);
    expect(CLOCK_FONTS.map(entry => entry.id)).toContain('serif');
    // Family names are brand names and are drawn untranslated, as in Settings.
    expect(CLOCK_FONTS.every(entry => typeof entry.label === 'string' && entry.label.length > 0)).toBe(
      true,
    );
  });

  it('recognizes only the shipped values', () => {
    expect(isClockStyle('bare')).toBe(true);
    expect(isClockStyle('card')).toBe(true);
    expect(isClockStyle('mono')).toBe(true);
    expect(isClockStyle('analog')).toBe(false);
    expect(isClockStyle(null)).toBe(false);
    expect(isClockAccent('accent')).toBe(true);
    expect(isClockAccent('neon')).toBe(false);
  });

  it('builds the class list the stylesheet switches on', () => {
    expect(clockClasses('card', 'accent', 'default')).toBe('home-clock is-card accent-accent');
    expect(clockClasses('mono', 'muted', 'serif')).toBe(
      'home-clock is-mono accent-muted has-font',
    );
  });

  it('sets the family only when one was chosen', () => {
    expect(clockStyleVars('default')).toEqual({});
    expect(Object.keys(clockStyleVars('serif'))).toEqual(['--clock-font']);
    expect(clockStyleVars('serif')['--clock-font']).toContain('Georgia');
  });
});

describe('clock look persistence', () => {
  it('starts free of a box, in the theme colour, in the UI font', () => {
    expect(DEFAULT_HOME.clockStyle).toBe('bare');
    expect(DEFAULT_HOME.clockAccent).toBe('theme');
    expect(DEFAULT_HOME.clockFont).toBe('default');
    expect(DEFAULT_HOME.showBoardClock).toBe(true);
    expect(DEFAULT_CLOCK_STYLE).toBe('bare');
    expect(DEFAULT_CLOCK_ACCENT).toBe('theme');
    expect(DEFAULT_CLOCK_FONT).toBe('default');
  });

  it('keeps a saved choice and refuses one it does not ship', () => {
    const saved = sanitizeHome({
      clockStyle: 'mono',
      clockAccent: 'muted',
      clockFont: 'serif',
      showBoardClock: false,
    });
    expect(saved.clockStyle).toBe('mono');
    expect(saved.clockAccent).toBe('muted');
    expect(saved.clockFont).toBe('serif');
    expect(saved.showBoardClock).toBe(false);

    const bad = sanitizeHome({
      clockStyle: 'hologram',
      clockAccent: 'rainbow',
      clockFont: 'comic',
    });
    expect(bad.clockStyle).toBe('bare');
    expect(bad.clockAccent).toBe('theme');
    expect(bad.clockFont).toBe('default');
  });

  it('reads a file written before the setting existed as the default clock', () => {
    const legacy = sanitizeHome({ clockHour12: true, widgetOrder: [] });
    expect(legacy.showBoardClock).toBe(true);
    expect(legacy.clockStyle).toBe('bare');
    expect(legacy.clockHour12).toBe(true);
  });
});
