import type { KryvexBridge } from './types';

/**
 * The capture preview window's own bridge, exposed by
 * `electron/capture-window-preload.ts`. It is separate from the shell's: the page
 * can read what it is showing and act on it, and nothing else.
 */
export interface KryvexCaptureBridge {
  info: () => Promise<unknown>;
  save: () => Promise<unknown>;
  copy: () => Promise<boolean>;
  reveal: () => Promise<boolean>;
  pin: (enabled: boolean) => Promise<boolean>;
  fresh: () => Promise<boolean>;
  close: () => Promise<boolean>;
}

declare global {
  interface Window {
    kryvex?: KryvexBridge;
    kryvexCapture?: KryvexCaptureBridge;
  }

  /** Injected by Vite from package.json for builds without the desktop bridge. */
  const __APP_VERSION__: string;
}

export {};
