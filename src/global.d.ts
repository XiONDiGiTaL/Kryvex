import type { KryvexBridge } from './types';

declare global {
  interface Window {
    kryvex?: KryvexBridge;
  }

  /** Injected by Vite from package.json for builds without the desktop bridge. */
  const __APP_VERSION__: string;
}

export {};
