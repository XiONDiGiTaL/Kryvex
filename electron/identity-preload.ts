import { contextBridge, ipcRenderer } from 'electron';

/**
 * Gives guest pages the browser identity their user agent already claims.
 *
 * Kryvex sends a plain desktop Chrome user agent, but Chromium inside Electron
 * reports itself as the Chromium brand in `navigator.userAgentData` and sends
 * no client hints. A page that reads the UA and then finds a different product
 * in the hints is looking at a browser that cannot exist: real Chrome has both
 * halves saying the same thing. Google's sign-in page is the loudest example:
 * it refuses the flow with "This browser or app may not be secure".
 *
 * This patch only makes the two halves agree. It does not hide that Kryvex is
 * an app: the engine, the process model and everything a page can observe
 * about an embedded view stay what they are. The object it installs copies the
 * shape of Chrome's own: an accessor on `Navigator.prototype` that returns a
 * cached `NavigatorUAData`, not an own property holding a plain object.
 *
 * Sign-in providers that check the engine themselves are excluded; see
 * `shimAllowed` below and the user-agent switch in `identity.ts`.
 */

/**
 * Google's account pages verify the engine before they accept a sign-in and
 * refuse one that claims to be Chrome, so they are left unpatched and run
 * under the application's own user agent instead. The main process owns that
 * list; a page that cannot be asked keeps the patch.
 */
function shimAllowed(): boolean {
  let host = '';
  try {
    const page = globalThis as unknown as { location?: { hostname?: string } };
    host = String(page.location?.hostname ?? '');
  } catch {
    return true;
  }
  try {
    return ipcRenderer.sendSync('kryvex:identity:allow', host) !== false;
  } catch {
    return true;
  }
}

const chromeVersion = String(process.versions.chrome ?? '');
const fullVersion = /^\d+(?:\.\d+)*$/.test(chromeVersion) ? chromeVersion : '';
const major = (fullVersion.split('.')[0] ?? '').replace(/\D/g, '') || '152';

const platformName =
  process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux';

const platformVersion =
  process.platform === 'darwin' ? '14.0.0' : process.platform === 'win32' ? '15.0.0' : '6.5.0';

if (shimAllowed()) {
  try {
    contextBridge.executeInMainWorld({
      func: installBrowserIdentity,
      args: [major, fullVersion || `${major}.0.0.0`, platformName, platformVersion],
    });
  } catch {
    // A build without main-world execution keeps the plain Electron surface.
  }
}

/** Serialized into the page's main world; keep it self-contained. */
function installBrowserIdentity(
  chromeMajor: string,
  chromeFullVersion: string,
  platform: string,
  platformVersion: string,
): void {
  const root = globalThis as unknown as Record<string, unknown>;
  const marker = '__kryvexBrowserIdentity';
  if (root[marker]) return;
  try {
    Object.defineProperty(root, marker, { value: true, enumerable: false });
  } catch {
    return;
  }

  const nav = navigator as unknown as Record<string, unknown>;
  const brands = [
    { brand: 'Google Chrome', version: chromeMajor },
    { brand: 'Chromium', version: chromeMajor },
    { brand: 'Not(A:Brand', version: '24' },
  ];
  const fullVersionList = [
    { brand: 'Google Chrome', version: chromeFullVersion },
    { brand: 'Chromium', version: chromeFullVersion },
    { brand: 'Not(A:Brand', version: '24.0.0.0' },
  ];

  const highEntropy: Record<string, unknown> = {
    architecture: 'x86',
    bitness: '64',
    brands,
    fullVersionList,
    mobile: false,
    model: '',
    platform,
    platformVersion,
    uaFullVersion: chromeFullVersion,
    wow64: false,
  };

  // Chrome hands back a `NavigatorUAData`; a plain object literal here is an
  // anomaly an account-protection script can read straight off `Object.
  // getPrototypeOf`. Keeping the class name, the `toStringTag` and the
  // prototype accessor below makes the surface match the one Chrome exposes.
  class NavigatorUAData {
    get brands(): Array<{ brand: string; version: string }> {
      return brands;
    }
    get mobile(): boolean {
      return false;
    }
    get platform(): string {
      return platform;
    }
    getHighEntropyValues(hints: string[]): Promise<Record<string, unknown>> {
      const result: Record<string, unknown> = { brands, mobile: false, platform };
      for (const hint of Array.isArray(hints) ? hints : []) {
        if (Object.prototype.hasOwnProperty.call(highEntropy, hint)) {
          result[hint] = highEntropy[hint];
        }
      }
      return Promise.resolve(result);
    }
    toJSON(): Record<string, unknown> {
      return { brands, mobile: false, platform };
    }
  }
  try {
    Object.defineProperty(NavigatorUAData.prototype, Symbol.toStringTag, {
      value: 'NavigatorUAData',
    });
  } catch {
    /* a frozen built-in keeps the class without the tag */
  }

  const uaData = new NavigatorUAData();
  const descriptor = {
    configurable: true,
    enumerable: true,
    get() {
      return uaData;
    },
  };
  const owner =
    ((root.Navigator as { prototype?: object } | undefined)?.prototype as object | undefined) ?? nav;
  try {
    Object.defineProperty(owner, 'userAgentData', descriptor);
  } catch {
    try {
      Object.defineProperty(nav, 'userAgentData', descriptor);
    } catch {
      return;
    }
  }

  // Real Chrome exposes a `chrome` object on every page. Electron leaves it
  // empty, which is another "cannot exist" combination next to a Chrome UA.
  const chrome = (root.chrome as Record<string, unknown> | undefined) ?? {};
  if (typeof chrome.runtime !== 'object') {
    chrome.runtime = {
      id: undefined,
      connect() {
        throw new Error('Could not establish connection. Receiving end does not exist.');
      },
      sendMessage() {
        throw new Error('Could not establish connection. Receiving end does not exist.');
      },
    };
  }
  try {
    root.chrome = chrome;
  } catch {
    /* a frozen global is not worth fighting */
  }
}
