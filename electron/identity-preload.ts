import { contextBridge, ipcRenderer } from 'electron';

/**
 * Gives guest pages the browser identity their user agent already claims.
 *
 * Two things are installed here.
 *
 * `window.chrome` is part of what a Chromium browser is: Chrome and every
 * Chromium fork expose `chrome.app`, `chrome.csi`, `chrome.loadTimes` and
 * `chrome.runtime` on every page. Electron exposes an empty object, and that
 * absence is what Google's account pages read when they decide a browser is an
 * embedded view: with the surface present the flow starts on Google's regular
 * sign-in page instead of its reduced one. It is installed everywhere, because
 * a guest that reports a Chromium engine should look like one.
 *
 * `navigator.userAgentData` is patched only where the guest reports a Chrome
 * user agent, which is every site except Google. Electron's own `userAgentData`
 * names Chromium; a page that reads a Chrome user agent and then finds a
 * different brand in the hints is looking at a browser that cannot exist, so the
 * patch makes the two halves agree. Google's hosts report the bare Chromium
 * agent instead, and there the engine's own values already agree — see
 * `claimChrome` below and the per-family user agent in `identity.ts`.
 */

/**
 * True when this page reports a Chrome user agent and needs the matching brand
 * list. The main process owns the rule; a page that cannot be asked keeps the
 * patch.
 */
function claimChrome(): boolean {
  let host = '';
  try {
    const page = globalThis as unknown as { location?: { hostname?: string } };
    host = String(page.location?.hostname ?? '');
  } catch {
    return true;
  }
  try {
    return ipcRenderer.sendSync('kryvex:identity:chrome', host) !== false;
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

try {
  contextBridge.executeInMainWorld({
    func: installBrowserIdentity,
    args: [claimChrome(), major, fullVersion || `${major}.0.0.0`, platformName, platformVersion],
  });
} catch {
  // A build without main-world execution keeps the plain Electron surface.
}

/**
 * Serialized into the page's main world by `executeInMainWorld`: everything it
 * needs must live inside this function, because nothing outside it exists
 * there.
 */
function installBrowserIdentity(
  claimChromeIdentity: boolean,
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
  const owner =
    ((root.Navigator as { prototype?: object } | undefined)?.prototype as object | undefined) ??
    nav;

  /** Chrome's own client-hint object, on the prototype like the real one. */
  const installBrands = (): void => {
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
    try {
      Object.defineProperty(owner, 'userAgentData', descriptor);
    } catch {
      try {
        Object.defineProperty(nav, 'userAgentData', descriptor);
      } catch {
        /* a frozen global keeps the engine's own object */
      }
    }
  };

  /**
   * The parts of `window.chrome` that exist in every Chromium browser and that
   * Electron leaves out. Shapes follow Chromium's own; the timings are
   * placeholders that only exist so the members are callable.
   */
  const installSurface = (): void => {
    const chrome = (root.chrome as Record<string, unknown> | undefined) ?? {};
    const now = Date.now();

    if (typeof chrome.app !== 'object') {
      chrome.app = {
        isInstalled: false,
        InstallState: {
          DISABLED: 'disabled',
          INSTALLED: 'installed',
          NOT_INSTALLED: 'not_installed',
        },
        RunningState: {
          CANNOT_RUN: 'cannot_run',
          READY_TO_RUN: 'ready_to_run',
          RUNNING: 'running',
        },
        getDetails() {
          return null;
        },
        getIsInstalled() {
          return false;
        },
        runningState() {
          return 'cannot_run';
        },
      };
    }

    if (typeof chrome.csi !== 'function') {
      chrome.csi = () => ({ onloadT: now, startE: now, frameId: 1, pageT: 12.5, tran: 15 });
    }

    if (typeof chrome.loadTimes !== 'function') {
      chrome.loadTimes = () => ({
        commitLoadTime: now / 1000,
        connectionInfo: 'h2',
        finishDocumentLoadTime: now / 1000,
        finishLoadTime: now / 1000,
        firstPaintTime: now / 1000,
        firstPaintAfterLoadTime: 0,
        navigationType: 'Other',
        npnNegotiatedProtocol: 'h2',
        requestTime: now / 1000,
        startLoadTime: now / 1000,
        wasAlternateProtocolAvailable: false,
        wasFetchedViaSpdy: true,
        wasNpnNegotiated: true,
      });
    }

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
  };

  // Chrome's `navigator.webdriver` is a getter on the prototype, and it is false
  // in a normal browser.
  try {
    Object.defineProperty(owner, 'webdriver', {
      configurable: true,
      enumerable: true,
      get() {
        return false;
      },
    });
  } catch {
    /* a frozen built-in keeps the engine's own value */
  }

  if (claimChromeIdentity) installBrands();
  installSurface();
}
