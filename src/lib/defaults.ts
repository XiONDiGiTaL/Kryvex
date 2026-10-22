import type {
  EmulatorSettings,
  HomeSettings,
  ResourceSettings,
  SearchRegion,
  VpnSettings,
} from '../types';

export const DEFAULT_SEARCH_REGION: SearchRegion = 'global';

export const DEFAULT_HOME: HomeSettings = {
  showBoard: true,
  showWeather: true,
  showTasks: true,
  showGuide: true,
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
