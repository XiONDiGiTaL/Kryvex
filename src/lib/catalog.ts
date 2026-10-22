import type { ServiceCategory } from '../types';
import type { BrandIconKey } from './brand-icons';

export interface ServicePreset {
  id: string;
  name: string;
  url: string;
  category: ServiceCategory;
  color: string;
  /** Optional: unknown brands fall back to the site favicon, then a letter. */
  icon?: BrandIconKey;
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
    id: 'steam',
    name: 'Steam',
    url: 'https://steamcommunity.com/chat/',
    category: 'communication',
    color: '#60A5FA',
    icon: 'steam',
    note: 'Friends and group chat over the Steam web client. Sign in once with Steam Guard; Kryvex keeps the session signed in across restarts.',
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
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    category: 'ai',
    color: '#34D399',
    note: 'OpenAI chat. Sign-in stays inside this module.',
  },
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://claude.ai',
    category: 'ai',
    color: '#FB7185',
    icon: 'claude',
    note: 'Anthropic Claude in a persistent session.',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com',
    category: 'ai',
    color: '#A78BFA',
    icon: 'gemini',
    note: 'Google Gemini. Google sign-in uses a real auth popup.',
  },
  {
    id: 'copilot',
    name: 'Copilot',
    url: 'https://copilot.microsoft.com',
    category: 'ai',
    color: '#60A5FA',
    icon: 'copilot',
    note: 'Microsoft Copilot. Microsoft sign-in uses a real auth popup.',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    category: 'ai',
    color: '#2DD4BF',
    icon: 'perplexity',
    note: 'Answer engine with cited sources.',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    url: 'https://huggingface.co',
    category: 'ai',
    color: '#FBBF24',
    icon: 'huggingface',
    note: 'Models, datasets and Spaces.',
  },
  {
    id: 'freebuff',
    name: 'Freebuff',
    url: 'https://freebuff.com',
    category: 'ai',
    color: '#38BDF8',
    note: 'Coding agent workspace in its own tab.',
  },
  {
    id: 'fmhy',
    name: 'FMHY',
    url: 'https://fmhy.net',
    category: 'resources',
    color: '#94A3B8',
    note: 'Community-maintained index of free resources. External links only; Kryvex does not host or endorse their content.',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    url: 'https://ollama.com',
    category: 'resources',
    color: '#94A3B8',
    icon: 'ollama',
    note: 'Local model runtime and model library.',
  },
  {
    id: 'archive',
    name: 'Internet Archive',
    url: 'https://archive.org',
    category: 'resources',
    color: '#FBBF24',
    note: 'Public library of archived pages, audio and video.',
  },
];

export function findPreset(id: string): ServicePreset | undefined {
  return SERVICE_PRESETS.find(preset => preset.id === id);
}
