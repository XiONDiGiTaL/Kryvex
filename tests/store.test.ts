import { describe, expect, it } from 'vitest';
import {
  addBookmark,
  addFeeds,
  addHistory,
  addService,
  clearHistory,
  dropAnchor,
  markOpened,
  moveService,
  newState,
  removeBookmark,
  removeFeed,
  removeHistory,
  removeService,
  sanitizeHome,
  sanitizeState,
  togglePin,
  toggleToolPin,
  updateService,
  updateSettings,
} from '../src/lib/store';
import type { PersistedState, Service } from '../src/types';

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 's-test-1',
    name: 'Test',
    url: 'https://example.com',
    category: 'productivity',
    color: '#38BDF8',
    letter: 'T',
    pinned: false,
    createdAt: 1,
    ...overrides,
  };
}

describe('player settings', () => {
  it('gives page media a full volume when the saved state predates the field', () => {
    const state = sanitizeState({ settings: { player: { volume: 0.4, repeat: 'all' } } });
    expect(state.settings.player.volume).toBe(0.4);
    expect(state.settings.player.serviceVolume).toBe(1);
    expect(state.settings.player.serviceRepeat).toBe(false);
  });

  it('clamps a saved page volume and keeps an explicit loop', () => {
    const state = sanitizeState({
      settings: { player: { serviceVolume: 7, serviceRepeat: true } },
    });
    expect(state.settings.player.serviceVolume).toBe(1);
    expect(state.settings.player.serviceRepeat).toBe(true);
    expect(
      sanitizeState({ settings: { player: { serviceVolume: -1 } } }).settings.player.serviceVolume,
    ).toBe(0);
  });
});

describe('sanitizeState', () => {
  it('returns starters for missing or malformed data', () => {
    expect(sanitizeState(null).services.length).toBeGreaterThan(0);
    expect(sanitizeState('nope').services.length).toBeGreaterThan(0);
    expect(sanitizeState([]).settings.themeId).toBe('kryvex-dark');
  });

  it('drops services with unsafe ids, URLs or duplicate ids', () => {
    const state = sanitizeState({
      services: [
        makeService({ id: 's-a' }),
        makeService({ id: 's-a' }),
        makeService({ id: '../evil', name: 'Evil' }),
        makeService({ id: 's-b', url: 'javascript:alert(1)' }),
        makeService({ id: 's-c', name: '' }),
      ],
    });
    expect(state.services.map(service => service.id)).toEqual(['s-a']);
  });

  it('keeps the instance switch only when it was turned on', () => {
    // Off is the default and is stored as absence, so a profile saved before
    // the switch existed reads back single-instance rather than undefined-yet-true.
    const state = sanitizeState({
      services: [
        makeService({ id: 's-a' }),
        makeService({ id: 's-b', multipleInstances: true }),
        // A hand-edited profile can hold anything; only `true` turns it on.
        { ...makeService({ id: 's-c' }), multipleInstances: 'yes' },
      ],
    });
    expect(state.services.map(service => service.multipleInstances)).toEqual([
      undefined,
      true,
      undefined,
    ]);
  });

  it('keeps an unset weather location unset', () => {
    // Number(null) is 0: saving the board with no location must not pin the
    // user to Null Island and present its weather as local.
    expect(sanitizeHome({}).latitude).toBeNull();
    expect(sanitizeHome({ latitude: null, longitude: null }).latitude).toBeNull();
    expect(sanitizeHome({ latitude: '', longitude: '' }).longitude).toBeNull();
    expect(sanitizeHome({ latitude: '51.5', longitude: '-0.12' }).latitude).toBe(51.5);
    expect(sanitizeHome({ latitude: 0, longitude: 0 }).longitude).toBeNull();
  });

  it('turns the retired quick-capture inbox into sticky notes once', () => {
    // The inbox was a second note list; the card is the screen capture tool now.
    // Whatever was queued is carried over rather than dropped on the floor.
    const home = sanitizeHome({
      notes: [{ id: 'n1', text: 'Existing note', done: false, createdAt: 5 }],
      captures: [
        { id: 'c1', text: 'Screen capture this window.', kind: 'task', createdAt: 9 },
        { id: 'c2', text: 'Existing note', kind: 'task', createdAt: 10 },
        { id: 'c3', text: '   ', kind: 'task', createdAt: 11 },
      ],
    });
    expect(home.notes.map(note => note.text)).toEqual([
      'Existing note',
      'Screen capture this window.',
    ]);
    expect(home.notes.every(note => note.done === false)).toBe(true);
  });

  it('keeps saved captures and the 12/24-hour choice', () => {
    const home = sanitizeHome({
      clockHour12: true,
      screenCaptures: [
        {
          id: 'a',
          kind: 'clip',
          name: 'kryvex-gmail-20261026-091507.webm',
          path: 'C:\\Users\\xiond\\Downloads\\Kryvex Captures\\a.webm',
          bytes: 1024,
          width: 0,
          height: 0,
          target: 'Gmail',
          createdAt: 1,
        },
      ],
    });
    expect(home.clockHour12).toBe(true);
    expect(home.screenCaptures[0]?.kind).toBe('clip');
    expect(home.screenCaptures[0]?.path).toContain('Kryvex Captures');
    // Only an explicit true switches the clock; junk stays 24-hour.
    expect(sanitizeHome({ clockHour12: 'yes' }).clockHour12).toBe(false);
    expect(sanitizeHome({}).screenCaptures).toEqual([]);
  });

  it('splits the two clocks without losing the format a file was read in', () => {
    // One switch served both clocks before they were split, so a file that only
    // carries the old field keeps its world clock in the format it was read in.
    const legacy = sanitizeHome({ clockHour12: true });
    expect(legacy.clockHour12).toBe(true);
    expect(legacy.worldClockHour12).toBe(true);

    const split = sanitizeHome({ clockHour12: true, worldClockHour12: false });
    expect(split.clockHour12).toBe(true);
    expect(split.worldClockHour12).toBe(false);

    const fresh = sanitizeHome({});
    expect(fresh.clockHour12).toBe(false);
    expect(fresh.worldClockHour12).toBe(false);
  });

  it('keeps a saved Home section order and repairs a broken one', () => {
    expect(sanitizeHome({ sectionOrder: ['recent', 'startup', 'actions', 'launch'] }).sectionOrder)
      .toEqual(['recent', 'startup', 'actions', 'launch']);
    // An unknown block is dropped and anything missing is appended, so the page
    // is always drawn from a complete list.
    expect(sanitizeHome({ sectionOrder: ['launch', 'nope'] }).sectionOrder).toEqual([
      'launch',
      'actions',
      'recent',
      'startup',
    ]);
    expect(sanitizeHome({}).sectionOrder).toEqual(['actions', 'launch', 'recent', 'startup']);
  });

  it('heals the old 0,0 default that builds saved for an unset location', () => {
    expect(sanitizeHome({ city: '', place: '', latitude: 0, longitude: 0 }).latitude).toBeNull();
    // A named place keeps its coordinates, including one at the equator.
    expect(
      sanitizeHome({ city: 'Quito', place: 'Quito', latitude: 0, longitude: -78.5 }).latitude,
    ).toBe(0);
  });

  it('keeps an intentionally empty service list empty', () => {
    const state = sanitizeState({ services: [] });
    expect(state.services).toEqual([]);
  });

  it('repairs invalid settings and theme ids', () => {
    const state = sanitizeState({
      settings: { themeId: 'not-a-theme', density: 'tiny', searchEngine: 'altavista' },
    });
    expect(state.settings.themeId).toBe('kryvex-dark');
    expect(state.settings.density).toBe('comfortable');
    expect(state.settings.searchEngine).toBe('duckduckgo');
    // Notifications default to on, and an explicit opt-out survives a reload.
    expect(state.settings.serviceNotifications).toBe(true);
    expect(
      sanitizeState({ settings: { serviceNotifications: false } }).settings
        .serviceNotifications,
    ).toBe(false);
    // Update checks default to on, and an explicit opt-out survives a reload.
    expect(state.settings.autoCheckUpdates).toBe(true);
    expect(
      sanitizeState({ settings: { autoCheckUpdates: false } }).settings.autoCheckUpdates,
    ).toBe(false);
  });

  it('sanitises the saved custom theme without dropping the rest of settings', () => {
    const state = sanitizeState({
      settings: {
        themeId: 'custom',
        customTheme: {
          name: 'Mine',
          bg: '#112233',
          surface: '#223344',
          accent: 'not-a-colour',
          accentSoft: '#ABC',
          ink: '#FFFFFF',
        },
        density: 'compact',
      },
    });
    expect(state.settings.themeId).toBe('custom');
    expect(state.settings.density).toBe('compact');
    expect(state.settings.customTheme.name).toBe('Mine');
    expect(state.settings.customTheme.bg).toBe('#112233');
    expect(state.settings.customTheme.surface).toBe('#223344');
    expect(state.settings.customTheme.accent).toBe('#F97316');
    expect(state.settings.customTheme.accentSoft).toBe('#AABBCC');
    expect(state.settings.customTheme.ink).toBe('#FFFFFF');
  });

  it('accepts the AI and resource categories and rejects unknown ones', () => {
    const state = sanitizeState({
      services: [
        makeService({ id: 's-ai', category: 'ai' }),
        makeService({ id: 's-res', category: 'resources' }),
        makeService({ id: 's-bad', category: 'nonsense' as Service['category'] }),
      ],
    });
    expect(state.services.find(service => service.id === 's-ai')?.category).toBe('ai');
    expect(state.services.find(service => service.id === 's-res')?.category).toBe('resources');
    expect(state.services.find(service => service.id === 's-bad')?.category).toBe('other');
  });

  it('filters recents to known services and removes duplicates', () => {
    const state = sanitizeState({
      services: [makeService({ id: 's-a' }), makeService({ id: 's-b' })],
      recent: ['s-a', 's-a', 's-missing', 's-b'],
    });
    expect(state.recent).toEqual(['s-a', 's-b']);
  });

  it('caps bookmarks and requires http(s) URLs', () => {
    const state = sanitizeState({
      bookmarks: [
        { id: 'b-1', url: 'https://example.com', title: 'One', createdAt: 1 },
        { id: 'b-2', url: 'file:///etc/passwd', title: 'No', createdAt: 1 },
      ],
    });
    expect(state.bookmarks).toHaveLength(1);
    expect(state.bookmarks[0]?.url).toBe('https://example.com');
  });

  it('starts without a restored browser session', () => {
    expect(newState().browser).toEqual({ tabs: [], activeTabId: null });
  });

  it('restores browser tabs and repairs an invalid active tab', () => {
    const state = sanitizeState({
      browser: {
        tabs: [
          { id: 't-1', url: 'https://example.com', title: 'Example' },
          { id: 't-2', url: '', title: '' },
          { id: 't-2', url: 'https://example.org', title: 'Duplicate' },
          { id: 't-3', url: 'javascript:alert(1)', title: 'Bad' },
        ],
        activeTabId: 't-missing',
      },
    });
    expect(state.browser.tabs).toEqual([
      { id: 't-1', url: 'https://example.com', title: 'Example' },
      { id: 't-2', url: '', title: 'New tab' },
    ]);
    expect(state.browser.activeTabId).toBe('t-1');
  });

  it('never restores private tabs', () => {
    const state = sanitizeState({
      browser: {
        tabs: [
          { id: 't-1', url: 'https://example.com', title: 'Example', private: true },
          { id: 't-2', url: 'https://example.org', title: 'Ordinary' },
        ],
        activeTabId: 't-1',
      },
    });
    expect(state.browser.tabs).toEqual([
      { id: 't-2', url: 'https://example.org', title: 'Ordinary' },
    ]);
    expect(state.browser.activeTabId).toBe('t-2');
  });

  it('restores valid start-page feeds and drops the rest', () => {
    const state = sanitizeState({
      feeds: [
        { id: 'f-1', title: 'Example', url: 'https://example.com/rss', addedAt: 1 },
        { id: 'f-1', title: 'Duplicate', url: 'https://example.org/rss' },
        { id: 'f-2', title: 'Bad', url: 'javascript:alert(1)' },
      ],
    });
    expect(state.feeds).toEqual([
      { id: 'f-1', title: 'Example', url: 'https://example.com/rss', addedAt: 1 },
    ]);
  });

  it('caps restored browser tabs at twenty', () => {
    const tabs = Array.from({ length: 25 }, (_, index) => ({
      id: `t-${index}`,
      url: `https://example.com/${index}`,
      title: `Tab ${index}`,
    }));
    expect(sanitizeState({ browser: { tabs, activeTabId: 't-24' } }).browser.tabs).toHaveLength(
      20,
    );
  });

  it('sanitises history and drops unsafe, duplicate or non-http entries', () => {
    const state = sanitizeState({
      history: [
        { id: 'h-1', url: 'https://example.com', title: 'Example', visitedAt: 1 },
        { id: 'h-1', url: 'https://example.com/again', title: 'Duplicate id', visitedAt: 2 },
        { id: 'h-2', url: 'javascript:alert(1)', title: 'Bad', visitedAt: 3 },
        { id: 'h-3', url: 'https://example.org', title: '', visitedAt: 4 },
      ],
    });
    expect(state.history).toHaveLength(2);
    expect(state.history[0]?.id).toBe('h-1');
    expect(state.history[1]?.title).toBe('https://example.org');
  });
});

describe('built-in tools consent', () => {
  it('is asked for once and stays answered', () => {
    expect(sanitizeState(null).settings.secretServices).toBe(false);
    expect(sanitizeState({ settings: { secretServices: true } }).settings.secretServices).toBe(true);
    // A profile that already pins a built-in tool has answered this.
    expect(sanitizeState({ settings: { pinnedTools: ['lexium'] } }).settings.secretServices).toBe(
      true,
    );
    expect(sanitizeState({ settings: { pinnedTools: ['nonsense'] } }).settings.secretServices).toBe(
      false,
    );
  });
});

describe('Kryvex Link switch', () => {
  it('starts off and only an explicit true turns it on', () => {
    expect(sanitizeState(null).settings.link.enabled).toBe(false);
    expect(sanitizeState({ settings: { link: {} } }).settings.link.enabled).toBe(false);
    expect(sanitizeState({ settings: { link: { enabled: 'yes' } } }).settings.link.enabled).toBe(
      false,
    );
    expect(sanitizeState({ settings: { link: { enabled: true } } }).settings.link.enabled).toBe(
      true,
    );
  });

  it('accepts the companion as a built-in tool that can be pinned', () => {
    expect(sanitizeState({ settings: { pinnedTools: ['link'] } }).settings.pinnedTools).toEqual([
      'link',
    ]);
  });
});

describe('speech engine default', () => {
  it('gives a first run on a machine with an in-box engine no server to start', () => {
    const fresh = sanitizeState(null, { localSpeech: true });
    expect(fresh.settings.lexium.engine).toBe('windows-speech');
    expect(fresh.settings.lexium.baseUrl).toBe('');
    // The web client has no in-box engine, so it keeps the server default.
    expect(sanitizeState(null, { localSpeech: false }).settings.lexium.engine).toBe(
      'local-whisper',
    );
  });

  it('moves an existing stock profile once and then leaves it alone', () => {
    const stock = {
      settings: { lexium: { engine: 'local-whisper', baseUrl: 'http://localhost:8000' } },
    };
    const moved = sanitizeState(stock, { localSpeech: true });
    expect(moved.settings.lexium.engine).toBe('windows-speech');
    expect(moved.settings.lexium.migrated).toBe(true);
    const chosen = sanitizeState(
      { settings: { lexium: { engine: 'local-whisper', baseUrl: 'http://localhost:8000', migrated: true } } },
      { localSpeech: true },
    );
    expect(chosen.settings.lexium.engine).toBe('local-whisper');
    expect(chosen.settings.lexium.baseUrl).toBe('http://localhost:8000');
  });
});

describe('operations', () => {
  it('adds feeds by URL and removes them without touching the rest', () => {
    const base = newState();
    const added = addFeeds(base, [
      { id: 'f-1', title: 'One', url: 'https://example.com/rss', addedAt: 1 },
      { id: 'f-2', title: 'Two', url: 'https://example.org/rss', addedAt: 2 },
    ]);
    expect(added.feeds.map(feed => feed.id)).toEqual(['f-1', 'f-2']);
    expect(base.feeds).toEqual([]);

    const again = addFeeds(added, [
      { id: 'f-3', title: 'Same URL', url: 'https://example.com/rss', addedAt: 3 },
    ]);
    expect(again).toBe(added);

    const removed = removeFeed(added, 'f-1');
    expect(removed.feeds.map(feed => feed.id)).toEqual(['f-2']);
  });

  it('adds, updates and removes a service immutably', () => {
    const base = newState();
    const service = makeService({ id: 's-new' });
    const added = addService(base, service);
    expect(added.services).toHaveLength(base.services.length + 1);
    expect(base.services.some(item => item.id === 's-new')).toBe(false);

    const updated = updateService(added, { ...service, name: 'Renamed' });
    expect(updated.services.find(item => item.id === 's-new')?.name).toBe('Renamed');

    const removed = removeService(updated, 's-new');
    expect(removed.services.some(item => item.id === 's-new')).toBe(false);
  });

  it('does not add duplicate ids', () => {
    const base = newState();
    const service = makeService({ id: 's-new' });
    const once = addService(base, service);
    expect(addService(once, service)).toBe(once);
  });

  it('toggles pins only for known services', () => {
    const base = newState();
    const first = base.services[0] as Service;
    const toggled = togglePin(base, first.id);
    expect(toggled.services.find(item => item.id === first.id)?.pinned).toBe(!first.pinned);
    expect(togglePin(base, 'missing')).toBe(base);
  });

  it('pins built-in tools in the order they were added', () => {
    const base = newState();
    expect(base.settings.pinnedTools).toEqual([]);

    const lexium = toggleToolPin(base, 'lexium');
    expect(lexium.settings.pinnedTools).toEqual(['lexium']);

    const both = toggleToolPin(lexium, 'player');
    expect(both.settings.pinnedTools).toEqual(['lexium', 'player']);
    expect(toggleToolPin(both, 'lexium').settings.pinnedTools).toEqual(['player']);
  });

  it('drops unknown and duplicate pinned tools from a saved file', () => {
    const state = sanitizeState({
      settings: { pinnedTools: ['disk', 'disk', 'bogus', 42, 'lexium'] },
    });
    expect(state.settings.pinnedTools).toEqual(['disk', 'lexium']);
    expect(sanitizeState({ settings: {} }).settings.pinnedTools).toEqual([]);
  });

  it('tracks recents most-recent-first and caps the list', () => {
    let state: PersistedState = newState();
    const ids = state.services.map(service => service.id);
    for (const id of ids) state = markOpened(state, id);
    expect(state.recent[0]).toBe(ids[ids.length - 1]);
    expect(state.recent).toHaveLength(ids.length);
    expect(state.recent.filter(value => value === ids[0])).toHaveLength(1);
  });

  it('ignores opening an unknown service', () => {
    const base = newState();
    expect(markOpened(base, 'missing')).toBe(base);
  });

  it('adds, deduplicates, removes and clears browser history', () => {
    const base = newState();
    const entry = {
      id: 'h-1',
      url: 'https://example.com',
      title: 'Example',
      visitedAt: 1_000,
    };
    const once = addHistory(base, entry);
    expect(once.history).toHaveLength(1);
    expect(addHistory(once, { ...entry, id: 'h-2', visitedAt: 2_000 })).toBe(once);

    const second = addHistory(once, {
      id: 'h-3',
      url: 'https://example.org',
      title: 'Second',
      visitedAt: 20_000,
    });
    expect(second.history.map(item => item.id)).toEqual(['h-3', 'h-1']);
    expect(removeHistory(second, 'h-1').history.map(item => item.id)).toEqual(['h-3']);
    expect(clearHistory(second).history).toEqual([]);
  });

  it('deduplicates bookmarks by URL', () => {
    const base = newState();
    const bookmark = { id: 'b-1', url: 'https://example.com', title: 'Example', createdAt: 1 };
    const withOne = addBookmark(base, bookmark);
    expect(withOne.bookmarks).toHaveLength(1);
    expect(addBookmark(withOne, { ...bookmark, id: 'b-2' })).toBe(withOne);
    expect(removeBookmark(withOne, 'b-1').bookmarks).toHaveLength(0);
  });

  it('applies settings patches through validation', () => {
    const base = newState();
    const updated = updateSettings(base, { density: 'compact', sidebarCollapsed: true });
    expect(updated.settings.density).toBe('compact');
    expect(updated.settings.sidebarCollapsed).toBe(true);

    const rejected = updateSettings(base, {
      themeId: 'invalid',
      searchEngine: 'altavista' as 'google',
    });
    expect(rejected.settings.themeId).toBe('kryvex-dark');
    expect(rejected.settings.searchEngine).toBe('duckduckgo');
  });
});

/*
 * Pinned drag-and-drop. The regression these cover: the anchor used to be read
 * from the dragged row's own index, which turned every upward drag into "move
 * to the end" and every downward drag into "stay put".
 */
describe('pinned reordering', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];

  function drop(draggedId: string, targetId: string, after: boolean): string[] {
    const anchor = dropAnchor(order, draggedId, targetId, after);
    if (!anchor) throw new Error('the drop was rejected');
    const rest = order.filter(id => id !== draggedId);
    const to = anchor.beforeId === null ? rest.length : rest.indexOf(anchor.beforeId);
    return [...rest.slice(0, to), draggedId, ...rest.slice(to)];
  }

  it('moves a row up in front of the row it is dropped on', () => {
    expect(drop('e', 'b', false)).toEqual(['a', 'e', 'b', 'c', 'd']);
    expect(drop('d', 'a', false)).toEqual(['d', 'a', 'b', 'c', 'e']);
    expect(drop('b', 'a', false)).toEqual(['b', 'a', 'c', 'd', 'e']);
  });

  it('moves a row down past the row it is dropped on', () => {
    expect(drop('a', 'c', true)).toEqual(['b', 'c', 'a', 'd', 'e']);
    expect(drop('b', 'd', true)).toEqual(['a', 'c', 'd', 'b', 'e']);
    expect(drop('a', 'e', true)).toEqual(['b', 'c', 'd', 'e', 'a']);
  });

  it('leaves the order alone when a row is dropped where it already is', () => {
    expect(drop('b', 'a', true)).toEqual(order);
    expect(drop('b', 'c', false)).toEqual(order);
    expect(drop('a', 'e', true)).toEqual(['b', 'c', 'd', 'e', 'a']);
  });

  it('rejects a drop onto itself or a row that is gone', () => {
    expect(dropAnchor(order, 'c', 'c', false)).toBeNull();
    expect(dropAnchor(order, 'c', 'c', true)).toBeNull();
    expect(dropAnchor(order, 'c', 'zz', false)).toBeNull();
  });

  it('produces a beforeId moveService applies unchanged', () => {
    const ids = ['s-a', 's-b', 's-c'];
    const state: PersistedState = {
      ...newState(),
      services: ids.map((id, index) =>
        makeService({ id, name: id, pinned: true, createdAt: index }),
      ),
    };
    const pinned = state.services.filter(item => item.pinned).map(item => item.id);
    expect(pinned).toEqual(ids);

    const anchor = dropAnchor(pinned, 's-c', 's-a', false);
    expect(anchor).not.toBeNull();
    const moved = moveService(state, 's-c', anchor?.beforeId ?? null);
    expect(moved.services.map(item => item.id)).toEqual(['s-c', 's-a', 's-b']);
  });
});
