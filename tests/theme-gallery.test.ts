import { describe, expect, it } from 'vitest';
import {
  GALLERY_FAMILIES,
  GALLERY_HEROES,
  galleryFamilyFor,
  galleryGroups,
  themeGallerySeenValue,
} from '../src/lib/theme-gallery';
import { THEMES } from '../src/lib/themes';
import { newState, sanitizeState } from '../src/lib/store';

describe('theme gallery', () => {
  it('previews every catalogue family except the generated custom palette', () => {
    const groups = galleryGroups(THEMES);
    expect(groups.map(group => group.family)).toEqual([
      'core',
      'spectrum',
      'element',
      'metal',
      'gem',
      'planet',
      'light',
      'terminal',
    ]);
    expect(GALLERY_FAMILIES).not.toContain('custom');
  });

  it('shows the family hero and counts the whole family', () => {
    const groups = galleryGroups(THEMES);
    for (const group of groups) {
      expect(group.hero.family).toBe(group.family);
      expect(group.themes).toHaveLength(
        THEMES.filter(theme => (theme.family ?? 'core') === group.family).length,
      );
      const hero = GALLERY_HEROES[group.family];
      if (hero && group.themes.some(theme => theme.id === hero)) {
        expect(group.hero.id).toBe(hero);
      }
    }
    expect(groups.find(group => group.family === 'metal')?.hero.id).toBe('gold');
    expect(groups.find(group => group.family === 'terminal')?.themes).toHaveLength(1);
  });

  it('falls back to the first theme when a hero is missing', () => {
    const onlyLight = THEMES.filter(theme => theme.family === 'light').slice(1);
    expect(galleryGroups(onlyLight)[0]?.hero.id).toBe(onlyLight[0]?.id);
    expect(galleryGroups([])).toEqual([]);
  });

  it('opens on the active theme family and coerces the rest to core', () => {
    expect(galleryFamilyFor(THEMES, 'sapphire')).toBe('gem');
    expect(galleryFamilyFor(THEMES, 'sunburst')).toBe('spectrum');
    expect(galleryFamilyFor(THEMES, 'special-donkey')).toBe('core');
    expect(galleryFamilyFor(THEMES, 'custom')).toBe('core');
    expect(galleryFamilyFor(THEMES, 'not-a-theme')).toBe('core');
  });

  it('treats a state file written before the gallery as already seen', () => {
    expect(themeGallerySeenValue(undefined)).toBe(true);
    expect(themeGallerySeenValue(true)).toBe(true);
    expect(themeGallerySeenValue(false)).toBe(false);
    expect(themeGallerySeenValue('yes')).toBe(true);
  });
});

describe('first-run flag in the store', () => {
  it('starts unseen on a fresh install', () => {
    expect(newState().settings.themeGallerySeen).toBe(false);
  });

  it('does not interrupt an upgrade that predates the field', () => {
    const state = sanitizeState({
      settings: { themeId: 'neon' },
      services: [],
    });
    expect(state.settings.themeGallerySeen).toBe(true);
    expect(state.settings.themeId).toBe('neon');
  });

  it('keeps an explicit dismissal across a reload', () => {
    const state = sanitizeState({
      settings: { themeId: 'violet', themeGallerySeen: true },
      services: [],
    });
    expect(state.settings.themeGallerySeen).toBe(true);
  });
});
