import { contextBridge } from 'electron';

/**
 * Gives guest pages the browser identity their user agent already claims.
 *
 * Kryvex sends a plain desktop Chrome user agent, but Chromium inside Electron
 * does not expose `navigator.userAgentData` at all. A page that reads the UA
 * and then finds the client-hint API missing is looking at a browser that
 * cannot exist: real Chrome has both. Google's sign-in page is the loudest
 * example: it refuses the flow with "This browser or app may not be secure".
 *
 * This patch only makes the two halves agree. It does not hide that Kryvex is
 * an app: the engine, the process model and everything a page can observe
 * about an embedded view stay what they are.
 */
const major = (String(process.versions.chrome || '').split('.')[0] ?? '').replace(/\D/g, '') || '152';

const platformName =
  process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux';

const platformVersion =
  process.platform === 'darwin' ? '14.0.0' : process.platform === 'win32' ? '15.0.0' : '6.5.0';

try {
  contextBridge.executeInMainWorld({
    func: installBrowserIdentity,
    args: [major, platformName, platformVersion],
  });
} catch {
  // A build without main-world execution keeps the plain Electron surface.
}

/** Serialized into the page's main world; keep it self-contained. */
function installBrowserIdentity(
  chromeMajor: string,
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
    { brand: 'Google Chrome', version: `${chromeMajor}.0.0.0` },
    { brand: 'Chromium', version: `${chromeMajor}.0.0.0` },
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
    uaFullVersion: `${chromeMajor}.0.0.0`,
    wow64: false,
  };

  const uaData = {
    brands,
    mobile: false,
    platform,
    getHighEntropyValues(hints: string[]) {
      const result: Record<string, unknown> = { brands, mobile: false, platform };
      for (const hint of Array.isArray(hints) ? hints : []) {
        if (Object.prototype.hasOwnProperty.call(highEntropy, hint)) {
          result[hint] = highEntropy[hint];
        }
      }
      return Promise.resolve(result);
    },
    toJSON() {
      return { brands, mobile: false, platform };
    },
  };

  try {
    Object.defineProperty(nav, 'userAgentData', {
      value: uaData,
      configurable: true,
      enumerable: true,
      writable: false,
    });
  } catch {
    try {
      nav.userAgentData = uaData;
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
