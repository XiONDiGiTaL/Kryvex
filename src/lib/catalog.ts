import type { ServiceCategory } from '../types';
import type { BrandIconKey } from './brand-icons';

export interface ServicePreset {
  id: string;
  name: string;
  url: string;
  category: ServiceCategory;
  color: string;
  icon: BrandIconKey;
  note: string;
}

/**
 * Web endpoints only. These are links, not integrations: each one opens in its
 * own hardened webview and session, exactly like a user-added service.
 */
export const SERVICE_PRESETS: ServicePreset[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    url: 'https://www.instagram.com',
    category: 'communication',
    color: '#FB7185',
    icon: 'instagram',
    note: 'Feed and DMs. Some flows may demand the system browser.',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    url: 'https://web.telegram.org/a/',
    category: 'communication',
    color: '#38BDF8',
    icon: 'telegram',
    note: 'Telegram Web A in its own persistent session.',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    url: 'https://web.whatsapp.com',
    category: 'communication',
    color: '#34D399',
    icon: 'whatsapp',
    note: 'Requires linking the phone once; the session is kept.',
  },
  {
    id: 'discord',
    name: 'Discord',
    url: 'https://discord.com/app',
    category: 'communication',
    color: '#A78BFA',
    icon: 'discord',
    note: 'Browser client with voice and channel support.',
  },
  {
    id: 'messenger',
    name: 'Messenger',
    url: 'https://www.messenger.com',
    category: 'communication',
    color: '#60A5FA',
    icon: 'messenger',
    note: 'Meta Messenger web client.',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    url: 'https://mail.google.com',
    category: 'communication',
    color: '#FB7185',
    icon: 'gmail',
    note: 'Full Gmail web app with its own login session.',
  },
  {
    id: 'github',
    name: 'GitHub',
    url: 'https://github.com',
    category: 'development',
    color: '#94A3B8',
    icon: 'github',
    note: 'Repositories, issues and pull requests.',
  },
  {
    id: 'linear',
    name: 'Linear',
    url: 'https://linear.app',
    category: 'productivity',
    color: '#A78BFA',
    icon: 'linear',
    note: 'Issue tracking and project cycles.',
  },
  {
    id: 'notion',
    name: 'Notion',
    url: 'https://www.notion.so',
    category: 'productivity',
    color: '#FBBF24',
    icon: 'notion',
    note: 'Docs, wikis and databases.',
  },
  {
    id: 'figma',
    name: 'Figma',
    url: 'https://www.figma.com',
    category: 'productivity',
    color: '#FB7185',
    icon: 'figma',
    note: 'Design files and comments. Some actions open externally.',
  },
  {
    id: 'trello',
    name: 'Trello',
    url: 'https://trello.com',
    category: 'productivity',
    color: '#38BDF8',
    icon: 'trello',
    note: 'Boards, lists and cards.',
  },
  {
    id: 'spotify',
    name: 'Spotify',
    url: 'https://open.spotify.com',
    category: 'media',
    color: '#34D399',
    icon: 'spotify',
    note: 'Web player. Playback needs a working DRM session.',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    url: 'https://www.youtube.com',
    category: 'media',
    color: '#FB7185',
    icon: 'youtube',
    note: 'Watch pages and subscriptions.',
  },
  {
    id: 'reddit',
    name: 'Reddit',
    url: 'https://www.reddit.com',
    category: 'media',
    color: '#FBBF24',
    icon: 'reddit',
    note: 'Feeds and comment threads.',
  },
  {
    id: 'x',
    name: 'X',
    url: 'https://x.com',
    category: 'communication',
    color: '#94A3B8',
    icon: 'x',
    note: 'Timeline and direct messages.',
  },
];

export function findPreset(id: string): ServicePreset | undefined {
  return SERVICE_PRESETS.find(preset => preset.id === id);
}
