import { describe, expect, it } from 'vitest';
import {
  SERVICE_DRAG_TYPE,
  isServiceDrag,
  readServiceDrag,
  requestServiceDropEffect,
  serviceDropEffect,
} from '../src/lib/service-drag';

/** The minimum of `DataTransfer` these helpers touch. */
function transfer(allowed: string) {
  const data = new Map<string, string>();
  return {
    effectAllowed: allowed,
    dropEffect: 'none',
    types: [] as string[],
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
  } as unknown as DataTransfer;
}

describe('the service drag payload', () => {
  it('uses one private type so a stray selection is not a service drag', () => {
    const dragged = transfer('copy');
    dragged.setData(SERVICE_DRAG_TYPE, 's-one');
    expect(isServiceDrag(dragged)).toBe(false);
    expect(Array.from(dragged.types)).toEqual([]);
    // The list the drop target really sees is readable through `types`.
    Object.defineProperty(dragged, 'types', { value: [SERVICE_DRAG_TYPE] });
    expect(isServiceDrag(dragged)).toBe(true);
    expect(readServiceDrag(dragged)).toBe('s-one');
  });

  it('refuses an absent transfer, an empty id and an oversized one', () => {
    expect(readServiceDrag(null)).toBeNull();
    expect(readServiceDrag(transfer('copy'))).toBeNull();
    const long = transfer('copy');
    long.setData(SERVICE_DRAG_TYPE, 'x'.repeat(121));
    expect(readServiceDrag(long)).toBeNull();
  });
});

describe('asking a drag source for a drop effect', () => {
  it('asks for the copy a service drop means when the source offers it', () => {
    expect(serviceDropEffect('copy')).toBe('copy');
    expect(serviceDropEffect('copyMove')).toBe('copy');
    expect(serviceDropEffect('copyLink')).toBe('copy');
    expect(serviceDropEffect('all')).toBe('copy');
    // A draggable element that never set `effectAllowed` offers everything.
    expect(serviceDropEffect('uninitialized')).toBe('copy');
  });

  it('falls back to the move a move-only source allows', () => {
    // The pinned rail used to declare exactly this, and the canvas refused the
    // drop: Chromium finds no common operation and never dispatches the event.
    expect(serviceDropEffect('move')).toBe('move');
    expect(serviceDropEffect('linkMove')).toBe('move');
  });

  it('stays quiet when the source offers neither', () => {
    expect(serviceDropEffect('link')).toBeNull();
    expect(serviceDropEffect('none')).toBeNull();
    expect(serviceDropEffect('')).toBeNull();
    const source = transfer('link');
    requestServiceDropEffect(source);
    expect(source.dropEffect).toBe('none');
  });

  it('writes the effect only where the browser accepts it', () => {
    const source = transfer('copyMove');
    requestServiceDropEffect(source);
    expect(source.dropEffect).toBe('copy');
    requestServiceDropEffect(null);
  });
});
