import { describe, expect, it } from 'vitest';
import { chromeWebStoreExtensionId, chromeWebStoreTitle } from '../src/lib/chrome-store';

const ID = 'abcdefghijklmnopabcdefghijklmnop';

describe('chromeWebStoreExtensionId', () => {
  it('reads canonical detail URLs with a slug', () => {
    expect(chromeWebStoreExtensionId(`https://chromewebstore.google.com/detail/uBlock/${ID}`)).toBe(ID);
    expect(
      chromeWebStoreExtensionId(`https://chrome.google.com/webstore/detail/uBlock/${ID}?hl=en`),
    ).toBe(ID);
  });

  it('reads ID-only detail URLs', () => {
    expect(chromeWebStoreExtensionId(`https://chromewebstore.google.com/detail/${ID}`)).toBe(ID);
  });

  it('ignores unrelated paths and foreign hosts', () => {
    expect(chromeWebStoreExtensionId('https://chromewebstore.google.com/')).toBeNull();
    expect(chromeWebStoreExtensionId(`https://example.com/detail/${ID}`)).toBeNull();
    expect(chromeWebStoreExtensionId(`http://chromewebstore.google.com/detail/${ID}`)).toBeNull();
  });

  it('rejects malformed extension IDs', () => {
    expect(chromeWebStoreExtensionId('https://chromewebstore.google.com/detail/short')).toBeNull();
    expect(
      chromeWebStoreExtensionId('https://chromewebstore.google.com/detail/uBlock/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'),
    ).toBeNull();
  });
});

describe('chromeWebStoreTitle', () => {
  it('removes the store suffix from tab titles', () => {
    expect(chromeWebStoreTitle('uBlock Origin - Chrome Web Store')).toBe('uBlock Origin');
    expect(chromeWebStoreTitle('Kryvex')).toBe('Kryvex');
  });
});
