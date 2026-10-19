import type { Theme } from '../lib/themes';
import { DONKEY_PLUGIN, SPECIAL_DONKEY_THEME } from './donkey';

export interface ThemePlugin {
  id: string;
  name: string;
  author: string;
  description: string;
  themeId: string;
  theme: Theme;
}

export const THEME_PLUGINS: ThemePlugin[] = [
  {
    ...DONKEY_PLUGIN,
    theme: SPECIAL_DONKEY_THEME,
  },
];

export const PLUGIN_THEMES: Theme[] = THEME_PLUGINS.map(plugin => plugin.theme);
