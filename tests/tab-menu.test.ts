import { describe, expect, it } from 'vitest';
import {
  closeOthersIds,
  closeRightIds,
  orderTabs,
  tabMenuItems,
  type TabMenuContext,
} from '../src/lib/tab-menu';
import type { BrowserTab } from '../src/types';

function context(patch: Partial<TabMenuContext> = {}): TabMenuContext {
  return {
    hasPage: true,
    pinned: false,
    muted: false,
    hasOthers: true,
    hasRight: true,
    ...patch,
  };
}

const tab = (id: string, patch: Partial<BrowserTab> = {}): BrowserTab => ({
  id,
  url: `https://example.com/${id}`,
  title: id,
  ...patch,
});

const ids = (items: ReturnType<typeof tabMenuItems>) => items.map(item => item.id);

describe('tab strip menu', () => {
  it('offers duplicate, pin, mute and the three closes', () => {
    expect(ids(tabMenuItems(context()))).toEqual([
      'reload',
      'duplicate',
      'pin',
      'mute',
      'close',
      'close-others',
      'close-right',
    ]);
    expect(tabMenuItems(context())[0]).toMatchObject({ label: 'Reload', hint: 'Ctrl+R' });
    expect(tabMenuItems(context())[0]?.separatorBefore).toBeUndefined();
    expect(tabMenuItems(context()).filter(item => item.separatorBefore).length).toBe(2);
  });

  it('names the pin and mute entries for the state the tab is in', () => {
    const pinned = tabMenuItems(context({ pinned: true, muted: true }));
    expect(pinned.find(item => item.id === 'pin')?.label).toBe('Unpin tab');
    expect(pinned.find(item => item.id === 'mute')?.label).toBe('Unmute tab');
    const plain = tabMenuItems(context());
    expect(plain.find(item => item.id === 'pin')?.label).toBe('Pin tab');
    expect(plain.find(item => item.id === 'mute')?.label).toBe('Mute tab');
  });

  it('disables what the tab cannot do', () => {
    const empty = tabMenuItems(context({ hasPage: false, hasOthers: false, hasRight: false }));
    expect(empty.find(item => item.id === 'reload')?.disabled).toBe(true);
    expect(empty.find(item => item.id === 'duplicate')?.disabled).toBe(true);
    expect(empty.find(item => item.id === 'close-others')?.disabled).toBe(true);
    expect(empty.find(item => item.id === 'close-right')?.disabled).toBe(true);
    // Closing the tab itself always applies, and so do pin and mute.
    expect(empty.find(item => item.id === 'close')?.disabled).toBeUndefined();
    expect(empty.find(item => item.id === 'pin')?.disabled).toBeUndefined();
    expect(empty.find(item => item.id === 'mute')?.disabled).toBeUndefined();
  });

  it('keeps pinned tabs at the front, in the order they had', () => {
    const strip = [tab('a'), tab('b', { pinned: true }), tab('c'), tab('d', { pinned: true })];
    expect(orderTabs(strip).map(item => item.id)).toEqual(['b', 'd', 'a', 'c']);
    // Nothing pinned means the same array, untouched.
    const plain = [tab('a'), tab('b')];
    expect(orderTabs(plain)).toBe(plain);
    const all = [tab('a', { pinned: true }), tab('b', { pinned: true })];
    expect(orderTabs(all)).toBe(all);
  });

  it('closes others without touching this tab or a pinned one', () => {
    const strip = [tab('a'), tab('b'), tab('c', { pinned: true }), tab('d')];
    expect(closeOthersIds(strip, 'b')).toEqual(['a', 'd']);
  });

  it('closes only what sits to the right, and never a pinned tab', () => {
    const strip = [tab('a'), tab('b'), tab('c'), tab('d', { pinned: true }), tab('e')];
    expect(closeRightIds(strip, 'a')).toEqual(['b', 'c', 'e']);
    expect(closeRightIds(strip, 'e')).toEqual([]);
    expect(closeRightIds(strip, 'missing')).toEqual([]);
  });
});
