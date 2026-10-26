import { describe, expect, it } from 'vitest';
import { BRAND_ICONS } from '../src/lib/brand-icons';
import { SERVICE_PRESETS } from '../src/lib/catalog';
import {
  CATEGORIES,
  SERVICE_COLORS,
  letterFor,
  makeId,
  partitionFor,
  starterState,
  validateServiceInput,
} from '../src/lib/services';

const valid = {
  name: 'Linear',
  url: 'linear.app',
  category: 'productivity' as const,
  color: SERVICE_COLORS[0],
};

describe('validateServiceInput', () => {
  it('accepts a valid service and normalizes the URL', () => {
    const result = validateServiceInput(valid);
    expect(result.ok).toBe(true);
    expect(result.service?.url).toBe('https://linear.app');
    expect(result.service?.letter).toBe('L');
    expect(result.service?.pinned).toBe(false);
  });

  it('rejects short names', () => {
    const result = validateServiceInput({ ...valid, name: 'x' });
    expect(result.ok).toBe(false);
    expect(result.errors.name).toMatch(/two characters/i);
  });

  it('rejects invalid URLs', () => {
    const result = validateServiceInput({ ...valid, url: 'javascript:alert(1)' });
    expect(result.ok).toBe(false);
    expect(result.errors.url).toMatch(/http/i);
  });

  it('rejects colors outside the palette', () => {
    const result = validateServiceInput({ ...valid, color: '#ff0000' });
    expect(result.ok).toBe(false);
    expect(result.errors.color).toBeTruthy();
  });

  it('keeps a known brand icon and drops unknown ones', () => {
    const accepted = validateServiceInput({ ...valid, icon: 'linear' });
    expect(accepted.service?.icon).toBe('linear');
    const rejected = validateServiceInput({ ...valid, icon: 'not-a-brand' });
    expect(rejected.ok).toBe(true);
    expect(rejected.service?.icon).toBeUndefined();
  });

  it('rejects unknown categories', () => {
    const result = validateServiceInput({
      ...valid,
      category: 'gaming' as (typeof valid)['category'],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.category).toBeTruthy();
  });

  it('generates a safe partition identifier', () => {
    const result = validateServiceInput(valid);
    const id = result.service?.id ?? '';
    expect(id).toMatch(/^[a-z0-9-]{1,64}$/);
    expect(partitionFor(id)).toBe(`persist:svc-${id}`);
  });
});

describe('helpers', () => {
  it('derives one glyph per name', () => {
    expect(letterFor('Notion')).toBe('N');
    expect(letterFor(' 42 answers ')).toBe('4');
    expect(letterFor('***')).toBe('K');
  });

  it('creates unique ids with the requested prefix', () => {
    const a = makeId('b');
    const b = makeId('b');
    expect(a).not.toBe(b);
    expect(a.startsWith('b-')).toBe(true);
  });
});

describe('service catalogue', () => {
  it('offers presets with real brand marks and https endpoints', () => {
    expect(SERVICE_PRESETS.length).toBeGreaterThanOrEqual(12);
    for (const preset of SERVICE_PRESETS) {
      // A preset may omit a mark and fall back to the site favicon, but a
      // declared mark must always resolve to a bundled glyph.
      if (preset.icon) expect(preset.icon in BRAND_ICONS).toBe(true);
      expect(preset.url.startsWith('https://')).toBe(true);
      expect(preset.name.length).toBeGreaterThan(0);
    }
    expect(SERVICE_PRESETS.some(preset => preset.id === 'instagram')).toBe(true);
    expect(SERVICE_PRESETS.some(preset => preset.id === 'telegram')).toBe(true);
    expect(SERVICE_PRESETS.some(preset => preset.id === 'whatsapp')).toBe(true);
  });

  it('covers the messaging clients people expect to replace with a desktop app', () => {
    const ids = SERVICE_PRESETS.map(preset => preset.id);
    for (const id of ['discord', 'messenger', 'whatsapp', 'telegram', 'instagram', 'gmail']) {
      expect(ids).toContain(id);
    }
    // Every preset carries a category that the filter chips understand.
    for (const preset of SERVICE_PRESETS) {
      expect(CATEGORIES.some(category => category.id === preset.category)).toBe(true);
    }
  });

  it('ships Steam as a persistent chat module, not an external launcher', () => {
    const steam = SERVICE_PRESETS.find(preset => preset.id === 'steam');
    expect(steam).toBeTruthy();
    expect(steam?.url).toBe('https://steamcommunity.com/chat/');
    expect(steam?.category).toBe('communication');
    expect(steam?.icon).toBe('steam');
    expect(Boolean(steam?.icon && steam.icon in BRAND_ICONS)).toBe(true);
    // A preset becomes a normal service, so its sign-in lives in a persistent
    // partition that survives restarts instead of a throwaway browser session.
    const result = validateServiceInput({
      name: steam!.name,
      url: steam!.url,
      category: steam!.category,
      color: steam!.color,
      icon: steam!.icon,
    });
    expect(result.ok).toBe(true);
    expect(partitionFor(result.service!.id)).toMatch(/^persist:svc-/);
  });

  it('lists AI assistants as links, not bundled clients', () => {
    const ids = SERVICE_PRESETS.map(preset => preset.id);
    for (const id of ['chatgpt', 'claude', 'gemini', 'copilot', 'perplexity', 'fmhy']) {
      expect(ids).toContain(id);
    }
  });

  it('never ships research links as service presets', () => {
    const ids = SERVICE_PRESETS.map(preset => preset.id);
    expect(ids).not.toContain('awesome-electron');
    expect(ids).not.toContain('lmstudio');
  });
});

describe('starterState', () => {
  it('ships a valid, usable workspace', () => {
    const state = starterState();
    expect(state.services.length).toBeGreaterThanOrEqual(3);
    expect(state.services.every(service => service.url.startsWith('https://'))).toBe(true);
    expect(state.services.filter(service => service.pinned).length).toBeGreaterThan(0);
    expect(state.settings.themeId).toBe('kryvex-dark');
    expect(state.recent).toEqual([]);
    for (const service of state.services) {
      expect(service.id).toMatch(/^[a-z0-9-]{1,64}$/);
    }
  });

});

describe('catalogue additions', () => {
  it('offers the mail providers and marketplaces people add by hand', () => {
    const ids = SERVICE_PRESETS.map(preset => preset.id);
    for (const id of [
      'protonmail',
      'outlook',
      'mailcom',
      'mailinator',
      'wikipedia',
      'weathercom',
      'amazon',
      'ebay',
      'temu',
      'aliexpress',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('keeps every added preset honest about what it is', () => {
    const byId = (id: string) => SERVICE_PRESETS.find(preset => preset.id === id);
    // Public inboxes: the note has to say so, because the service cannot.
    expect(byId('mailinator')?.note).toContain('public');
    // A feed that autoplays must not start talking on its own.
    expect(byId('temu')?.muted).toBe(true);
    expect(byId('aliexpress')?.muted).toBe(true);
    expect(byId('amazon')?.muted).toBeUndefined();
    expect(byId('wikipedia')?.category).toBe('resources');
    expect(byId('amazon')?.category).toBe('other');
    // The catalogue has no duplicate ids.
    const ids = SERVICE_PRESETS.map(preset => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
