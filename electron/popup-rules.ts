/**
 * Rules for routing a page's `window.open` into Kryvex instead of the system
 * browser.
 *
 * Electron cannot move an allowed popup's page into a tab: the popup's
 * `webContents` belongs to the window Chromium created for it, and
 * `WebContentsView` refuses an adopted contents ("already attached to a
 * window"). Moves are what keep `window.opener`, and therefore every OAuth
 * provider that answers by `postMessage`, working — so Kryvex keeps the real
 * popup window and places it over the browser canvas, with a matching entry in
 * the tab strip. These helpers hold the parts of that decision that are pure
 * arithmetic and policy, so they can be tested without Electron.
 */

export interface PopupRequest {
  /** `webview` for a browser tab, `window` for a popup's own children. */
  type: string;
  /** True when the opener belongs to a service module's partition. */
  service: boolean;
  url: string;
  /** Chromium's disposition: `foreground-tab`, `background-tab`, `new-window`. */
  disposition: string;
}

export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
/** Below this the canvas is probably collapsed; a centred window reads better. */
const MIN_CANVAS_WIDTH = 320;
const MIN_CANVAS_HEIGHT = 240;
const MIN_POPUP_WIDTH = 360;
const MIN_POPUP_HEIGHT = 420;

/**
 * `about:blank` is allowed because a few flows open an empty window and write
 * the provider URL into it afterwards. The navigation guard still refuses
 * anything that is not http(s) once the window exists.
 */
export function isPopupTabUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return false;
  if (raw === 'about:blank') return true;
  try {
    return ALLOWED_PROTOCOLS.has(new URL(raw).protocol);
  } catch {
    return false;
  }
}

/**
 * A browser tab's popup becomes an in-app popup tab. A service module keeps the
 * plain child window it already had: its sign-in window belongs beside the
 * service stage, not inside the browser's tab strip.
 */
export function isPopupTabCandidate(request: PopupRequest): boolean {
  if (request.service) return false;
  if (request.type !== 'webview' && request.type !== 'window') return false;
  // A hidden pop-under is the signature of an ad script, not a sign-in flow.
  if (request.disposition === 'background-tab') return false;
  return isPopupTabUrl(request.url);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function usable(rect: RectLike | null | undefined): rect is RectLike {
  if (!rect) return false;
  return finite(rect.x) && finite(rect.y) && finite(rect.width) && finite(rect.height);
}

/**
 * The popup covers the browser canvas, so the tab strip, toolbar and library
 * panel stay Kryvex's own chrome. Without a reported canvas (a fresh window, or
 * a renderer that has not laid out yet) the fallback is centred on the content
 * area at the popup's preferred size.
 */
export function popupPlacement(
  canvas: RectLike | null | undefined,
  content: RectLike,
  fallback: { width: number; height: number },
): RectLike {
  const contentWidth = Math.max(1, Math.round(content.width));
  const contentHeight = Math.max(1, Math.round(content.height));
  const width = Math.max(
    Math.min(MIN_POPUP_WIDTH, contentWidth),
    Math.min(Math.round(fallback.width) || MIN_POPUP_WIDTH, contentWidth),
  );
  const height = Math.max(
    Math.min(MIN_POPUP_HEIGHT, contentHeight),
    Math.min(Math.round(fallback.height) || MIN_POPUP_HEIGHT, contentHeight),
  );

  const canvasUsable =
    usable(canvas) && canvas.width >= MIN_CANVAS_WIDTH && canvas.height >= MIN_CANVAS_HEIGHT;

  if (!canvasUsable) {
    return {
      x: Math.round(content.x + (contentWidth - width) / 2),
      y: Math.round(content.y + Math.max(0, (contentHeight - height) / 2)),
      width,
      height,
    };
  }

  const x = Math.round(content.x + Math.max(0, canvas.x));
  const y = Math.round(content.y + Math.max(0, canvas.y));
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(canvas.width), content.x + contentWidth - x)),
    height: Math.max(1, Math.min(Math.round(canvas.height), content.y + contentHeight - y)),
  };
}

/**
 * A tab label for a popup. The page title wins, because "Sign in – Google
 * Accounts" is what tells the user which popup this is; a host is the fallback
 * while the page is still loading.
 */
export function popupLabel(title: unknown, url: string): string {
  const clean =
    typeof title === 'string'
      ? title.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
      : '';
  if (clean) return clean.slice(0, 100);
  try {
    const parsed = new URL(url);
    if (parsed.hostname) return parsed.hostname;
  } catch {
    /* about:blank and provider redirects have no host to show */
  }
  return '';
}
