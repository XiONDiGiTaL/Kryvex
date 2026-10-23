import type {
  DiskSettings,
  EmulatorSettings,
  HomeSettings,
  LexiumSettings,
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
  showTasks: true,
  showGuide: true,
  showWellness: false,
  wellness: DEFAULT_WELLNESS,
  city: '',
  place: '',
  latitude: null,
  longitude: null,
  unit: 'c',
  notes: [],
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
};

export const DEFAULT_DISK: DiskSettings = {
  disclaimerAcceptedAt: 0,
};
