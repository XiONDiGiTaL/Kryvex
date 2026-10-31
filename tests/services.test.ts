import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND_ICONS } from '../src/lib/brand-icons';
import {
  SERVICE_PRESETS,
  findPresetByHost,
  presetCapabilities,
  presetIntegration,
} from '../src/lib/catalog';
import {
  CATEGORIES,
  SERVICE_COLORS,
  SERVICE_COLOR_OPTIONS,
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

  it('accepts a palette tone and the user’s own hex, and rejects garbage', () => {
    // A custom picker is part of the colour system, so a real hex is valid
    // even when it is not one of the curated tones.
    expect(validateServiceInput({ ...valid, color: '#ff0000' }).ok).toBe(true);
    expect(validateServiceInput({ ...valid, color: '#ff0000' }).service?.color).toBe('#FF0000');
    const rejected = validateServiceInput({ ...valid, color: 'chartreuse' });
    expect(rejected.ok).toBe(false);
    expect(rejected.errors.color).toBeTruthy();
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

describe('expanded catalogue', () => {
  it('ships a distinguishable palette with a true orange', () => {
    const colors = SERVICE_COLORS.map(color => color.toUpperCase());
    expect(colors.length).toBeGreaterThanOrEqual(21);
    expect(new Set(colors).size).toBe(colors.length);
    // Orange must be its own tone, not amber or red wearing another name.
    expect(colors).toContain('#F97316');
    expect(colors).toContain('#EF4444');
    expect(colors).toContain('#F59E0B');
    expect(colors).toContain('#0F172A');
    expect(colors).toContain('#E2E8F0');
    expect(colors).toContain('#92400E');
    expect(colors).toContain('#94A3B8');
    // The named swatches and the stored palette are the same list, so a new
    // tone cannot be added to one without the other.
    expect(SERVICE_COLOR_OPTIONS.map(option => option.hex)).toEqual([...SERVICE_COLORS]);
  });

  it('covers every new category with at least one preset', () => {
    for (const category of ['career', 'education', 'language', 'finance', 'travel', 'news', 'design', 'music', 'utilities'] as const) {
      expect(SERVICE_PRESETS.some(preset => preset.category === category)).toBe(true);
      expect(CATEGORIES.some(item => item.id === category)).toBe(true);
    }
  });

  it('carries the requested services with their real destinations', () => {
    const byId = new Map(SERVICE_PRESETS.map(preset => [preset.id, preset]));
    const expected: Array<[string, string]> = [
      ['novoresume', 'https://novoresume.com/'],
      ['linkedin', 'https://www.linkedin.com/'],
      ['indeed', 'https://www.indeed.com/'],
      ['glassdoor', 'https://www.glassdoor.com/'],
      ['elevenlabs', 'https://elevenlabs.io/'],
      ['suno', 'https://suno.com/'],
      ['udio', 'https://www.udio.com/'],
      ['canva', 'https://www.canva.com/'],
      ['adobeexpress', 'https://www.adobe.com/express/'],
      ['ninite', 'https://ninite.com/'],
      ['xda', 'https://www.xda-developers.com/'],
      ['sourceforge', 'https://sourceforge.net/'],
      ['alternativeto', 'https://alternativeto.net/'],
      ['proton', 'https://proton.me/'],
      ['alison', 'https://alison.com/'],
      ['coursera', 'https://www.coursera.org/'],
      ['edx', 'https://www.edx.org/'],
      ['khanacademy', 'https://www.khanacademy.org/'],
      ['mitocw', 'https://ocw.mit.edu/'],
      ['freecodecamp', 'https://www.freecodecamp.org/'],
      ['tandem', 'https://www.tandem.net/'],
      ['interpals', 'https://www.interpals.net/'],
      ['hellotalk', 'https://www.hellotalk.com/'],
      ['wordreference', 'https://www.wordreference.com/'],
      ['reverso', 'https://www.reverso.net/'],
      ['coinbase', 'https://www.coinbase.com/'],
      ['kraken', 'https://www.kraken.com/'],
      ['binance', 'https://www.binance.com/'],
      ['tradingview', 'https://www.tradingview.com/'],
      ['coingecko', 'https://www.coingecko.com/'],
      ['coinmarketcap', 'https://coinmarketcap.com/'],
      ['blogger', 'https://www.blogger.com/'],
      ['medium', 'https://medium.com/'],
      ['substack', 'https://substack.com/'],
      ['tumblr', 'https://www.tumblr.com/'],
      ['wordpress', 'https://wordpress.com/'],
      ['apnews', 'https://apnews.com/'],
      ['reuters', 'https://www.reuters.com/'],
      ['npr', 'https://www.npr.org/'],
      ['pbsnewshour', 'https://www.pbs.org/newshour'],
      ['businessinsider', 'https://www.businessinsider.com/'],
      ['bbcnews', 'https://www.bbc.com/news'],
      ['guardian', 'https://www.theguardian.com/'],
      ['skynews', 'https://news.sky.com/'],
      ['ft', 'https://www.ft.com/'],
      ['aa', 'https://www.aa.com.tr/'],
      ['trtworld', 'https://www.trtworld.com/'],
      ['dailysabah', 'https://www.dailysabah.com/'],
      ['hurriyet', 'https://www.hurriyet.com.tr/'],
      ['dw', 'https://www.dw.com/'],
      ['spiegel', 'https://www.spiegel.de/'],
      ['dpa', 'https://www.dpa.com/'],
      ['france24', 'https://www.france24.com/'],
      ['lemonde', 'https://www.lemonde.fr/'],
      ['elpais', 'https://elpais.com/'],
      ['rtve', 'https://www.rtve.es/'],
      ['ansa', 'https://www.ansa.it/'],
      ['rainews', 'https://www.rainews.it/'],
      ['aljazeera', 'https://www.aljazeera.com/'],
      ['nhkworld', 'https://www3.nhk.or.jp/nhkworld/'],
      ['scmp', 'https://www.scmp.com/'],
      ['japantimes', 'https://www.japantimes.co.jp/'],
      ['thehindu', 'https://www.thehindu.com/'],
      ['straitstimes', 'https://www.straitstimes.com/'],
    ];
    for (const [id, url] of expected) {
      const preset = byId.get(id);
      expect(preset, id).toBeTruthy();
      expect(preset?.url, id).toBe(url);
      expect(preset?.name.length, id).toBeGreaterThan(0);
      expect(preset?.note.length, id).toBeGreaterThan(0);
    }
  });

  it('covers flights, stays, cruises and ground transport with real destinations', () => {
    const byId = new Map(SERVICE_PRESETS.map(preset => [preset.id, preset]));
    const expected: Array<[string, string]> = [
      ['skyscanner', 'https://www.skyscanner.net/'],
      ['googleflights', 'https://www.google.com/travel/flights'],
      ['kayak', 'https://www.kayak.com/'],
      ['momondo', 'https://www.momondo.com/'],
      ['expedia', 'https://www.expedia.com/'],
      ['hopper', 'https://www.hopper.com/'],
      ['priceline', 'https://www.priceline.com/'],
      ['booking', 'https://www.booking.com/'],
      ['agoda', 'https://www.agoda.com/'],
      ['hotelscom', 'https://www.hotels.com/'],
      ['tripcom', 'https://www.trip.com/'],
      ['trivago', 'https://www.trivago.com/'],
      ['airbnb', 'https://www.airbnb.com/'],
      ['vrbo', 'https://www.vrbo.com/'],
      ['hostelworld', 'https://www.hostelworld.com/'],
      ['tripadvisor', 'https://www.tripadvisor.com/'],
      ['viator', 'https://www.viator.com/'],
      ['rome2rio', 'https://www.rome2rio.com/'],
      ['trainline', 'https://www.thetrainline.com/'],
      ['omio', 'https://www.omio.com/'],
      ['flixbus', 'https://global.flixbus.com/'],
      ['turo', 'https://turo.com/'],
      ['rentalcars', 'https://www.rentalcars.com/'],
      ['royalcaribbean', 'https://www.royalcaribbean.com/'],
      ['carnival', 'https://www.carnival.com/'],
      ['ncl', 'https://www.ncl.com/'],
      ['msc', 'https://www.msccruises.com/'],
      ['princess', 'https://www.princess.com/'],
      ['celebrity', 'https://www.celebritycruises.com/'],
      ['cruisecritic', 'https://www.cruisecritic.com/'],
      ['turkishairlines', 'https://www.turkishairlines.com/'],
      ['emirates', 'https://www.emirates.com/'],
      ['lufthansa', 'https://www.lufthansa.com/'],
      ['ryanair', 'https://www.ryanair.com/'],
      ['delta', 'https://www.delta.com/'],
      ['easyjet', 'https://www.easyjet.com/'],
      ['united', 'https://www.united.com/'],
      ['americanairlines', 'https://www.aa.com/'],
    ];
    for (const [id, url] of expected) {
      const preset = byId.get(id);
      expect(preset, id).toBeTruthy();
      expect(preset?.url, id).toBe(url);
      expect(preset?.category, id).toBe('travel');
    }
    // The two travel links that used to be filed under other now sit here.
    expect(byId.get('skyscanner')?.category).toBe('travel');
    expect(byId.get('googleflights')?.category).toBe('travel');
    // Cruises, rail, coaches and car hire are covered, not just flights.
    expect(SERVICE_PRESETS.filter(preset => preset.category === 'travel')).toHaveLength(
      expected.length,
    );
  });

  it('keeps preset ids and hosts unique and every entry a website', () => {
    const ids = SERVICE_PRESETS.map(preset => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    const hosts = SERVICE_PRESETS.map(preset => new URL(preset.url).host.toLowerCase());
    expect(new Set(hosts).size).toBe(hosts.length);
    expect(findPresetByHost('www.linkedin.com')?.id).toBe('linkedin');
    expect(findPresetByHost('not-a-host.invalid')).toBeUndefined();
    for (const preset of SERVICE_PRESETS) {
      expect(presetCapabilities(preset)).toEqual(
        expect.arrayContaining(['open-url', 'send-selection', 'send-page']),
      );
      expect(presetIntegration(preset)).toBe('website');
      expect(typeof preset.color).toBe('string');
      expect(preset.color).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('bundles a mark for every preset, so no tile needs a favicon', () => {
    for (const preset of SERVICE_PRESETS) {
      expect(preset.icon, preset.id).toBeTruthy();
      const brand = preset.icon ? BRAND_ICONS[preset.icon] : undefined;
      expect(brand, preset.id).toBeTruthy();
      // Exactly one source: a Simple Icons path or a bundled site image.
      expect(Boolean(brand?.path) !== Boolean(brand?.src), preset.id).toBe(true);
      if (brand?.src) {
        expect(existsSync(join(process.cwd(), 'public', brand.src)), preset.id).toBe(true);
      }
      // Only a bundled image can need the light backing plate.
      if (brand?.plate) expect(brand.src, preset.id).toBeTruthy();
    }
  });

  it('keeps Reddit orange rather than a borrowed yellow', () => {
    const reddit = SERVICE_PRESETS.find(preset => preset.id === 'reddit');
    expect(reddit?.color).toBe('#F97316');
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
