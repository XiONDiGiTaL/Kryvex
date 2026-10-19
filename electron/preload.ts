import { contextBridge, ipcRenderer } from 'electron';

/**
 * The only bridge between the sandboxed renderer and the main process. No
 * filesystem, no shell, no arbitrary IPC — just four narrow operations.
 */
const api = {
  platform: process.platform,
  loadState: (): Promise<unknown> => ipcRenderer.invoke('kryvex:state:load'),
  saveState: (state: unknown): Promise<boolean> => ipcRenderer.invoke('kryvex:state:save', state),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('kryvex:open-external', url),
  appInfo: (): Promise<{
    version: string;
    platform: string;
    electron: string;
    chrome: string;
    node: string;
    packaged: boolean;
  }> => ipcRenderer.invoke('kryvex:app:info'),
};

contextBridge.exposeInMainWorld('kryvex', api);

export type KryvexBridge = typeof api;
