import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SECTION_ORDER,
  HOME_SECTION_WIDTHS,
  normalizeSectionOrder,
  moveSection,
  rowWith,
} from '../src/lib/home-sections';

describe('Home section order', () => {
  it('starts from the default order', () => {
    expect(normalizeSectionOrder(undefined)).toEqual(DEFAULT_SECTION_ORDER);
    expect(normalizeSectionOrder([])).toEqual(DEFAULT_SECTION_ORDER);
  });

  it('keeps a saved order as the reader left it', () => {
    const saved = ['recent', 'startup', 'actions', 'launch'];
    expect(normalizeSectionOrder(saved)).toEqual(saved);
  });

  it('appends a section the file predates instead of dropping it', () => {
    // A file written before the order existed carries no list at all; a list
    // written by an older build is missing whatever was added since.
    expect(normalizeSectionOrder(['launch', 'actions'])).toEqual([
      'launch',
      'actions',
      'recent',
      'startup',
    ]);
  });

  it('refuses unknown blocks and duplicates', () => {
    expect(normalizeSectionOrder(['launch', 'bogus', 'launch', 7, 'actions'])).toEqual([
      'launch',
      'actions',
      'recent',
      'startup',
    ]);
  });

  it('moves a section one place and stops at the ends', () => {
    expect(moveSection(DEFAULT_SECTION_ORDER, 'launch', -1)).toEqual([
      'launch',
      'actions',
      'recent',
      'startup',
    ]);
    expect(moveSection(DEFAULT_SECTION_ORDER, 'actions', -1)).toEqual(DEFAULT_SECTION_ORDER);
    expect(moveSection(DEFAULT_SECTION_ORDER, 'startup', 1)).toEqual(DEFAULT_SECTION_ORDER);
    expect(moveSection(DEFAULT_SECTION_ORDER, 'recent', 1)).toEqual([
      'actions',
      'launch',
      'startup',
      'recent',
    ]);
  });

  it('never returns a list with a section missing', () => {
    const shuffled = moveSection(moveSection(DEFAULT_SECTION_ORDER, 'actions', 1), 'recent', -1);
    expect([...shuffled].sort()).toEqual([...DEFAULT_SECTION_ORDER].sort());
    expect(shuffled).toHaveLength(DEFAULT_SECTION_ORDER.length);
  });

  it('pairs two half-width blocks and leaves a full-width one alone', () => {
    expect(rowWith(DEFAULT_SECTION_ORDER, 0)).toEqual(['actions']);
    expect(rowWith(DEFAULT_SECTION_ORDER, 2)).toEqual(['recent', 'startup']);
    // A half-width block with a full-width block after it stands in its own row.
    const mixed = ['actions', 'recent', 'launch', 'startup'] as const;
    expect(rowWith([...mixed], 1)).toEqual(['recent']);
    expect(HOME_SECTION_WIDTHS.recent).toBe('half');
    expect(HOME_SECTION_WIDTHS.actions).toBe('full');
  });

  it('has nothing to draw past the end', () => {
    expect(rowWith(DEFAULT_SECTION_ORDER, 9)).toEqual([]);
  });
});
