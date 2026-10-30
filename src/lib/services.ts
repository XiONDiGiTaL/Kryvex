import type { PersistedState, Service, ServiceCategory } from '../types';
import { BRAND_ICONS } from './brand-icons';
import { DEFAULT_CUSTOM_THEME } from './themes';
import { DEFAULT_CHROMIUM } from './chromium';
import { DEFAULT_ICE_SERVERS, DEFAULT_TRACKERS } from './party-rules';
import {
  DEFAULT_EMULATOR,
  DEFAULT_HOME,
  DEFAULT_LEXIUM,
  DEFAULT_DISK,
  DEFAULT_LINK,
  DEFAULT_WORKSPACE,
  DEFAULT_PLAYER,
  DEFAULT_RESOURCES,
  DEFAULT_SEARCH_REGION,
  DEFAULT_VPN,
} from './defaults';
import { DEFAULT_LIFECYCLE } from './lifecycle';
import { DEFAULT_TYPOGRAPHY } from './typography';
import { normalizeUrl } from './url';
import { normalizeHex } from './color';

/**
 * The catalogue's own grouping. Categories are labels on a service, never a
 * capability: the same website can be reached from any of them, and moving a
 * service between them changes nothing about its session.
 *
 * New families were added beside the original seven rather than replacing
 * them, so every stored category still resolves.
 */
export const CATEGORIES: ReadonlyArray<{ id: ServiceCategory; label: string }> = [
  { id: 'communication', label: 'Communication' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'development', label: 'Development' },
  { id: 'ai', label: 'AI' },
  { id: 'media', label: 'Media' },
  { id: 'news', label: 'News' },
  { id: 'education', label: 'Education' },
  { id: 'career', label: 'Career' },
  { id: 'finance', label: 'Finance' },
  { id: 'language', label: 'Language' },
  { id: 'design', label: 'Design' },
  { id: 'music', label: 'Music' },
  { id: 'utilities', label: 'Utilities' },
  { id: 'resources', label: 'Resources' },
  { id: 'other', label: 'Other' },
];

/**
 * The curated service palette.
 *
 * Twenty-one named tones in spectrum order, not eight shades with gaps. The
 * saturation and value steps are wide enough that red, orange and amber stay
 * apart at swatch size, and that a red-orange brand (Reddit) no longer has to
 * borrow a yellow. Existing profiles keep whatever they saved: the store
 * accepts any valid hex, so expanding this list never rewrites a colour.
 */
export const SERVICE_COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#F59E0B', // amber
  '#EAB308', // yellow
  '#84CC16', // lime
  '#22C55E', // green
  '#10B981', // emerald
  '#14B8A6', // teal
  '#06B6D4', // cyan
  '#38BDF8', // sky
  '#3B82F6', // blue
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#A855F7', // purple
  '#D946EF', // magenta
  '#EC4899', // pink
  '#FB7185', // rose
  '#92400E', // brown
  '#94A3B8', // neutral gray
  '#E2E8F0', // light neutral
  '#0F172A', // dark neutral
] as const;

/** The palette with a human name for each tone, used by the swatch tooltips. */
export const SERVICE_COLOR_OPTIONS: ReadonlyArray<{ id: string; label: string; hex: string }> = [
  { id: 'red', label: 'Red', hex: '#EF4444' },
  { id: 'orange', label: 'Orange', hex: '#F97316' },
  { id: 'amber', label: 'Amber', hex: '#F59E0B' },
  { id: 'yellow', label: 'Yellow', hex: '#EAB308' },
  { id: 'lime', label: 'Lime', hex: '#84CC16' },
  { id: 'green', label: 'Green', hex: '#22C55E' },
  { id: 'emerald', label: 'Emerald', hex: '#10B981' },
  { id: 'teal', label: 'Teal', hex: '#14B8A6' },
  { id: 'cyan', label: 'Cyan', hex: '#06B6D4' },
  { id: 'sky', label: 'Sky blue', hex: '#38BDF8' },
  { id: 'blue', label: 'Blue', hex: '#3B82F6' },
  { id: 'indigo', label: 'Indigo', hex: '#6366F1' },
  { id: 'violet', label: 'Violet', hex: '#8B5CF6' },
  { id: 'purple', label: 'Purple', hex: '#A855F7' },
  { id: 'magenta', label: 'Magenta', hex: '#D946EF' },
  { id: 'pink', label: 'Pink', hex: '#EC4899' },
  { id: 'rose', label: 'Rose', hex: '#FB7185' },
  { id: 'brown', label: 'Brown', hex: '#92400E' },
  { id: 'neutral', label: 'Neutral gray', hex: '#94A3B8' },
  { id: 'light', label: 'White / light neutral', hex: '#E2E8F0' },
  { id: 'dark', label: 'Black / dark neutral', hex: '#0F172A' },
];

/** The colour a new service starts on; unchanged across the palette expansion. */
export const DEFAULT_COLOR = '#38BDF8';

export function makeId(prefix = 's'): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`.toLowerCase();
}

export function partitionFor(serviceId: string): string {
  return `persist:svc-${serviceId}`.toLowerCase();
}

export function letterFor(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N}]/gu, '');
  return (cleaned.charAt(0) || 'K').toUpperCase();
}

/**
 * The live module set after opening `id`.
 *
 * Opening a module brings it to the front and keeps every module already in
 * the set. There used to be a hard cap of eight here, and the ninth open
 * module silently unmounted the oldest frame — which ends its guest without
 * anyone asking. A chat client keeps its session in page memory and writes it
 * while the page unloads, so that eviction came back as a fresh visit and, once
 * the in-memory token had been refreshed, as "please log in again". A module
 * now leaves the set only when the user closes it or a lifecycle policy stops
 * it; both of those flush the partition first.
 */
export function openModuleIds(current: readonly string[], id: string): string[] {
  return [id, ...current.filter(openId => openId !== id)];
}

export interface ServiceInput {
  name: string;
  url: string;
  category: ServiceCategory;
  color: string;
  pinned?: boolean;
  letter?: string;
  icon?: string;
  /** Silent until the user unmutes; useful for autoplaying feeds. */
  muted?: boolean;
  /** Permits a deliberate second copy of the same site (a second sign-in). */
  multipleInstances?: boolean;
}

export interface ServiceResult {
  ok: boolean;
  errors: Record<string, string>;
  service?: Service;
}

export function validateServiceInput(input: ServiceInput): ServiceResult {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  if (name.length < 2) errors.name = 'Use at least two characters.';
  if (name.length > 48) errors.name = 'Keep the name under 48 characters.';

  let url = '';
  try {
    url = normalizeUrl(input.url);
  } catch (error) {
    errors.url = error instanceof Error ? error.message : 'Enter a valid URL.';
  }

  if (!CATEGORIES.some(category => category.id === input.category)) {
    errors.category = 'Choose a category.';
  }
  // A palette tone or the user's own hex: both are stored the same way.
  const color = normalizeHex(input.color);
  if (!color) {
    errors.color = 'Choose a color from the palette, or pick your own.';
  }

  const letter = (input.letter?.trim() || letterFor(name)).slice(0, 2).toUpperCase();
  if (!/^[\p{L}\p{N}]{1,2}$/u.test(letter)) {
    errors.letter = 'The glyph can contain one or two letters or digits.';
  }
  const icon = input.icon && input.icon in BRAND_ICONS ? input.icon : undefined;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors,
    service: {
      id: makeId(),
      name,
      url,
      category: input.category,
      color: color as string,
      letter,
      pinned: Boolean(input.pinned),
      muted: input.muted === true,
      createdAt: Date.now(),
      ...(icon ? { icon: icon as Service['icon'] } : {}),
      ...(input.multipleInstances === true ? { multipleInstances: true as const } : {}),
    },
  };
}

/** The host a service points at, lowercased; `null` when the URL has none. */
export function serviceHost(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/** The installed service that already points at this site, if there is one. */
export function installedForUrl(
  services: readonly Service[],
  url: string,
): Service | undefined {
  const host = serviceHost(url);
  if (!host) return undefined;
  // Host equality, not substring: `mail.example.com` and `example.com` are two
  // different sites, and a preset re-picked from the catalogue always carries
  // the same host as the card it would duplicate.
  return services.find(service => serviceHost(service.url) === host);
}

export type ServicePlacement = { action: 'add' } | { action: 'reuse'; service: Service };

/**
 * What adding a service that points at `incoming.url` means.
 *
 * A site that is already installed is reused rather than added again: the same
 * page under two sidebar entries is one service in two places, which is exactly
 * what someone picking a catalogue preset from the Workspace used to get. A
 * second record is only what they asked for when either the new card or the
 * installed one says this site runs in several instances.
 */
export function resolveServicePlacement(
  services: readonly Service[],
  incoming: Pick<Service, 'url'> & { multipleInstances?: boolean },
): ServicePlacement {
  const existing = installedForUrl(services, incoming.url);
  if (!existing) return { action: 'add' };
  if (incoming.multipleInstances === true || existing.multipleInstances === true) {
    return { action: 'add' };
  }
  return { action: 'reuse', service: existing };
}

export function starterState(): PersistedState {
  const now = Date.now();
  const starters: Array<Omit<Service, 'id' | 'createdAt'>> = [
    {
      name: 'Sohbet',
      url: 'https://sohbet.xiondigital.net',
      category: 'communication',
      color: '#2DD4BF',
      letter: 'S',
      pinned: true,
    },
    {
      name: 'Gmail',
      url: 'https://mail.google.com',
      category: 'communication',
      color: '#FB7185',
      letter: 'G',
      pinned: true,
      icon: 'gmail',
    },
    {
      name: 'GitHub',
      url: 'https://github.com',
      category: 'development',
      color: '#94A3B8',
      letter: 'G',
      pinned: true,
      icon: 'github',
    },
    {
      name: 'Notion',
      url: 'https://www.notion.com',
      category: 'productivity',
      color: '#FBBF24',
      letter: 'N',
      pinned: false,
      icon: 'notion',
    },
    {
      name: 'YouTube',
      url: 'https://www.youtube.com',
      category: 'media',
      color: '#FB7185',
      letter: 'Y',
      pinned: false,
      icon: 'youtube',
    },
  ];

  return {
    version: 1,
    services: starters.map((service, index) => ({
      ...service,
      id: `s-starter-${index + 1}`,
      createdAt: now + index,
    })),
    bookmarks: [],
    history: [],
    settings: {
      themeId: 'kryvex-dark',
      themeGallerySeen: false,
      customTheme: { ...DEFAULT_CUSTOM_THEME },
      density: 'comfortable',
      startView: 'home',
      language: 'system',
      sidebarCollapsed: false,
      showStatusBar: true,
      searchEngine: 'duckduckgo',
      searchRegion: DEFAULT_SEARCH_REGION,
      confirmBeforeDelete: true,
      serviceNotifications: true,
      autoCheckUpdates: true,
      // Built-in tools are asked about on the Services page, once.
      secretServices: false,
      wallpaper: { enabled: false, source: 'gradient', fit: 'cover', veil: 55 },
      workspace: { ...DEFAULT_WORKSPACE },
      assistant: { provider: 'local', baseUrl: 'http://127.0.0.1:8080', model: '', migrated: true },
      chromium: { ...DEFAULT_CHROMIUM },
      party: {
        displayName: '',
        color: '#38BDF8',
        trackers: [...DEFAULT_TRACKERS],
        iceServers: [...DEFAULT_ICE_SERVERS],
        recentRooms: [],
      },
      home: { ...DEFAULT_HOME, notes: [] },
      resources: { ...DEFAULT_RESOURCES },
      vpn: { ...DEFAULT_VPN },
      emulator: { ...DEFAULT_EMULATOR },
      lexium: { ...DEFAULT_LEXIUM },
      player: { ...DEFAULT_PLAYER },
      disk: { ...DEFAULT_DISK },
      link: { ...DEFAULT_LINK },
      pinnedTools: [],
      lifecycle: { ...DEFAULT_LIFECYCLE, overrides: {} },
      typography: { ...DEFAULT_TYPOGRAPHY },
    },
    recent: [],
    browser: { tabs: [], activeTabId: null },
    feeds: [],
  };
}
