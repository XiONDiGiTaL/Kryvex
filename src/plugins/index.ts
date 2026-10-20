import type { Theme } from '../lib/themes';
import { DONKEY_PLUGIN, SPECIAL_DONKEY_THEME } from './donkey';
import { SPECIAL_XION_THEME, XION_PLUGIN } from './xion';

export interface ThemePlugin {
  id: string;
  name: string;
  author: string;
  description: string;
  themeId: string;
  /** Brand colour of the plugin mark, independent of the active theme. */
  markColor: string;
  /** Confirmation shown when the plugin theme is applied. */
  activatedMessage: string;
  theme: Theme;
}

export const THEME_PLUGINS: ThemePlugin[] = [
  {
    ...DONKEY_PLUGIN,
    theme: SPECIAL_DONKEY_THEME,
  },
  {
    ...XION_PLUGIN,
    theme: SPECIAL_XION_THEME,
  },
];

export const PLUGIN_THEMES: Theme[] = THEME_PLUGINS.map(plugin => plugin.theme);
