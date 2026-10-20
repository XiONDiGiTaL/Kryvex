import { describe, expect, it } from 'vitest';
import {
  CHROMIUM_ZOOM_STEPS,
  DEFAULT_CHROMIUM,
  chromiumFromState,
  chromiumSwitches,
  chromiumWebPreferences,
  sanitizeChromium,
  snapZoom,
} from '../electron/chromium-rules';
import {
  CHROMIUM_ZOOM_STEPS as UI_ZOOM_STEPS,
  DEFAULT_CHROMIUM as UI_DEFAULTS,
  sanitizeChromium as sanitizeFromUi,
  zoomLabel,
} from '../src/lib/chromium';
import { sanitizeState, updateSettings } from '../src/lib/store';
import { starterState } from '../src/lib/services';
import { ZOOM_STEPS } from '../src/lib/zoom';

describe('chromium profile defaults', () => {
  it('keeps every embedded page working out of the box', () => {
    expect(DEFAULT_CHROMIUM.javascript).toBe(true);
    expect(DEFAULT_CHROMIUM.images).toBe(true);
    expect(DEFAULT_CHROMIUM.webgl).toBe(true);
    // Existing behaviour: autoplay allowed and background apps unthrottled.
    expect(DEFAULT_CHROMIUM.autoplay).toBe(true);
    expect(DEFAULT_CHROMIUM.backgroundThrottling).toBe(false);
    expect(DEFAULT_CHROMIUM.colorScheme).toBe('system');
    expect(DEFAULT_CHROMIUM.defaultZoom).toBe(1);
  });

  it('starts a new workspace with those defaults', () => {
    expect(starterState().settings.chromium).toEqual(DEFAULT_CHROMIUM);
  });
});

describe('sanitizeChromium', () => {
  it('drops unknown fields and refuses wrong types', () => {
    const profile = sanitizeChromium({
      javascript: 'no',
      images: false,
      spellcheck: 0,
      colorScheme: 'neon',
      turboMode: true,
    });
    expect(profile.javascript).toBe(true);
    expect(profile.spellcheck).toBe(true);
    expect(profile.images).toBe(false);
    expect(profile.colorScheme).toBe('system');
    expect('turboMode' in profile).toBe(false);
  });

  it('falls back to defaults for a damaged value', () => {
    expect(sanitizeChromium(null)).toEqual(DEFAULT_CHROMIUM);
    expect(sanitizeChromium('nope')).toEqual(DEFAULT_CHROMIUM);
    expect(sanitizeChromium([])).toEqual(DEFAULT_CHROMIUM);
  });

  it('snaps zoom to a real browser step instead of trusting the file', () => {
    expect(snapZoom(1.3)).toBe(1.25);
    expect(snapZoom(5)).toBe(2);
    expect(snapZoom(0.1)).toBe(0.5);
    expect(snapZoom(0)).toBe(1);
    expect(snapZoom(Number.NaN)).toBe(1);
    expect(snapZoom('1.5')).toBe(1.5);
  });

  it('reads a profile out of a whole state document', () => {
    expect(chromiumFromState({ settings: { chromium: { spellcheck: false } } }).spellcheck).toBe(
      false,
    );
    expect(chromiumFromState({ settings: {} })).toEqual(DEFAULT_CHROMIUM);
    expect(chromiumFromState(null)).toEqual(DEFAULT_CHROMIUM);
  });
});

describe('chromiumWebPreferences', () => {
  it('maps every toggle onto the Chromium preference it names', () => {
    const preferences = chromiumWebPreferences({
      ...DEFAULT_CHROMIUM,
      javascript: false,
      images: false,
      webgl: false,
      pdfViewer: true,
      spellcheck: false,
      backgroundThrottling: true,
      autoplay: true,
      defaultZoom: 1.25,
    });
    expect(preferences).toEqual({
      javascript: false,
      images: false,
      webgl: false,
      plugins: true,
      spellcheck: false,
      backgroundThrottling: true,
      autoplayPolicy: 'no-user-gesture-required',
      zoomFactor: 1.25,
    });
  });

  it('requires a gesture only when autoplay is turned off', () => {
    expect(chromiumWebPreferences(DEFAULT_CHROMIUM).autoplayPolicy).toBe(
      'no-user-gesture-required',
    );
    expect(chromiumWebPreferences({ ...DEFAULT_CHROMIUM, autoplay: false }).autoplayPolicy).toBe(
      'document-user-activation-required',
    );
  });
});

describe('chromiumSwitches', () => {
  it('adds no switch for a default profile', () => {
    expect(chromiumSwitches(DEFAULT_CHROMIUM)).toEqual([]);
  });

  it('only disables smooth scrolling at launch', () => {
    expect(chromiumSwitches({ ...DEFAULT_CHROMIUM, smoothScrolling: false })).toEqual([
      { name: 'disable-smooth-scrolling' },
    ]);
    // Graphics acceleration is Electron API, not a switch, and page settings
    // belong to the guest rather than the whole process.
    expect(chromiumSwitches({ ...DEFAULT_CHROMIUM, hardwareAcceleration: false })).toEqual([]);
    expect(chromiumSwitches({ ...DEFAULT_CHROMIUM, images: false })).toEqual([]);
  });
});

describe('one shared contract', () => {
  it('exposes the same defaults and steps to the settings UI', () => {
    expect(UI_DEFAULTS).toEqual(DEFAULT_CHROMIUM);
    expect([...UI_ZOOM_STEPS]).toEqual([...CHROMIUM_ZOOM_STEPS]);
    expect([...CHROMIUM_ZOOM_STEPS]).toEqual([...ZOOM_STEPS]);
    expect(sanitizeFromUi({ javascript: false }).javascript).toBe(false);
    expect(zoomLabel(0.67)).toBe('67%');
  });
});

describe('persisted engine settings', () => {
  it('round-trips a valid profile through the state file', () => {
    const base = starterState();
    const state = sanitizeState({
      ...base,
      settings: {
        ...base.settings,
        chromium: { ...DEFAULT_CHROMIUM, javascript: false, defaultZoom: 1.5, colorScheme: 'dark' },
      },
    });
    expect(state.settings.chromium.javascript).toBe(false);
    expect(state.settings.chromium.defaultZoom).toBe(1.5);
    expect(state.settings.chromium.colorScheme).toBe('dark');
  });

  it('repairs a tampered profile on save', () => {
    const base = starterState();
    const state = sanitizeState({
      ...base,
      settings: { ...base.settings, chromium: { defaultZoom: 99, colorScheme: 'vaporwave' } },
    });
    expect(state.settings.chromium.defaultZoom).toBe(2);
    expect(state.settings.chromium.colorScheme).toBe('system');
    expect(state.settings.chromium.javascript).toBe(true);
  });

  it('clamps updates made through the settings panel', () => {
    const next = updateSettings(starterState(), {
      chromium: { ...DEFAULT_CHROMIUM, defaultZoom: 9 },
    });
    expect(next.settings.chromium.defaultZoom).toBe(2);
  });
});
