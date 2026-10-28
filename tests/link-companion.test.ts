import { afterEach, describe, expect, it } from 'vitest';
import { clearToken, readName, readToken, writeName, writeToken } from '../src/companion/api';
import {
  COMPANION_STRINGS,
  makeCompanionStrings,
  pickCompanionLanguage,
} from '../src/companion/strings';

/**
 * The phone page keeps its pairing token and phone name in `localStorage`,
 * under keys that carry the product name. Those keys were corrected, and a
 * phone that paired before the correction must not be asked for a six-digit
 * code again: the older value is read once and moved onto the current key.
 *
 * The page is driven in a real browser by `pnpm verify:link`, which pairs
 * through the HTTP API and so never touches these keys. This file is what
 * covers the storage itself, with the browser's own `localStorage` stood in for.
 */

const TOKEN_KEY = 'kryvex-link-token';
const OLD_TOKEN_KEY = 'kyvex-link-token';
const NAME_KEY = 'kryvex-link-name';
const OLD_NAME_KEY = 'kyvex-link-name';

interface Stub {
  getItem(key: string): string | null;
  has(key: string): boolean;
}

/** Installs the stub the companion module will find as `localStorage`. */
function mount(initial: Record<string, string> = {}): Stub {
  const data = new Map<string, string>(Object.entries(initial));
  const storage = {
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key: string, value: string) => void data.set(key, String(value)),
    removeItem: (key: string) => void data.delete(key),
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = storage;
  return { getItem: storage.getItem, has: (key: string) => data.has(key) };
}

afterEach(() => {
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
});

describe('the companion keeps a pairing across the corrected key names', () => {
  it('reads a token stored under the current key', () => {
    mount({ [TOKEN_KEY]: 'current-secret' });
    expect(readToken()).toBe('current-secret');
  });

  it('moves a token stored under the older spelling forward', () => {
    const store = mount({ [OLD_TOKEN_KEY]: 'older-secret' });
    expect(readToken()).toBe('older-secret');
    // Moved, not copied: the old key is gone and the next read is the new one.
    expect(store.getItem(TOKEN_KEY)).toBe('older-secret');
    expect(store.has(OLD_TOKEN_KEY)).toBe(false);
    expect(readToken()).toBe('older-secret');
  });

  it('prefers the current key when both spellings hold a value', () => {
    const store = mount({ [TOKEN_KEY]: 'current-secret', [OLD_TOKEN_KEY]: 'stale-secret' });
    expect(readToken()).toBe('current-secret');
    // A phone that already moved forward keeps its old key untouched.
    expect(store.getItem(OLD_TOKEN_KEY)).toBe('stale-secret');
  });

  it('reads nothing from a phone that has never paired', () => {
    mount();
    expect(readToken()).toBe('');
  });

  it('clears both spellings when the phone unpairs', () => {
    const store = mount({ [TOKEN_KEY]: 'current-secret', [OLD_TOKEN_KEY]: 'stale-secret' });
    clearToken();
    expect(store.has(TOKEN_KEY)).toBe(false);
    expect(store.has(OLD_TOKEN_KEY)).toBe(false);
    expect(readToken()).toBe('');
  });

  it('moves the phone name forward', () => {
    const store = mount({ [OLD_NAME_KEY]: 'Izmir phone' });
    expect(readName('Phone')).toBe('Izmir phone');
    expect(store.getItem(NAME_KEY)).toBe('Izmir phone');
    expect(store.has(OLD_NAME_KEY)).toBe(false);
    expect(readName('Phone')).toBe('Izmir phone');
  });

  it('falls back for a missing or blank name', () => {
    mount();
    expect(readName('Phone')).toBe('Phone');
    mount({ [NAME_KEY]: '   ' });
    expect(readName('Phone')).toBe('Phone');
  });

  it('writes the current keys', () => {
    const store = mount();
    writeToken('fresh-secret');
    writeName('Kryvex phone');
    expect(store.getItem(TOKEN_KEY)).toBe('fresh-secret');
    expect(store.getItem(NAME_KEY)).toBe('Kryvex phone');
    expect(readToken()).toBe('fresh-secret');
    expect(readName('Phone')).toBe('Kryvex phone');
  });

  it('survives storage that refuses to be touched', () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => {
        throw new Error('private mode');
      },
      setItem: () => {
        throw new Error('private mode');
      },
      removeItem: () => {
        throw new Error('private mode');
      },
    };
    expect(readToken()).toBe('');
    expect(readName('Phone')).toBe('Phone');
    expect(() => writeToken('x')).not.toThrow();
    expect(() => clearToken()).not.toThrow();
  });
});

/**
 * The phone page has no language setting: it takes the phone's own locale once.
 * Turkish joins that table, and a language Kryvex does not ship must still land
 * on English rather than on the nearest prefix.
 */
describe('companion languages', () => {
  it.each([
    ['tr', 'tr'],
    ['tr-TR', 'tr'],
    ['TR-tr', 'tr'],
    ['es-419', 'es'],
    ['de-AT', 'de'],
    ['fr-CA', 'fr'],
    ['az-Latn', 'en'],
    ['en-GB', 'en'],
    ['', 'en'],
    [undefined, 'en'],
  ])('maps %s to %s', (tag, expected) => {
    expect(pickCompanionLanguage(tag as string | undefined)).toBe(expected);
  });

  it('carries a Turkish string for every key', () => {
    const missing = Object.entries(COMPANION_STRINGS)
      .filter(([, byLanguage]) => !(byLanguage as Record<string, string>).tr)
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it('reads as Turkish rather than English fallbacks', () => {
    const msg = makeCompanionStrings('tr');
    expect(msg('clipboard')).toBe('Pano');
    expect(msg('pairingCode')).toBe('Eşleştirme kodu');
    expect(msg('sendToDesktop')).toBe('Masaüstüne gönder');
    // A key the table does not carry still renders itself, never blank.
    expect(makeCompanionStrings('tr')('not a key' as never)).toBe('not a key');
  });
});
