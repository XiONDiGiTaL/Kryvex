import { describe, expect, it } from 'vitest';
import {
  CLOCK_ACCENTS,
  CLOCK_ALIGNS,
  CLOCK_FONTS,
  CLOCK_STYLES,
  DEFAULT_CLOCK_ACCENT,
  DEFAULT_CLOCK_ALIGN,
  DEFAULT_CLOCK_FONT,
  DEFAULT_CLOCK_SCALE,
  DEFAULT_CLOCK_STYLE,
  MAX_CLOCK_SCALE,
  MIN_CLOCK_SCALE,
  clockClasses,
  clockStyleVars,
  isClockAccent,
  isClockAlign,
  isClockStyle,
  sanitizeClockScale,
} from '../src/lib/clock-style';
import { DEFAULT_HOME } from '../src/lib/defaults';
import { sanitizeHome } from '../src/lib/store';

describe('clock look', () => {
  it('offers five styles, three accents, three placements and the curated families', () => {
    expect(CLOCK_STYLES.map(entry => entry.id)).toEqual([
      'bare',
      'card',
      'mono',
      'outline',
      'classic',
    ]);
    expect(CLOCK_ACCENTS.map(entry => entry.id)).toEqual(['theme', 'accent', 'muted']);
    expect(CLOCK_ALIGNS.map(entry => entry.id)).toEqual(['left', 'center', 'right']);
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
    expect(isClockStyle('outline')).toBe(true);
    expect(isClockStyle('classic')).toBe(true);
    expect(isClockStyle('analog')).toBe(false);
    expect(isClockStyle(null)).toBe(false);
    expect(isClockAccent('accent')).toBe(true);
    expect(isClockAccent('neon')).toBe(false);
    expect(isClockAlign('center')).toBe(true);
    expect(isClockAlign('justify')).toBe(false);
  });

  it('builds the class list the stylesheet switches on', () => {
    expect(clockClasses('card', 'accent', 'default')).toBe(
      'home-clock is-card accent-accent align-left',
    );
    expect(clockClasses('mono', 'muted', 'serif', 'center')).toBe(
      'home-clock is-mono accent-muted align-center has-font',
    );
  });

  it('sets the family only when one was chosen, and always the size', () => {
    expect(clockStyleVars('default')).toEqual({ '--clock-scale': '1' });
    expect(Object.keys(clockStyleVars('serif'))).toEqual(['--clock-scale', '--clock-font']);
    expect(clockStyleVars('serif')['--clock-font']).toContain('Georgia');
    expect(clockStyleVars('display')['--clock-font']).toContain('Bahnschrift');
    expect(clockStyleVars('slab')['--clock-font']).toContain('Rockwell');
  });

  it('clamps the size into its band and ignores junk', () => {
    expect(DEFAULT_CLOCK_SCALE).toBe(100);
    expect(sanitizeClockScale(145)).toBe(145);
    expect(sanitizeClockScale(10)).toBe(MIN_CLOCK_SCALE);
    expect(sanitizeClockScale(900)).toBe(MAX_CLOCK_SCALE);
    expect(sanitizeClockScale('120')).toBe(120);
    expect(sanitizeClockScale(null)).toBe(DEFAULT_CLOCK_SCALE);
    expect(sanitizeClockScale('big')).toBe(DEFAULT_CLOCK_SCALE);
    expect(clockStyleVars('default', 145)['--clock-scale']).toBe('1.45');
    // A hand-edited file cannot push the digits past the supported band.
    expect(clockStyleVars('default', 4000)['--clock-scale']).toBe('1.8');
  });
});

describe('clock look persistence', () => {
  it('starts free of a box, in the theme colour, in the UI font, at fit and left', () => {
    expect(DEFAULT_HOME.clockStyle).toBe('bare');
    expect(DEFAULT_HOME.clockAccent).toBe('theme');
    expect(DEFAULT_HOME.clockFont).toBe('default');
    expect(DEFAULT_HOME.clockScale).toBe(100);
    expect(DEFAULT_HOME.clockAlign).toBe('left');
    expect(DEFAULT_HOME.showBoardClock).toBe(true);
    expect(DEFAULT_CLOCK_STYLE).toBe('bare');
    expect(DEFAULT_CLOCK_ACCENT).toBe('theme');
    expect(DEFAULT_CLOCK_FONT).toBe('default');
    expect(DEFAULT_CLOCK_ALIGN).toBe('left');
  });

  it('keeps a saved choice and refuses one it does not ship', () => {
    const saved = sanitizeHome({
      clockStyle: 'outline',
      clockAccent: 'muted',
      clockFont: 'serif',
      clockScale: 145,
      clockAlign: 'right',
      showBoardClock: false,
    });
    expect(saved.clockStyle).toBe('outline');
    expect(saved.clockAccent).toBe('muted');
    expect(saved.clockFont).toBe('serif');
    expect(saved.clockScale).toBe(145);
    expect(saved.clockAlign).toBe('right');
    expect(saved.showBoardClock).toBe(false);

    const bad = sanitizeHome({
      clockStyle: 'hologram',
      clockAccent: 'rainbow',
      clockFont: 'comic',
      clockScale: 10_000,
      clockAlign: 'justify',
    });
    expect(bad.clockStyle).toBe('bare');
    expect(bad.clockAccent).toBe('theme');
    expect(bad.clockFont).toBe('default');
    expect(bad.clockScale).toBe(MAX_CLOCK_SCALE);
    expect(bad.clockAlign).toBe('left');
  });

  it('reads a file written before the setting existed as the default clock', () => {
    const legacy = sanitizeHome({ clockHour12: true, widgetOrder: [] });
    expect(legacy.showBoardClock).toBe(true);
    expect(legacy.clockStyle).toBe('bare');
    expect(legacy.clockScale).toBe(100);
    expect(legacy.clockAlign).toBe('left');
    expect(legacy.clockHour12).toBe(true);
  });
});
