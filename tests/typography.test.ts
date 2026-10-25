import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TYPOGRAPHY,
  MAX_TEXT_SCALE,
  MIN_TEXT_SCALE,
  TYPOGRAPHY_FONTS,
  fontStackFor,
  sanitizeTypography,
  scaledSize,
} from '../src/lib/typography';
import { starterState } from '../src/lib/services';
import { moveService, togglePin } from '../src/lib/store';

describe('typography', () => {
  it('keeps the default when the saved value is missing or nonsense', () => {
    expect(sanitizeTypography(undefined)).toEqual(DEFAULT_TYPOGRAPHY);
    expect(sanitizeTypography({ scale: 'big', font: 'comic' })).toEqual(DEFAULT_TYPOGRAPHY);
  });

  it('clamps the scale to the supported range', () => {
    expect(sanitizeTypography({ scale: 500 }).scale).toBe(MAX_TEXT_SCALE);
    expect(sanitizeTypography({ scale: 10 }).scale).toBe(MIN_TEXT_SCALE);
    expect(sanitizeTypography({ scale: 110.4 }).scale).toBe(110);
    expect(sanitizeTypography({ scale: 110, font: 'serif' })).toEqual({
      scale: 110,
      font: 'serif',
    });
  });

  it('scales the six size tokens in whole pixels', () => {
    expect(scaledSize(13, 100)).toBe(13);
    expect(scaledSize(13, 120)).toBe(16);
    expect(scaledSize(13, 90)).toBe(12);
    // Never smaller than the legibility floor, whatever the percentage.
    expect(scaledSize(4, MIN_TEXT_SCALE)).toBe(9);
  });

  it('offers only families that need no download', () => {
    expect(TYPOGRAPHY_FONTS.map(font => font.id)).toEqual([
      'default',
      'system',
      'humanist',
      'serif',
      'mono',
    ]);
    expect(fontStackFor('default')).toBe('');
    expect(fontStackFor('mono')).toContain('monospace');
  });
});

describe('pinned reorder', () => {
  const state = starterState();
  const pinned = state.services.slice(0, 3).map(service => ({ ...service, pinned: true }));
  const base = { ...state, services: pinned };

  it('moves a service in front of another', () => {
    const moved = moveService(base, pinned[2]!.id, pinned[0]!.id);
    expect(moved.services.map(service => service.id)).toEqual([
      pinned[2]!.id,
      pinned[0]!.id,
      pinned[1]!.id,
    ]);
  });

  it('moves a service to the end when there is no anchor', () => {
    const moved = moveService(base, pinned[0]!.id, null);
    expect(moved.services.map(service => service.id)).toEqual([
      pinned[1]!.id,
      pinned[2]!.id,
      pinned[0]!.id,
    ]);
  });

  it('is a no-op for an unknown id or a drop on itself', () => {
    expect(moveService(base, 'nope', pinned[0]!.id)).toBe(base);
    expect(moveService(base, pinned[0]!.id, pinned[0]!.id)).toBe(base);
  });

  it('does not change which services are pinned', () => {
    const moved = moveService(base, pinned[2]!.id, pinned[0]!.id);
    expect(moved.services.every(service => service.pinned)).toBe(true);
    const unpinned = togglePin(moved, pinned[0]!.id);
    expect(unpinned.services.filter(service => service.pinned)).toHaveLength(2);
  });
});
