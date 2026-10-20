import type { Theme, ThemeFamily } from './themes';
import { THEME_FAMILIES } from './themes';

/**
 * Families shown in the gallery, in the same order as the periodic table.
 * `custom` is excluded: it is a generated palette, not a previewable family.
 */
export const GALLERY_FAMILIES: ThemeFamily[] = THEME_FAMILIES.filter(
  family => family !== 'custom',
);

/**
 * One representative theme per family: the one that shows the family at its
 * most obvious (a gold metal, a sapphire gem, a neon element). Unknown ids and
 * empty families fall back to the first theme the catalogue defines.
 */
export const GALLERY_HEROES: Partial<Record<ThemeFamily, string>> = {
  core: 'kryvex-dark',
  spectrum: 'violet',
  element: 'neon',
  metal: 'gold',
  gem: 'sapphire',
  planet: 'saturn',
  light: 'helium',
  terminal: 'terminal',
};

export interface GalleryGroup {
  family: ThemeFamily;
  hero: Theme;
  themes: Theme[];
}

/** Groups the catalogue by family for the gallery, skipping empty families. */
export function galleryGroups(themes: Theme[]): GalleryGroup[] {
  const groups: GalleryGroup[] = [];
  for (const family of GALLERY_FAMILIES) {
    const entries = themes.filter(theme => (theme.family ?? 'core') === family);
    const hero = entries.find(theme => theme.id === GALLERY_HEROES[family]) ?? entries[0];
    if (!hero) continue;
    groups.push({ family, hero, themes: entries });
  }
  return groups;
}

/** The family the gallery should open on for a given active theme. */
export function galleryFamilyFor(themes: Theme[], themeId: string): ThemeFamily {
  const active = themes.find(theme => theme.id === themeId);
  const family = (active?.family ?? 'core') as ThemeFamily;
  return GALLERY_FAMILIES.includes(family) ? family : 'core';
}

/**
 * The gallery introduces the theme system once. A state file written before
 * the gallery existed has no flag; treat that as "already seen" so an upgrade
 * does not interrupt an existing user with an onboarding sheet.
 */
export function themeGallerySeenValue(raw: unknown): boolean {
  return raw === undefined ? true : Boolean(raw);
}
