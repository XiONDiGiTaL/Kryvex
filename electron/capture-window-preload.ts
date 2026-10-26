import { contextBridge, ipcRenderer } from 'electron';

/**
 * The capture preview window's bridge.
 *
 * It is deliberately tiny: read what is on screen, save it, copy it, pin the
 * window, open the folder, ask for another capture, close. No path, no file
 * system and no Node reach the page — the window only ever names the capture the
 * main process is already holding.
 */
const api = {
  info: (): Promise<unknown> => ipcRenderer.invoke('kryvex:capture:window:info'),
  save: (): Promise<unknown> => ipcRenderer.invoke('kryvex:capture:window:save'),
  copy: (): Promise<boolean> => ipcRenderer.invoke('kryvex:capture:window:copy'),
  reveal: (): Promise<boolean> => ipcRenderer.invoke('kryvex:capture:window:reveal'),
  pin: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('kryvex:capture:window:pin', enabled),
  fresh: (): Promise<boolean> => ipcRenderer.invoke('kryvex:capture:window:new'),
  close: (): Promise<boolean> => ipcRenderer.invoke('kryvex:capture:window:close'),
};

contextBridge.exposeInMainWorld('kryvexCapture', api);

export type KryvexCaptureBridge = typeof api;
