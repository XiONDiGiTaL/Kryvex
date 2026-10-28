import { describe, expect, it } from 'vitest';
import { BRAND_ICONS } from '../src/lib/brand-icons';
import { SERVICE_PRESETS } from '../src/lib/catalog';
import {
  CATEGORIES,
  SERVICE_COLORS,
  letterFor,
  makeId,
  installedForUrl,
  openModuleIds,
  partitionFor,
  resolveServicePlacement,
  serviceHost,
  starterState,
  validateServiceInput,
} from '../src/lib/services';
import type { Service } from '../src/types';

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

  /**
   * The live module set has no size limit. A cap here is not a memory detail:
   * the renderer unmounts the frame that left the set, which destroys its
   * guest, so dropping an id behind the user's back ends a running module.
   */
  it('keeps every open module when another one is opened', () => {
    const eight = Array.from({ length: 8 }, (_, index) => `s-${index + 1}`);
    const nine = openModuleIds(eight, 's-9');
    expect(nine).toHaveLength(9);
    expect(nine[0]).toBe('s-9');
    expect(nine).toEqual(expect.arrayContaining(eight));
  });

  it('brings a module that is already open to the front without duplicating it', () => {
    expect(openModuleIds(['s-1', 's-2', 's-3'], 's-2')).toEqual(['s-2', 's-1', 's-3']);
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

describe('service placement', () => {
  const installed = (over: Partial<Service> = {}): Service => ({
    id: 's-one',
    name: 'Messenger',
    url: 'https://www.messenger.com/',
    category: 'communication',
    color: SERVICE_COLORS[0],
    letter: 'M',
    pinned: true,
    createdAt: 1,
    ...over,
  });

  it('adds a site that is not installed yet', () => {
    expect(resolveServicePlacement([], { url: 'https://www.messenger.com/' })).toEqual({
      action: 'add',
    });
    expect(resolveServicePlacement([installed()], { url: 'https://mail.google.com' })).toEqual({
      action: 'add',
    });
  });

  it('reuses the record for a site that is already installed', () => {
    // The reported case: a preset picked again from the Workspace listed the
    // same service twice in the sidebar.
    const decision = resolveServicePlacement([installed()], {
      url: 'https://www.messenger.com',
    });
    expect(decision).toEqual({ action: 'reuse', service: installed() });
  });

  it('compares hosts, so a different subdomain is a different site', () => {
    expect(
      resolveServicePlacement([installed()], { url: 'https://mail.google.com' }).action,
    ).toBe('add');
    expect(
      resolveServicePlacement([installed({ url: 'https://mail.google.com' })], {
        url: 'https://www.messenger.com',
      }).action,
    ).toBe('add');
  });

  it('allows a second copy when either record asks for one', () => {
    expect(
      resolveServicePlacement([installed()], {
        url: 'https://www.messenger.com',
        multipleInstances: true,
      }).action,
    ).toBe('add');
    expect(
      resolveServicePlacement([installed({ multipleInstances: true })], {
        url: 'https://www.messenger.com',
      }).action,
    ).toBe('add');
  });

  it('reuses the record the user has had longest', () => {
    const older = installed({ id: 's-old', name: 'Messenger work' });
    const newer = installed({ id: 's-new', name: 'Messenger personal' });
    const decision = resolveServicePlacement([older, newer], {
      url: 'https://www.messenger.com',
    });
    expect(decision).toEqual({ action: 'reuse', service: older });
  });

  it('ignores a URL with no host rather than guessing', () => {
    expect(resolveServicePlacement([installed()], { url: 'not a url' })).toEqual({ action: 'add' });
    expect(installedForUrl([installed()], 'not a url')).toBeUndefined();
    expect(serviceHost('https://www.messenger.com/')).toBe('www.messenger.com');
  });

  it('carries the instance switch through validation', () => {
    const result = validateServiceInput({ ...valid, multipleInstances: true });
    expect(result.service?.multipleInstances).toBe(true);
    expect(validateServiceInput(valid).service?.multipleInstances).toBeUndefined();
  });
});
