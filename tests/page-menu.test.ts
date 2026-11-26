import { describe, expect, it } from 'vitest';
import {
  pageMenuEntries,
  pageMenuHeader,
  type PageMenuContext,
  type PageMenuItem,
} from '../src/lib/page-menu';

function context(patch: Partial<PageMenuContext> = {}): PageMenuContext {
  return {
    browser: false,
    url: 'https://chat.example.com/room/7',
    host: 'chat.example.com',
    selection: '',
    linkUrl: '',
    imageUrl: '',
    isEditable: false,
    canGoBack: true,
    canGoForward: false,
    loading: false,
    zoom: 1,
    ...patch,
  };
}

const ids = (items: PageMenuItem[]) => items.map(item => item.id);
const find = (items: PageMenuItem[], id: string) => items.find(item => item.id === id);

describe('page right-click menu', () => {
  it('offers the page its own actions when nothing was clicked', () => {
    const items = pageMenuEntries(context());
    expect(ids(items)).toEqual([
      'back',
      'forward',
      'reload',
      'copy-url',
      'share-link',
      'save-page',
      'print',
      'screenshot',
      'open-external',
      'inspect',
      'zoom-in',
      'zoom-out',
      'zoom-reset',
      'vexium-page',
    ]);
    // No selection, no link, no image: those groups do not exist at all.
    expect(ids(items)).not.toContain('copy');
    expect(ids(items)).not.toContain('copy-link');
    expect(ids(items)).not.toContain('copy-image');
  });

  it('adds the text entries for a selection and keeps Vexium with them', () => {
    const items = pageMenuEntries(context({ selection: '  a quoted line  ' }));
    expect(ids(items).slice(0, 2)).toEqual(['copy', 'back']);
    expect(ids(items)).toContain('vexium-selection');
    expect(ids(items)).toContain('vexium-selection-page');
    expect(ids(items)).toContain('vexium-page');
  });

  it('gives an editable field the edit entries without a Vexium selection', () => {
    const items = pageMenuEntries(context({ isEditable: true }));
    expect(ids(items).slice(0, 6)).toEqual([
      'undo',
      'redo',
      'copy',
      'cut',
      'paste',
      'select-all',
    ]);
    expect(ids(items)).not.toContain('vexium-selection');
  });

  it('offers the link entries for a clicked link, in that order', () => {
    const items = pageMenuEntries(context({ linkUrl: 'https://example.com/a?b=1', browser: true }));
    expect(ids(items)).toContain('open-link-tab');
    expect(ids(items)).toContain('copy-link');
    expect(ids(items)).toContain('open-link-external');
    expect(ids(items).indexOf('open-link-tab')).toBeLessThan(ids(items).indexOf('copy-link'));
  });

  it('leaves tab-only entries out of a service frame', () => {
    const service = ids(
      pageMenuEntries(
        context({
          browser: false,
          url: 'https://www.instagram.com/',
          linkUrl: 'https://example.com/a',
          imageUrl: 'https://example.com/p.png',
        }),
      ),
    );
    expect(service).not.toContain('open-link-tab');
    expect(service).not.toContain('open-image-tab');
    expect(service).not.toContain('view-source');
    // The same click inside a browser tab does get them.
    const tab = ids(
      pageMenuEntries(
        context({
          browser: true,
          url: 'https://www.instagram.com/',
          linkUrl: 'https://example.com/a',
          imageUrl: 'https://example.com/p.png',
        }),
      ),
    );
    expect(tab).toContain('open-link-tab');
    expect(tab).toContain('open-image-tab');
    expect(tab).toContain('view-source');
  });

  it('offers copy image and its address for an image, and nothing for a video', () => {
    const image = ids(pageMenuEntries(context({ imageUrl: 'https://example.com/p.png' })));
    expect(image).toContain('copy-image');
    expect(image).toContain('copy-image-address');
    // `imageUrl` is only set for a mediaType of image, so a video click has none.
    expect(ids(pageMenuEntries(context()))).not.toContain('copy-image');
  });

  it('reports where the page can go and whether it is loading', () => {
    const fresh = pageMenuEntries(context({ canGoBack: false, canGoForward: false }));
    expect(find(fresh, 'back')?.disabled).toBe(true);
    expect(find(fresh, 'forward')?.disabled).toBe(true);
    expect(ids(fresh)).toContain('reload');
    expect(ids(fresh)).not.toContain('stop');

    const loading = pageMenuEntries(context({ loading: true }));
    expect(ids(loading)).toContain('stop');
    expect(ids(loading)).not.toContain('reload');
  });

  it('disables the zoom steps at the ends and actual size when already there', () => {
    const smallest = pageMenuEntries(context({ zoom: 0.5 }));
    expect(find(smallest, 'zoom-out')?.disabled).toBe(true);
    expect(find(smallest, 'zoom-in')?.disabled).toBe(false);

    const largest = pageMenuEntries(context({ zoom: 2 }));
    expect(find(largest, 'zoom-in')?.disabled).toBe(true);

    const normal = pageMenuEntries(context({ zoom: 1 }));
    expect(find(normal, 'zoom-reset')?.disabled).toBe(true);
    expect(find(pageMenuEntries(context({ zoom: 1.25 })), 'zoom-reset')?.disabled).toBe(false);
  });

  it('turns installed services into submenus that name the destination', () => {
    const targets = [
      { id: 's1', name: 'Discord' },
      { id: 's2', name: 'WhatsApp' },
    ];
    const items = pageMenuEntries(context({ linkUrl: 'https://example.com/a' }), targets);

    const linkMenu = find(items, 'send-link-to');
    expect(linkMenu?.children?.map(child => child.id)).toEqual(['send:s1', 'send:s2']);
    expect(linkMenu?.children?.map(child => child.label)).toEqual(['Discord', 'WhatsApp']);

    const pageMenu = find(items, 'send-page-to');
    expect(pageMenu?.children?.map(child => child.id)).toEqual(['send:s1', 'send:s2']);

    // With nothing installed there is no submenu to open.
    expect(ids(pageMenuEntries(context()))).not.toContain('send-page-to');
  });

  it('draws a rule only between groups, never above the first entry', () => {
    const items = pageMenuEntries(context({ selection: 'x', linkUrl: 'https://example.com/a' }));
    expect(items[0]?.separatorBefore).toBeUndefined();
    const ruled = items.filter(item => item.separatorBefore);
    expect(ruled.length).toBeGreaterThan(2);
    expect(ruled.length).toBeLessThan(items.length);
    // A rule sits on the first entry of a group, so it is never two in a row.
    for (let index = 1; index < items.length; index += 1) {
      expect(items[index]?.separatorBefore && items[index - 1]?.separatorBefore).toBeFalsy();
    }
  });

  it('shortens an address too long to read in the header', () => {
    expect(pageMenuHeader(context())).toBe('chat.example.com');
    const long = `https://example.com/${'segment/'.repeat(12)}`;
    const header = pageMenuHeader(context({ url: long, host: '' }));
    expect(header.length).toBeLessThanOrEqual(46);
    expect(header.endsWith('…')).toBe(true);
  });
});
