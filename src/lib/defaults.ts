import type {
  DiskSettings,
  WorkspaceSettings,
  EmulatorSettings,
  HomeSettings,
  LexiumSettings,
  LinkSettings,
  PlayerSettings,
  ResourceSettings,
  SearchRegion,
  VpnSettings,
  WellnessSettings,
} from '../types';
import {
  DEFAULT_BEDTIME,
  DEFAULT_SLEEP_GOAL_MINUTES,
  DEFAULT_WATER_GOAL_ML,
} from './wellness';
import { HOME_WIDGET_DEFAULT_AREAS, HOME_WIDGET_DEFAULT_ORDER } from './home-widgets';
import { DEFAULT_SECTION_ORDER } from './home-sections';

export const DEFAULT_SEARCH_REGION: SearchRegion = 'global';

/** Nothing is asked until the heart icon is opened, so this is all defaults. */
export const DEFAULT_WELLNESS: WellnessSettings = {
  enabled: false,
  onboarded: false,
  profile: {
    units: 'metric',
    heightCm: null,
    weightKg: null,
    birthYear: null,
    sex: 'unspecified',
    activity: 'light',
    conditions: '',
  },
  days: [],
  waterGoalMl: DEFAULT_WATER_GOAL_ML,
  sleepGoalMinutes: DEFAULT_SLEEP_GOAL_MINUTES,
  bedtime: DEFAULT_BEDTIME,
  remindWater: false,
  remindSleep: false,
};

export const DEFAULT_HOME: HomeSettings = {
  showBoard: true,
  showWeather: true,
  // Sticky notes are an opt-in widget: the Notes button beside Wellness opens
  // it, and an existing file that says `true` keeps its saved choice.
  showTasks: false,
  showGuide: true,
  showWellness: false,
  // The calculator, the countdowns and the clock are opt-in like the notes: a
  // fresh board is the clock, the weather and the guide, not a wall of cards.
  showCalculator: false,
  showCurrency: true,
  showCapture: false,
  showCountdown: false,
  showClock: false,
  currencyFrom: 'USD',
  currencyTo: 'EUR',
  widgetOrder: [...HOME_WIDGET_DEFAULT_ORDER],
  widgetAreas: { ...HOME_WIDGET_DEFAULT_AREAS },
  sectionOrder: [...DEFAULT_SECTION_ORDER],
  wellness: DEFAULT_WELLNESS,
  city: '',
  place: '',
  latitude: null,
  longitude: null,
  unit: 'c',
  notes: [],
  countdowns: [],
  worldClocks: [],
  clockHour12: false,
  worldClockHour12: false,
  // The board clock starts free of its box: the boxed card is one of the three
  // looks, not the default.
  showBoardClock: true,
  clockStyle: 'bare',
  clockAccent: 'theme',
  clockFont: 'default',
  clockScale: 100,
  clockAlign: 'left',
  screenCaptures: [],
  guideSeen: false,
};

export const DEFAULT_RESOURCES: ResourceSettings = {
  enabled: false,
  sidebar: true,
};

export const DEFAULT_VPN: VpnSettings = {
  enabled: false,
  binaryPath: '',
  configPath: '',
  extraArgs: '',
  dns: '',
  proxy: '',
  autoConnect: false,
};

export const DEFAULT_EMULATOR: EmulatorSettings = {
  system: 'nes',
  scale: 3,
  gamepad: true,
  crt: true,
};

/**
 * Lexium defaults point at the two local servers from its own setup guide: the
 * local-whisper app on 8000 and LibreTranslate on 5000. Nothing is contacted
 * until the user asks for a transcript or a translation.
 */
export const DEFAULT_LEXIUM: LexiumSettings = {
  engine: 'local-whisper',
  baseUrl: 'http://localhost:8000',
  model: 'base',
  language: 'auto',
  target: 'en',
  translateUrl: 'http://localhost:5000',
  apiKey: '',
  ocrLanguage: 'eng',
};

export const DEFAULT_PLAYER: PlayerSettings = {
  volume: 0.8,
  repeat: 'off',
  shuffle: false,
  // Page media starts at its own volume; only a change here overrides it.
  serviceVolume: 1,
  serviceRepeat: false,
  // Ad handling changes what a module does, so it starts off until asked.
  spotifyAdGuard: false,
  visualizer: 'bars',
  visualizerIntensity: 1,
};

export const DEFAULT_DISK: DiskSettings = {
  disclaimerAcceptedAt: 0,
};

/**
 * The phone companion starts switched off. It opens a listening socket on the
 * local network, so turning it on is the user's decision on the Link page, and
 * a profile that has never opened that page keeps no port.
 */
export const DEFAULT_LINK: LinkSettings = {
  enabled: false,
};

/**
 * A new window fades in rather than appearing whole, because a window that pops
 * into place reads as a glitch next to one that arrives. The motion is a choice
 * on the Workspace itself, and `none` is one of the choices.
 */
export const DEFAULT_WORKSPACE: WorkspaceSettings = {
  motion: 'subtle',
  motionSpeed: 1,
};
