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
  DEFAULT_PLAYER,
  DEFAULT_RESOURCES,
  DEFAULT_SEARCH_REGION,
  DEFAULT_VPN,
} from './defaults';
import { DEFAULT_LIFECYCLE } from './lifecycle';
import { normalizeUrl } from './url';

export const CATEGORIES: ReadonlyArray<{ id: ServiceCategory; label: string }> = [
  { id: 'communication', label: 'Communication' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'development', label: 'Development' },
  { id: 'ai', label: 'AI' },
  { id: 'resources', label: 'Resources' },
  { id: 'media', label: 'Media' },
  { id: 'other', label: 'Other' },
];

export const SERVICE_COLORS = [
  '#38BDF8',
  '#2DD4BF',
  '#A78BFA',
  '#FBBF24',
  '#FB7185',
  '#34D399',
  '#60A5FA',
  '#94A3B8',
] as const;

export const DEFAULT_COLOR = SERVICE_COLORS[0];

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
  if (!SERVICE_COLORS.includes(input.color as (typeof SERVICE_COLORS)[number])) {
    errors.color = 'Choose one of the palette colors.';
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
      color: input.color,
      letter,
      pinned: Boolean(input.pinned),
      muted: input.muted === true,
      createdAt: Date.now(),
      ...(icon ? { icon: icon as Service['icon'] } : {}),
    },
  };
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
      url: 'https://www.notion.so',
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
      wallpaper: { enabled: false, source: 'gradient', fit: 'cover', veil: 55 },
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
      lifecycle: { ...DEFAULT_LIFECYCLE, overrides: {} },
    },
    recent: [],
    browser: { tabs: [], activeTabId: null },
    feeds: [],
  };
}
