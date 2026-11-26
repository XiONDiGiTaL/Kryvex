import { canZoom, DEFAULT_ZOOM } from './zoom';

/**
 * What a right-click on a page offers.
 *
 * The engine reports the click: a selection, a link, an image, an editable
 * field, where the page can go. This module turns that report into the entries
 * the menu shows, so an entry exists only when the action it names can actually
 * run on that click — a page with nothing selected gets no Copy, a service
 * frame gets no "open in a new tab" because it has no tab to open. The Webview
 * maps the ids to handlers, which keeps these decisions testable without
 * Electron.
 */

export interface PageMenuContext {
  /** A Kryvex browser tab gets entries a service frame cannot offer. */
  browser: boolean;
  /** The page's own address; tabs, saving and the source view need one. */
  url: string;
  host: string;
  selection: string;
  linkUrl: string;
  imageUrl: string;
  isEditable: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  zoom: number;
}

/** An open service a link or the page itself can be handed to. */
export interface PageMenuTarget {
  id: string;
  name: string;
}

export interface PageMenuItem {
  /** The action the Webview runs; `send:<serviceId>` carries a destination. */
  id: string;
  /** English copy, translated where the menu is drawn. */
  label: string;
  /** A keyboard equivalent, shown right-aligned. Not copy: never translated. */
  hint?: string;
  disabled?: boolean;
  children?: PageMenuItem[];
  /** Set on the first entry of a group so the menu can draw its rule. */
  separatorBefore?: boolean;
}

/** The address shown in the menu's header, short enough for its column. */
export function pageMenuHeader(context: PageMenuContext): string {
  if (context.host) return context.host;
  const url = context.url.trim();
  if (url.length <= 46) return url;
  return `${url.slice(0, 45)}…`;
}

/**
 * The entries for one right-click, in the order a person expects them: text
 * first, then the thing that was under the pointer, then navigation, then the
 * page's own actions, zoom, and finally Send to Vexium.
 */
export function pageMenuEntries(
  context: PageMenuContext,
  targets: PageMenuTarget[] = [],
): PageMenuItem[] {
  const text = context.selection.trim();
  const link = context.linkUrl.trim();
  const image = context.imageUrl.trim();
  const page = context.url.trim();
  const zoom = Number.isFinite(context.zoom) && context.zoom > 0 ? context.zoom : DEFAULT_ZOOM;
  const groups: PageMenuItem[][] = [];
  const group = (items: PageMenuItem[]) => {
    if (items.length > 0) groups.push(items);
  };
  // One entry per installed service; the id carries the destination so a
  // submenu does not need a second lookup to know where it points.
  const send = (): PageMenuItem[] =>
    targets.map(target => ({ id: `send:${target.id}`, label: target.name }));

  // Text and fields.
  const editing: PageMenuItem[] = [];
  if (context.isEditable) {
    editing.push({ id: 'undo', label: 'Undo', hint: 'Ctrl+Z' });
    editing.push({ id: 'redo', label: 'Redo', hint: 'Ctrl+Y' });
  }
  if (text || context.isEditable) {
    // A field with nothing highlighted has nothing to copy or cut, and an entry
    // that would empty the clipboard is better greyed than removed: its place in
    // the group is what tells a person where the action lives.
    editing.push({ id: 'copy', label: 'Copy', hint: 'Ctrl+C', disabled: !text });
  }
  if (context.isEditable) {
    editing.push({ id: 'cut', label: 'Cut', hint: 'Ctrl+X', disabled: !text });
    editing.push({ id: 'paste', label: 'Paste', hint: 'Ctrl+V' });
    editing.push({
      id: 'paste-match',
      label: 'Paste and match style',
      hint: 'Ctrl+Shift+V',
    });
  }
  // Select all belongs to the document, not to a field: a highlighted paragraph
  // can be selected from too, and so can a page with nothing highlighted yet.
  if (page || context.isEditable) {
    editing.push({ id: 'select-all', label: 'Select all', hint: 'Ctrl+A' });
  }
  group(editing);

  // The link under the pointer.
  const onLink: PageMenuItem[] = [];
  if (link) {
    if (context.browser) onLink.push({ id: 'open-link-tab', label: 'Open link in a new tab' });
    onLink.push({ id: 'copy-link', label: 'Copy link address' });
    onLink.push({ id: 'open-link-external', label: 'Open link in my browser' });
    if (targets.length > 0) {
      onLink.push({ id: 'send-link-to', label: 'Send link to…', children: send() });
    }
  }
  group(onLink);

  // The image under the pointer.
  const onImage: PageMenuItem[] = [];
  if (image) {
    if (context.browser) onImage.push({ id: 'open-image-tab', label: 'Open image in a new tab' });
    // No shortcut is shown: Ctrl+S saves the page, not the picture under the
    // pointer, and a hint that presses the wrong thing is worse than none.
    onImage.push({ id: 'save-image', label: 'Save image as…' });
    onImage.push({ id: 'copy-image', label: 'Copy image' });
    onImage.push({ id: 'copy-image-address', label: 'Copy image address' });
  }
  group(onImage);

  // Where the page can go.
  const navigation: PageMenuItem[] = [
    { id: 'back', label: 'Back', hint: 'Alt+Left', disabled: !context.canGoBack },
    { id: 'forward', label: 'Forward', hint: 'Alt+Right', disabled: !context.canGoForward },
  ];
  navigation.push(
    context.loading
      ? { id: 'stop', label: 'Stop' }
      : { id: 'reload', label: 'Reload', hint: 'Ctrl+R' },
  );
  group(navigation);

  // The page itself.
  const pageActions: PageMenuItem[] = [];
  if (page) {
    pageActions.push({ id: 'copy-url', label: 'Copy page URL' });
    pageActions.push({ id: 'share-link', label: 'Share link' });
    pageActions.push({ id: 'save-page', label: 'Save page as…', hint: 'Ctrl+S' });
  }
  pageActions.push({ id: 'print', label: 'Print…', hint: 'Ctrl+P' });
  if (page) {
    pageActions.push({ id: 'screenshot', label: 'Take screenshot' });
    pageActions.push({ id: 'open-external', label: 'Open in my browser' });
    if (context.browser) {
      pageActions.push({ id: 'view-source', label: 'View page source', hint: 'Ctrl+U' });
    }
  }
  pageActions.push({ id: 'inspect', label: 'Inspect', hint: 'Ctrl+Shift+I' });
  group(pageActions);

  // Zoom, which only ever reports the steps Chromium itself uses.
  group([
    { id: 'zoom-in', label: 'Zoom in', hint: 'Ctrl++', disabled: !canZoom(zoom, 1) },
    { id: 'zoom-out', label: 'Zoom out', hint: 'Ctrl+-', disabled: !canZoom(zoom, -1) },
    { id: 'zoom-reset', label: 'Actual size', hint: 'Ctrl+0', disabled: Math.abs(zoom - 1) < 0.01 },
  ]);

  // Handing the page to an installed service.
  if (page && targets.length > 0) {
    group([{ id: 'send-page-to', label: 'Send page to…', children: send() }]);
  }

  // Send to Vexium, unchanged in meaning: the text that was clicked, or the page.
  const vexium: PageMenuItem[] = [];
  if (text) {
    vexium.push({ id: 'vexium-selection', label: 'Send selection to Vexium' });
    vexium.push({ id: 'vexium-selection-page', label: 'Send page and selection to Vexium' });
  }
  vexium.push({ id: 'vexium-page', label: 'Send the whole page to Vexium' });
  group(vexium);

  return groups.flatMap((items, index) =>
    items.map((item, at) => (index > 0 && at === 0 ? { ...item, separatorBefore: true } : item)),
  );
}

/**
 * The name a save dialog starts from for an image: its own file name, cleaned
 * of anything Windows would refuse. An inline image has no name of its own.
 */
export function imageSuggestedName(url: string): string {
  const address = url.trim();
  if (!address || address.startsWith('data:')) return 'image';
  let name = '';
  try {
    const parsed = new URL(address);
    name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '');
  } catch {
    return 'image';
  }
  const clean = name.replace(/[^\w.\- ]+/g, '-').trim();
  if (!clean) return 'image';
  return clean.length > 60 ? clean.slice(-60) : clean;
}
