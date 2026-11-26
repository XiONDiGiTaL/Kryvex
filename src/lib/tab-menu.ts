import type { BrowserTab } from '../types';
import type { PageMenuItem } from './page-menu';

/**
 * The Kryvex browser's tab-strip right-click menu.
 *
 * It is the page menu's smaller sibling: the same surface, the same keyboard
 * habits, but the entries are about the tab rather than the page inside it. The
 * decisions live here so they can be tested without a renderer, and the browser
 * view only maps an id to the action it already knows how to perform.
 */

export interface TabMenuContext {
  /** A tab that has not loaded a page has nothing to reload or duplicate. */
  hasPage: boolean;
  pinned: boolean;
  muted: boolean;
  /** Any other tab exists at all. */
  hasOthers: boolean;
  /** A tab sits to the right of this one, ignoring pinned ones. */
  hasRight: boolean;
}

/**
 * Pinned tabs sit at the front and keep the order they were pinned in. The
 * array is returned untouched when nothing is pinned, so a plain sort never
 * churns the strip.
 */
export function orderTabs<T extends { pinned?: boolean }>(tabs: T[]): T[] {
  const pinned = tabs.filter(tab => tab.pinned);
  if (pinned.length === 0 || pinned.length === tabs.length) return tabs;
  return [...pinned, ...tabs.filter(tab => !tab.pinned)];
}

/**
 * What "Close others" removes: everything but this tab — and never a pinned
 * tab, which is the point of pinning it.
 */
export function closeOthersIds(tabs: BrowserTab[], id: string): string[] {
  return tabs.filter(tab => tab.id !== id && !tab.pinned).map(tab => tab.id);
}

/**
 * What "Close tabs to the right" removes: the tabs after this one, pinned ones
 * excepted. An unknown id closes nothing rather than guessing.
 */
export function closeRightIds(tabs: BrowserTab[], id: string): string[] {
  const at = tabs.findIndex(tab => tab.id === id);
  if (at < 0) return [];
  return tabs
    .slice(at + 1)
    .filter(tab => !tab.pinned)
    .map(tab => tab.id);
}

/** The entries for one right-clicked tab. */
export function tabMenuItems(context: TabMenuContext): PageMenuItem[] {
  return [
    { id: 'reload', label: 'Reload', hint: 'Ctrl+R', disabled: !context.hasPage },
    { id: 'duplicate', label: 'Duplicate', disabled: !context.hasPage },
    {
      id: 'pin',
      label: context.pinned ? 'Unpin tab' : 'Pin tab',
      separatorBefore: true,
    },
    { id: 'mute', label: context.muted ? 'Unmute tab' : 'Mute tab' },
    { id: 'close', label: 'Close', hint: 'Ctrl+W', separatorBefore: true },
    { id: 'close-others', label: 'Close others', disabled: !context.hasOthers },
    {
      id: 'close-right',
      label: 'Close tabs to the right',
      disabled: !context.hasRight,
    },
  ];
}
