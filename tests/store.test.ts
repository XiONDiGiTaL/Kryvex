import { describe, expect, it } from 'vitest';
import {
  addBookmark,
  addService,
  markOpened,
  newState,
  removeBookmark,
  removeService,
  sanitizeState,
  togglePin,
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
});

describe('operations', () => {
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
