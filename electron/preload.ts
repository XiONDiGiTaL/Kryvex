import { contextBridge, ipcRenderer } from 'electron';

/**
 * The only bridge between the sandboxed renderer and the main process. No
 * filesystem, no shell, no arbitrary IPC — a fixed list of typed operations.
 * Extension paths and filter-list URLs never cross this bridge.
 */
const api = {
  platform: process.platform,
  loadState: (): Promise<unknown> => ipcRenderer.invoke('kryvex:state:load'),
  saveState: (state: unknown): Promise<boolean> => ipcRenderer.invoke('kryvex:state:save', state),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('kryvex:open-external', url),
  shieldStatus: (): Promise<unknown> => ipcRenderer.invoke('kryvex:shield:status'),
  shieldSetEnabled: (enabled: boolean): Promise<unknown> =>
    ipcRenderer.invoke('kryvex:shield:enabled', enabled),
  shieldUpdate: (): Promise<unknown> => ipcRenderer.invoke('kryvex:shield:update'),
  extensionsList: (): Promise<unknown> => ipcRenderer.invoke('kryvex:extensions:list'),
  extensionsInstall: (): Promise<unknown> => ipcRenderer.invoke('kryvex:extensions:install'),
  extensionsInstallFolder: (): Promise<unknown> =>
    ipcRenderer.invoke('kryvex:extensions:install-folder'),
  extensionsSetEnabled: (key: string, enabled: boolean): Promise<unknown> =>
    ipcRenderer.invoke('kryvex:extensions:enabled', key, enabled),
  extensionsRemove: (key: string): Promise<unknown> =>
    ipcRenderer.invoke('kryvex:extensions:remove', key),
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
