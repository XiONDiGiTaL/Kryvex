import type { ServiceCategory } from '../types';
import type { BrandIconKey } from './brand-icons';

/**
 * What a service can actually do inside Kryvex.
 *
 * Every preset is a website: it opens a URL in its own hardened session, and
 * a page opened here can hand the user's selection or the whole visible page
 * to Vexium. Those three are declared explicitly instead of assumed, so a
 * future entry can add a capability without implying one it does not have.
 * Nothing in this list is a native integration: no preset talks to a site's
 * API, holds its tokens or acts on the user's account.
 */
export type ServiceCapability = 'open-url' | 'send-selection' | 'send-page';

/** Presets are website shortcuts; a native integration would be a new kind. */
export type ServiceIntegration = 'website';

export const PRESET_CAPABILITIES: readonly ServiceCapability[] = [
  'open-url',
  'send-selection',
  'send-page',
];

export const PRESET_INTEGRATION: ServiceIntegration = 'website';

export interface ServicePreset {
  id: string;
  name: string;
  url: string;
  category: ServiceCategory;
  color: string;
  /** Optional: unknown brands fall back to the site favicon, then a letter. */
  icon?: BrandIconKey;
  note: string;
  /** Start the module muted: feeds and autoplaying videos must not make noise. */
  muted?: boolean;
  /** Other names the same site is known by, for catalogue search. */
  aliases?: string[];
  /** Extra capabilities beyond the website baseline, when one is ever added. */
  capabilities?: ServiceCapability[];
  /** Defaults to `website`; declared for future non-website presets. */
  integration?: ServiceIntegration;
}

/** The declared capabilities of a preset, website baseline included. */
export function presetCapabilities(preset: ServicePreset): ServiceCapability[] {
  return [...PRESET_CAPABILITIES, ...(preset.capabilities ?? [])];
}

/** The integration kind of a preset; every shipped preset is a website. */
export function presetIntegration(preset: ServicePreset): ServiceIntegration {
  return preset.integration ?? PRESET_INTEGRATION;
}

/** The preset that points at a host, for duplicate detection in the catalogue. */
export function findPresetByHost(host: string): ServicePreset | undefined {
  const target = host.toLowerCase();
  return SERVICE_PRESETS.find(preset => {
    try {
      return new URL(preset.url).host.toLowerCase() === target;
    } catch {
      return false;
    }
  });
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
    color: '#6366F1',
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
    color: '#EF4444',
    icon: 'gmail',
    note: 'Full Gmail web app with its own login session.',
  },
  {
    id: 'github',
    name: 'GitHub',
    url: 'https://github.com',
    category: 'development',
    color: '#0F172A',
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
    color: '#0F172A',
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
    color: '#22C55E',
    icon: 'spotify',
    note: 'Web player. Playback needs a working DRM session.',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    url: 'https://www.youtube.com',
    category: 'media',
    color: '#EF4444',
    icon: 'youtube',
    note: 'Watch pages and subscriptions.',
  },
  {
    id: 'twitch',
    name: 'Twitch',
    url: 'https://www.twitch.tv',
    category: 'media',
    color: '#A855F7',
    icon: 'twitch',
    muted: true,
    note: 'Live channels in their own session. Starts muted so a stream never surprises you.',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    url: 'https://www.tiktok.com',
    category: 'media',
    color: '#2DD4BF',
    icon: 'tiktok',
    muted: true,
    note: 'Autoplaying feed. The module starts muted, and the header mute keeps it quiet while you browse.',
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    url: 'https://soundcloud.com',
    category: 'media',
    color: '#F97316',
    icon: 'soundcloud',
    note: 'Tracks, sets and your feed in a persistent session.',
  },
  {
    id: 'vimeo',
    name: 'Vimeo',
    url: 'https://vimeo.com',
    category: 'media',
    color: '#38BDF8',
    icon: 'vimeo',
    note: 'Videos and showcases without the recommendation feed.',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    url: 'https://www.facebook.com',
    category: 'communication',
    color: '#60A5FA',
    icon: 'facebook',
    muted: true,
    note: 'Feed and Messenger. Starts muted because the video feed autoplays.',
  },
  {
    id: 'reddit',
    name: 'Reddit',
    url: 'https://www.reddit.com',
    category: 'media',
    // Orange is its own tone now, so the brand no longer borrows a yellow.
    color: '#F97316',
    icon: 'reddit',
    note: 'Feeds and comment threads.',
  },
  {
    id: 'x',
    name: 'X',
    url: 'https://x.com',
    category: 'communication',
    color: '#0F172A',
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
    color: '#F97316',
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
    color: '#EAB308',
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
  {
    id: 'protonmail',
    name: 'Proton Mail',
    url: 'https://mail.proton.me',
    category: 'communication',
    color: '#A78BFA',
    note: 'Encrypted mail. Sign-in stays inside this module.',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    url: 'https://outlook.live.com/mail/',
    category: 'communication',
    color: '#38BDF8',
    note: 'Microsoft mail and calendar. Microsoft sign-in uses a real auth popup.',
  },
  {
    id: 'mailcom',
    name: 'mail.com',
    url: 'https://www.mail.com/mail/',
    category: 'communication',
    color: '#60A5FA',
    note: 'Mail.com webmail in its own persistent session.',
  },
  {
    id: 'mailinator',
    name: 'Mailinator',
    url: 'https://www.mailinator.com',
    category: 'communication',
    color: '#FBBF24',
    note: 'Disposable public inboxes: anyone who knows the name can read them, so never use one for anything private.',
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    url: 'https://www.wikipedia.org',
    category: 'resources',
    color: '#94A3B8',
    note: 'The free encyclopedia. Reading needs no account.',
  },
  {
    id: 'weathercom',
    name: 'Weather.com',
    url: 'https://weather.com',
    category: 'resources',
    color: '#38BDF8',
    note: 'Forecasts and radar. The Home board keeps its own keyless feed, so this card is for the full site.',
  },
  {
    id: 'amazon',
    name: 'Amazon',
    url: 'https://www.amazon.com',
    category: 'other',
    color: '#FBBF24',
    note: 'Storefront, lists and orders. Sign-in stays inside this module.',
  },
  {
    id: 'ebay',
    name: 'eBay',
    url: 'https://www.ebay.com',
    category: 'other',
    color: '#34D399',
    note: 'Listings, watchlist and orders in a persistent session.',
  },
  {
    id: 'temu',
    name: 'Temu',
    url: 'https://www.temu.com',
    category: 'other',
    color: '#FB7185',
    muted: true,
    note: 'Marketplace with an autoplaying feed. Starts muted so a page cannot make noise on its own.',
  },
  {
    id: 'aliexpress',
    name: 'AliExpress',
    url: 'https://www.aliexpress.com',
    category: 'other',
    color: '#FB7185',
    muted: true,
    note: 'Marketplace with heavy autoplay media. Starts muted.',
  },

  /* ------------------------------------------------- career and employment --- */
  {
    id: 'novoresume',
    name: 'Novorésumé',
    url: 'https://novoresume.com/',
    category: 'career',
    color: '#10B981',
    note: 'CV and cover-letter builder with ATS-friendly templates.',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    url: 'https://www.linkedin.com/',
    category: 'career',
    color: '#3B82F6',
    note: 'Professional network, job search and messages.',
  },
  {
    id: 'indeed',
    name: 'Indeed',
    url: 'https://www.indeed.com/',
    category: 'career',
    color: '#38BDF8',
    note: 'Job listings and applications. Sign-in stays in this module.',
  },
  {
    id: 'glassdoor',
    name: 'Glassdoor',
    url: 'https://www.glassdoor.com/',
    category: 'career',
    color: '#10B981',
    note: 'Company reviews, salaries and interview reports.',
  },

  /* ------------------------------------------- AI, audio and content tools --- */
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    url: 'https://elevenlabs.io/',
    category: 'ai',
    color: '#0F172A',
    muted: true,
    aliases: ['voice generation', 'text to speech'],
    note: 'Voice generation, speech synthesis and dubbing. Starts muted so a preview clip cannot surprise you.',
  },
  {
    id: 'suno',
    name: 'Suno',
    url: 'https://suno.com/',
    category: 'music',
    color: '#0F172A',
    muted: true,
    note: 'AI song generation. Starts muted because previews autoplay.',
  },
  {
    id: 'udio',
    name: 'Udio',
    url: 'https://www.udio.com/',
    category: 'music',
    color: '#8B5CF6',
    muted: true,
    note: 'AI music generation. Starts muted because previews autoplay.',
  },
  {
    id: 'canva',
    name: 'Canva',
    url: 'https://www.canva.com/',
    category: 'design',
    color: '#06B6D4',
    note: 'Design templates, presentations and social graphics.',
  },
  {
    id: 'adobeexpress',
    name: 'Adobe Express',
    url: 'https://www.adobe.com/express/',
    category: 'design',
    color: '#FB7185',
    note: 'Adobe’s browser editor for flyers, images and short videos.',
  },

  /* ---------------------------------------------- software and utilities --- */
  {
    id: 'ninite',
    name: 'Ninite',
    url: 'https://ninite.com/',
    category: 'utilities',
    color: '#22C55E',
    note: 'Bundle common Windows installers into one download; nothing installs until you run it.',
  },
  {
    id: 'xda',
    name: 'XDA Developers',
    url: 'https://www.xda-developers.com/',
    category: 'development',
    color: '#22C55E',
    aliases: ['xda forums'],
    note: 'Android, Windows and hardware news and guides.',
  },
  {
    id: 'sourceforge',
    name: 'SourceForge',
    url: 'https://sourceforge.net/',
    category: 'development',
    color: '#F97316',
    note: 'Open-source project hosting and downloads.',
  },
  {
    id: 'alternativeto',
    name: 'AlternativeTo',
    url: 'https://alternativeto.net/',
    category: 'utilities',
    color: '#38BDF8',
    aliases: ['alternative software'],
    note: 'Crowd-sourced alternatives to software you already know.',
  },
  {
    id: 'proton',
    name: 'Proton',
    url: 'https://proton.me/',
    category: 'utilities',
    color: '#8B5CF6',
    aliases: ['proton mail', 'proton vpn', 'proton drive'],
    note: 'Proton’s account hub: Mail, Drive, VPN and Calendar. Sign-in stays in this module.',
  },

  /* -------------------------------------------------- education and study --- */
  {
    id: 'alison',
    name: 'Alison',
    url: 'https://alison.com/',
    category: 'education',
    color: '#10B981',
    note: 'Free certificate courses across work and technology topics.',
  },
  {
    id: 'coursera',
    name: 'Coursera',
    url: 'https://www.coursera.org/',
    category: 'education',
    color: '#3B82F6',
    note: 'University and industry courses, with paid certificates.',
  },
  {
    id: 'edx',
    name: 'edX',
    url: 'https://www.edx.org/',
    category: 'education',
    color: '#FB7185',
    note: 'Courses from universities and companies; many can be audited free.',
  },
  {
    id: 'khanacademy',
    name: 'Khan Academy',
    url: 'https://www.khanacademy.org/',
    category: 'education',
    color: '#22C55E',
    note: 'Free maths, science and economics lessons with practice.',
  },
  {
    id: 'mitocw',
    name: 'MIT OpenCourseWare',
    url: 'https://ocw.mit.edu/',
    category: 'education',
    color: '#EF4444',
    aliases: ['ocw'],
    note: 'MIT course materials published free of charge.',
  },
  {
    id: 'freecodecamp',
    name: 'freeCodeCamp',
    url: 'https://www.freecodecamp.org/',
    category: 'education',
    color: '#0F172A',
    note: 'Free interactive web-development curriculum and certifications.',
  },

  /* ------------------------------------------------ language and exchange --- */
  {
    id: 'tandem',
    name: 'Tandem',
    url: 'https://www.tandem.net/',
    category: 'language',
    color: '#06B6D4',
    note: 'Language exchange with native speakers.',
  },
  {
    id: 'interpals',
    name: 'InterPals',
    url: 'https://www.interpals.net/',
    category: 'language',
    color: '#F59E0B',
    note: 'Pen-pal and language-exchange community. Public profiles; share carefully.',
  },
  {
    id: 'hellotalk',
    name: 'HelloTalk',
    url: 'https://www.hellotalk.com/',
    category: 'language',
    color: '#3B82F6',
    note: 'Chat-based language exchange with correction tools.',
  },
  {
    id: 'wordreference',
    name: 'WordReference',
    url: 'https://www.wordreference.com/',
    category: 'language',
    color: '#6366F1',
    note: 'Bilingual dictionaries and language forums.',
  },
  {
    id: 'reverso',
    name: 'Reverso',
    url: 'https://www.reverso.net/',
    category: 'language',
    color: '#F97316',
    note: 'Translation, conjugation and context examples.',
  },

  /* ------------------------------------------------ finance and crypto --- */
  {
    id: 'coinbase',
    name: 'Coinbase',
    url: 'https://www.coinbase.com/',
    category: 'finance',
    color: '#3B82F6',
    note: 'Exchange website only: Kryvex never asks for exchange credentials and cannot trade. Sign-in stays in this module.',
  },
  {
    id: 'kraken',
    name: 'Kraken',
    url: 'https://www.kraken.com/',
    category: 'finance',
    color: '#A855F7',
    note: 'Exchange website only: Kryvex never asks for exchange credentials and cannot trade.',
  },
  {
    id: 'binance',
    name: 'Binance',
    url: 'https://www.binance.com/',
    category: 'finance',
    color: '#EAB308',
    note: 'Exchange website only: Kryvex never asks for exchange credentials and cannot trade. Some regions block this host.',
  },
  {
    id: 'tradingview',
    name: 'TradingView',
    url: 'https://www.tradingview.com/',
    category: 'finance',
    color: '#38BDF8',
    note: 'Charts, indicators and public market ideas. A website, not a market feed inside Kryvex.',
  },
  {
    id: 'coingecko',
    name: 'CoinGecko',
    url: 'https://www.coingecko.com/',
    category: 'finance',
    color: '#10B981',
    note: 'Public cryptocurrency prices and market data. No account needed.',
  },
  {
    id: 'coinmarketcap',
    name: 'CoinMarketCap',
    url: 'https://coinmarketcap.com/',
    category: 'finance',
    color: '#06B6D4',
    note: 'Public cryptocurrency rankings and market data. No account needed.',
  },

  /* -------------------------------------------- social and publishing --- */
  {
    id: 'blogger',
    name: 'Blogger',
    url: 'https://www.blogger.com/',
    category: 'communication',
    color: '#F97316',
    aliases: ['blogspot'],
    note: 'Blogger’s dashboard; Blogspot-hosted blogs are part of the same service.',
  },
  {
    id: 'medium',
    name: 'Medium',
    url: 'https://medium.com/',
    category: 'communication',
    color: '#0F172A',
    note: 'Long-form posts and reading lists.',
  },
  {
    id: 'substack',
    name: 'Substack',
    url: 'https://substack.com/',
    category: 'communication',
    color: '#F97316',
    note: 'Newsletter publishing and subscriptions.',
  },
  {
    id: 'tumblr',
    name: 'Tumblr',
    url: 'https://www.tumblr.com/',
    category: 'communication',
    color: '#6366F1',
    note: 'Short-form blogging and reblogs.',
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    url: 'https://wordpress.com/',
    category: 'communication',
    color: '#3B82F6',
    note: 'WordPress.com sites, posts and the reader.',
  },

  /* ---------------------------------------------------------- news: US --- */
  {
    id: 'apnews',
    name: 'Associated Press',
    url: 'https://apnews.com/',
    category: 'news',
    color: '#F59E0B',
    aliases: ['ap'],
    note: 'US wire service reporting. A source, not an editorial endorsement.',
  },
  {
    id: 'reuters',
    name: 'Reuters',
    url: 'https://www.reuters.com/',
    category: 'news',
    color: '#F97316',
    note: 'International wire service reporting. A source, not an endorsement.',
  },
  {
    id: 'npr',
    name: 'NPR',
    url: 'https://www.npr.org/',
    category: 'news',
    color: '#EF4444',
    note: 'US public radio news and audio. A source, not an endorsement.',
  },
  {
    id: 'pbsnewshour',
    name: 'PBS NewsHour',
    url: 'https://www.pbs.org/newshour',
    category: 'news',
    color: '#6366F1',
    note: 'US public television news, including full episodes.',
  },
  {
    id: 'businessinsider',
    name: 'Business Insider',
    url: 'https://www.businessinsider.com/',
    category: 'news',
    color: '#38BDF8',
    aliases: ['insider'],
    note: 'US business and technology reporting. Some articles are metered.',
  },

  /* ---------------------------------------------------------- news: UK --- */
  {
    id: 'bbcnews',
    name: 'BBC News',
    url: 'https://www.bbc.com/news',
    category: 'news',
    color: '#EF4444',
    aliases: ['bbc'],
    note: 'UK public broadcaster’s news service, with world coverage.',
  },
  {
    id: 'guardian',
    name: 'The Guardian',
    url: 'https://www.theguardian.com/',
    category: 'news',
    color: '#6366F1',
    note: 'UK daily with international reporting and opinion.',
  },
  {
    id: 'skynews',
    name: 'Sky News',
    url: 'https://news.sky.com/',
    category: 'news',
    color: '#38BDF8',
    note: 'UK rolling news from Sky, with live video.',
  },
  {
    id: 'ft',
    name: 'Financial Times',
    url: 'https://www.ft.com/',
    category: 'news',
    color: '#FB7185',
    note: 'UK business and finance reporting. Most articles are metered.',
  },

  /* ------------------------------------------------------ news: Türkiye --- */
  {
    id: 'aa',
    name: 'Anadolu Agency',
    url: 'https://www.aa.com.tr/',
    category: 'news',
    color: '#EF4444',
    aliases: ['anadolu ajansı'],
    note: 'Turkish state-run wire service, publishing in several languages.',
  },
  {
    id: 'trtworld',
    name: 'TRT World',
    url: 'https://www.trtworld.com/',
    category: 'news',
    color: '#14B8A6',
    note: 'International English-language news from Türkiye’s public broadcaster.',
  },
  {
    id: 'dailysabah',
    name: 'Daily Sabah',
    url: 'https://www.dailysabah.com/',
    category: 'news',
    color: '#10B981',
    note: 'Turkish English-language daily.',
  },
  {
    id: 'hurriyet',
    name: 'Hürriyet',
    url: 'https://www.hurriyet.com.tr/',
    category: 'news',
    color: '#F97316',
    note: 'Turkish daily newspaper, published in Turkish.',
  },

  /* ------------------------------------------------------ news: Germany --- */
  {
    id: 'dw',
    name: 'DW',
    url: 'https://www.dw.com/',
    category: 'news',
    color: '#3B82F6',
    aliases: ['deutsche welle'],
    note: 'Germany’s international public broadcaster, in many languages.',
  },
  {
    id: 'spiegel',
    name: 'Der Spiegel',
    url: 'https://www.spiegel.de/',
    category: 'news',
    color: '#F59E0B',
    note: 'German weekly news magazine. Some articles are metered.',
  },
  {
    id: 'dpa',
    name: 'Deutsche Presse-Agentur',
    url: 'https://www.dpa.com/',
    category: 'news',
    color: '#94A3B8',
    aliases: ['dpa'],
    note: 'German wire service; the public site is mostly corporate information.',
  },

  /* ------------------------------------------------------- news: France --- */
  {
    id: 'france24',
    name: 'France 24',
    url: 'https://www.france24.com/',
    category: 'news',
    color: '#6366F1',
    note: 'French international news in French, English and other languages.',
  },
  {
    id: 'lemonde',
    name: 'Le Monde',
    url: 'https://www.lemonde.fr/',
    category: 'news',
    color: '#0F172A',
    note: 'French daily newspaper. Most articles are metered.',
  },

  /* -------------------------------------------------------- news: Spain --- */
  {
    id: 'elpais',
    name: 'El País',
    url: 'https://elpais.com/',
    category: 'news',
    color: '#38BDF8',
    note: 'Spanish daily newspaper, also published in English and Catalan.',
  },
  {
    id: 'rtve',
    name: 'RTVE',
    url: 'https://www.rtve.es/',
    category: 'news',
    color: '#14B8A6',
    note: 'Spain’s public broadcaster: news, radio and television.',
  },

  /* -------------------------------------------------------- news: Italy --- */
  {
    id: 'ansa',
    name: 'ANSA',
    url: 'https://www.ansa.it/',
    category: 'news',
    color: '#06B6D4',
    note: 'Italian national wire service.',
  },
  {
    id: 'rainews',
    name: 'Rai News',
    url: 'https://www.rainews.it/',
    category: 'news',
    color: '#3B82F6',
    note: 'News from Italy’s public broadcaster, with live video.',
  },

  /* ------------------------------------------------- news: international --- */
  {
    id: 'aljazeera',
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/',
    category: 'news',
    color: '#F59E0B',
    note: 'Qatar-based international news network, publishing in English and Arabic.',
  },
  {
    id: 'nhkworld',
    name: 'NHK World',
    url: 'https://www3.nhk.or.jp/nhkworld/',
    category: 'news',
    color: '#3B82F6',
    note: 'Japan’s public broadcaster in English and other languages.',
  },
  {
    id: 'scmp',
    name: 'South China Morning Post',
    url: 'https://www.scmp.com/',
    category: 'news',
    color: '#EAB308',
    aliases: ['scmp'],
    note: 'Hong Kong daily with regional coverage. Some articles are metered.',
  },
  {
    id: 'japantimes',
    name: 'The Japan Times',
    url: 'https://www.japantimes.co.jp/',
    category: 'news',
    color: '#FB7185',
    note: 'English-language Japanese daily. Some articles are metered.',
  },
  {
    id: 'thehindu',
    name: 'The Hindu',
    url: 'https://www.thehindu.com/',
    category: 'news',
    color: '#3B82F6',
    note: 'Indian daily newspaper, publishing in English.',
  },
  {
    id: 'straitstimes',
    name: 'The Straits Times',
    url: 'https://www.straitstimes.com/',
    category: 'news',
    color: '#EC4899',
    note: 'Singapore daily with regional reporting. Some articles are metered.',
  },

  /* ------------------------------------------------ storage and documents --- */
  {
    id: 'dropbox',
    name: 'Dropbox',
    url: 'https://www.dropbox.com/',
    category: 'productivity',
    color: '#3B82F6',
    note: 'Cloud files and shared folders. Sign-in stays in this module.',
  },
  {
    id: 'googledrive',
    name: 'Google Drive',
    url: 'https://drive.google.com/',
    category: 'productivity',
    color: '#F59E0B',
    note: 'Google’s file storage. Google sign-in uses a real auth popup.',
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    url: 'https://onedrive.live.com/',
    category: 'productivity',
    color: '#38BDF8',
    note: 'Microsoft cloud files. Microsoft sign-in uses a real auth popup.',
  },
  {
    id: 'mega',
    name: 'MEGA',
    url: 'https://mega.io/',
    category: 'productivity',
    color: '#EF4444',
    note: 'Encrypted cloud storage; the decryption key is held by the client, never by Kryvex.',
  },
  {
    id: 'googledocs',
    name: 'Google Docs',
    url: 'https://docs.google.com/',
    category: 'productivity',
    color: '#3B82F6',
    note: 'Documents, sheets and slides in the browser.',
  },
  {
    id: 'office',
    name: 'Microsoft 365',
    url: 'https://www.office.com/',
    category: 'productivity',
    color: '#F97316',
    aliases: ['office', 'word online', 'excel online'],
    note: 'Browser versions of Word, Excel and PowerPoint.',
  },

  /* ---------------------------------------------- projects and planning --- */
  {
    id: 'asana',
    name: 'Asana',
    url: 'https://asana.com/',
    category: 'productivity',
    color: '#FB7185',
    note: 'Tasks, projects and team timelines.',
  },
  {
    id: 'clickup',
    name: 'ClickUp',
    url: 'https://clickup.com/',
    category: 'productivity',
    color: '#A855F7',
    note: 'Tasks, docs and goals in one workspace.',
  },
  {
    id: 'miro',
    name: 'Miro',
    url: 'https://miro.com/',
    category: 'design',
    color: '#EAB308',
    note: 'Collaborative whiteboards and diagrams.',
  },
  {
    id: 'slack',
    name: 'Slack',
    url: 'https://app.slack.com/client',
    category: 'communication',
    color: '#A855F7',
    note: 'Team channels and direct messages in their own session.',
  },
  {
    id: 'zoom',
    name: 'Zoom',
    url: 'https://zoom.us/',
    category: 'communication',
    color: '#3B82F6',
    note: 'Meetings and webinars. The web client may still hand the call to the desktop app.',
  },

  /* ------------------------------------------------ development resources --- */
  {
    id: 'mdn',
    name: 'MDN Web Docs',
    url: 'https://developer.mozilla.org/',
    category: 'development',
    color: '#94A3B8',
    aliases: ['mozilla developer network'],
    note: 'Reference documentation for the web platform.',
  },
  {
    id: 'devdocs',
    name: 'DevDocs',
    url: 'https://devdocs.io/',
    category: 'development',
    color: '#64748B',
    note: 'Fast, combined API documentation for many languages and libraries.',
  },
  {
    id: 'stackoverflow',
    name: 'Stack Overflow',
    url: 'https://stackoverflow.com/',
    category: 'development',
    color: '#F59E0B',
    note: 'Programming questions and answers.',
  },
  {
    id: 'replit',
    name: 'Replit',
    url: 'https://replit.com/',
    category: 'development',
    color: '#F97316',
    note: 'Browser IDE and hosted runtimes.',
  },
  {
    id: 'codepen',
    name: 'CodePen',
    url: 'https://codepen.io/',
    category: 'development',
    color: '#0F172A',
    note: 'Front-end experiments and pens.',
  },

  /* ------------------------------------------------- design and imagery --- */
  {
    id: 'dribbble',
    name: 'Dribbble',
    url: 'https://dribbble.com/',
    category: 'design',
    color: '#EC4899',
    note: 'Design portfolios and visual inspiration.',
  },
  {
    id: 'behance',
    name: 'Behance',
    url: 'https://www.behance.net/',
    category: 'design',
    color: '#3B82F6',
    note: 'Adobe’s portfolio network for creative work.',
  },
  {
    id: 'unsplash',
    name: 'Unsplash',
    url: 'https://unsplash.com/',
    category: 'design',
    color: '#0F172A',
    note: 'Free photographs under the Unsplash licence.',
  },
  {
    id: 'photopea',
    name: 'Photopea',
    url: 'https://www.photopea.com/',
    category: 'design',
    color: '#14B8A6',
    note: 'Browser image editor that opens PSD files; runs locally in the page.',
  },

  /* -------------------------------------------------------- music and audio --- */
  {
    id: 'bandcamp',
    name: 'Bandcamp',
    url: 'https://bandcamp.com/',
    category: 'music',
    color: '#38BDF8',
    note: 'Independent music store and artist pages. Playback depends on the page’s own player.',
  },
  {
    id: 'splice',
    name: 'Splice',
    url: 'https://splice.com/',
    category: 'music',
    color: '#8B5CF6',
    note: 'Sample and loop library for music production.',
  },

  /* ------------------------------------------- research and reference --- */
  {
    id: 'scholar',
    name: 'Google Scholar',
    url: 'https://scholar.google.com/',
    category: 'resources',
    color: '#38BDF8',
    note: 'Scholarly literature search across publishers and repositories.',
  },
  {
    id: 'semanticscholar',
    name: 'Semantic Scholar',
    url: 'https://www.semanticscholar.org/',
    category: 'resources',
    color: '#3B82F6',
    note: 'AI-assisted academic search with citation context.',
  },
  {
    id: 'arxiv',
    name: 'arXiv',
    url: 'https://arxiv.org/',
    category: 'resources',
    color: '#EF4444',
    note: 'Open preprints in physics, maths, computing and more.',
  },
  {
    id: 'pubmed',
    name: 'PubMed',
    url: 'https://pubmed.ncbi.nlm.nih.gov/',
    category: 'resources',
    color: '#38BDF8',
    note: 'Biomedical literature index from the US National Library of Medicine.',
  },
  {
    id: 'gutenberg',
    name: 'Project Gutenberg',
    url: 'https://www.gutenberg.org/',
    category: 'resources',
    color: '#F59E0B',
    note: 'Public-domain books in several formats.',
  },
  {
    id: 'openlibrary',
    name: 'Open Library',
    url: 'https://openlibrary.org/',
    category: 'resources',
    color: '#22C55E',
    note: 'Internet Archive’s catalogue of books and borrowing.',
  },
  {
    id: 'dictionary',
    name: 'Dictionary.com',
    url: 'https://www.dictionary.com/',
    category: 'resources',
    color: '#6366F1',
    note: 'English definitions, thesaurus and usage.',
  },
  {
    id: 'etymonline',
    name: 'Online Etymology Dictionary',
    url: 'https://www.etymonline.com/',
    category: 'resources',
    color: '#F59E0B',
    note: 'Word origins and historical development.',
  },

  /* ------------------------------------------- productivity and travel --- */
  {
    id: 'todoist',
    name: 'Todoist',
    url: 'https://todoist.com/',
    category: 'productivity',
    color: '#EF4444',
    note: 'Tasks and projects across devices.',
  },
  {
    id: 'googlecalendar',
    name: 'Google Calendar',
    url: 'https://calendar.google.com/',
    category: 'productivity',
    color: '#3B82F6',
    note: 'Calendars and scheduling. Google sign-in uses a real auth popup.',
  },
  {
    id: 'skyscanner',
    name: 'Skyscanner',
    url: 'https://www.skyscanner.net/',
    category: 'other',
    color: '#38BDF8',
    note: 'Flight and travel search; bookings finish on the provider’s own site.',
  },
  {
    id: 'googleflights',
    name: 'Google Flights',
    url: 'https://www.google.com/travel/flights',
    category: 'other',
    color: '#3B82F6',
    note: 'Flight search and price tracking; bookings happen elsewhere.',
  },

  /* --------------------------------------------- utilities and privacy --- */
  {
    id: 'cloudconvert',
    name: 'CloudConvert',
    url: 'https://cloudconvert.com/',
    category: 'utilities',
    color: '#F59E0B',
    note: 'Online file conversion. Files are uploaded to CloudConvert, unlike Kryvex’s own File Forge.',
  },
  {
    id: 'squoosh',
    name: 'Squoosh',
    url: 'https://squoosh.app/',
    category: 'utilities',
    color: '#EC4899',
    note: 'Image compression that runs in the page; the image never leaves this machine.',
  },
  {
    id: 'bitwarden',
    name: 'Bitwarden',
    url: 'https://vault.bitwarden.com/',
    category: 'utilities',
    color: '#3B82F6',
    note: 'Password vault web app. Kryvex never reads, stores or autofills vault credentials; the master password stays in the page.',
  },
  {
    id: 'haveibeenpwned',
    name: 'Have I Been Pwned',
    url: 'https://haveibeenpwned.com/',
    category: 'utilities',
    color: '#EF4444',
    aliases: ['hibp', 'breach check'],
    note: 'Checks whether an email appears in known data breaches. The address you type goes to that site.',
  },
];

export function findPreset(id: string): ServicePreset | undefined {
  return SERVICE_PRESETS.find(preset => preset.id === id);
}
