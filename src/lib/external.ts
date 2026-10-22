import { isHttpUrl } from './url';

/**
 * Opens a link outside the app. The desktop shell hands it to the OS; the
 * web/PWA build opens a normal browser tab because it has no bridge.
 */
export function openExternalUrl(url: string): void {
  if (!isHttpUrl(url)) return;
  if (window.kryvex) {
    void window.kryvex.openExternal(url).catch(() => undefined);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
