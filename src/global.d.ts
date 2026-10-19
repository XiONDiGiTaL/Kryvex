import type { KryvexBridge } from './types';

declare global {
  interface Window {
    kryvex?: KryvexBridge;
  }
}

export {};
