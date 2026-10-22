/**
 * Pure rules for Kryvex's "My filters" box.
 *
 * The engine is @ghostery/adblocker, so the syntax users paste is uBlock
 * Origin syntax (`||host^`, `example.com##.selector`, `example.com##+js(...)`).
 * Nothing here executes filters: it only decides what is stored, what is
 * privileged, and how the custom block is appended to the downloaded lists, so
 * the UI and the tests can agree without Electron or the network.
 */

/** 64 KiB is far above any hand-written list and still safe to store in JSON. */
export const MAX_CUSTOM_BYTES = 64 * 1024;
/** Long pasted lists are truncated at a line boundary rather than mid-rule. */
export const MAX_CUSTOM_LINES = 2_000;

/**
 * Bumped whenever the curated bundle or its injected page code changes. A
 * cached engine built before the bump is not silently reused: the shield
 * rebuilds it from the cached list download (or refreshes online), so a saved
 * `youtube: true` really means the current rules are installed.
 */
export const SHIELD_BUNDLE_VERSION = 2;

/**
 * uBlock Origin's "YouTube" starter set, kept verbatim as a curated bundle the
 * user can switch on. It hides ad slots, sponsored feed cards and recommendation
 * shelves, neutralises the "ad blocker detected" popup config, and blocks the
 * three smallest well-known ad hosts on youtube.com.
 */
export const YOUTUBE_FILTERS = [
  '! =========================',
  '! YouTube Popup/Ad Flags',
  '! =========================',
  'www.youtube.com##+js(set, yt.config_.openPopupConfig.supportedPopups.adBlockMessageViewModel, false)',
  'www.youtube.com##+js(set, yt.config_.openPopupConfig.enabled, false)',
  '',
  '! =========================',
  '! Home Feed Sponsored / Ads',
  '! =========================',
  'www.youtube.com##ytd-display-ad-renderer',
  'www.youtube.com##ytd-promoted-sparkles-web-renderer',
  'www.youtube.com##ytd-promoted-video-renderer',
  'www.youtube.com##ytd-ad-slot-renderer',
  'www.youtube.com##ytd-in-feed-ad-layout-renderer',
  'www.youtube.com##ytd-banner-promo-renderer',
  'www.youtube.com##ytd-statement-banner-renderer',
  'www.youtube.com###masthead-ad',
  '',
  'www.youtube.com##ytd-video-renderer:has(span:has-text(/Sponsored/i))',
  '',
  '! =========================',
  '! Player overlays and companion ads',
  '! =========================',
  'www.youtube.com##.ytp-ad-overlay-container',
  'www.youtube.com##.ytp-ad-overlay-slot',
  'www.youtube.com##.ytp-ad-image-overlay',
  'www.youtube.com##.ytp-ad-text-overlay',
  'www.youtube.com##.ytp-ad-progress-list',
  'www.youtube.com##.ytp-featured-product',
  'www.youtube.com##.ytp-suggested-action',
  'www.youtube.com##.ytp-ad-player-overlay-layout',
  'www.youtube.com##ytd-action-companion-ad-renderer',
  'www.youtube.com##ytd-companion-slot-renderer',
  'www.youtube.com##ytd-player-legacy-desktop-watch-ads-renderer',
  'www.youtube.com##ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
  'www.youtube.com###player-ads',
  'www.youtube.com##tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)',
  '',
  '! =========================',
  '! Feed Clutter / Recommendation Noise',
  '! =========================',
  'www.youtube.com##ytd-shelf-renderer:has(span:has-text(/For you|Explore|People also watched|People also search|Related|Previously watched|From related searches|Channels new to you/i))',
  'www.youtube.com##ytd-horizontal-card-list-renderer',
  '',
  '! =========================',
  '! Mixed Ad Containers in Grid',
  '! =========================',
  'www.youtube.com##ytd-rich-item-renderer:has(ytd-ad-slot-renderer)',
  'www.youtube.com##ytd-rich-item-renderer:has(ytd-promoted-sparkles-web-renderer)',
  'www.youtube.com##ytd-rich-grid-media:has(ytd-ad-slot-renderer)',
  '',
  '! =========================',
  '! Network-level (safe minimal set)',
  '! =========================',
  '||youtube.com/pagead/',
  '||youtube.com/api/stats/ads',
  '||youtube.com/get_midroll_info',
  '||youtube.com/ptracking',
  '||doubleclick.net^$domain=www.youtube.com',
  '||googlesyndication.com^$domain=www.youtube.com',
  '||googleads.g.doubleclick.net^$domain=www.youtube.com',
].join('\n');

/** Filters that inject or rewrite page machinery; uBO calls these trusted. */
const PRIVILEGED = [
  /##\+js\(/i,
  /#@#\+js\(/i,
  /##\^/,
  /\$redirect/i,
  /\$replace/i,
  /#\+js\(/i,
];

export interface CustomFilterOptions {
  /** Keep scriptlet and redirect rules. Off means they are dropped, not run. */
  scriptlets: boolean;
}

export interface CustomFilterReport {
  /** Rules the engine will try to compile, after privilege filtering. */
  rules: number;
  /** Comment-only or empty lines, kept so the list stays readable. */
  comments: number;
  /** Privileged rules that were dropped because scriptlets are off. */
  skipped: number;
  /** Bytes after truncation, so the UI can warn before it loses text. */
  bytes: number;
  truncated: boolean;
}

export function isPrivilegedFilter(line: string): boolean {
  return PRIVILEGED.some(pattern => pattern.test(line));
}

/**
 * Accepts anything the renderer sends and returns a predictable document:
 * LF endings, no NUL bytes, no trailing whitespace floods, capped size. A line
 * too long for the engine is dropped rather than silently mangled.
 */
export function sanitizeCustomFilters(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/\t/g, '  ');
  const lines = cleaned.split('\n');
  const kept: string[] = [];
  let bytes = 0;
  for (const line of lines) {
    if (kept.length >= MAX_CUSTOM_LINES) break;
    const trimmed = line.replace(/\s+$/, '');
    const size = Buffer.byteLength(trimmed, 'utf8') + 1;
    if (bytes + size > MAX_CUSTOM_BYTES) break;
    bytes += size;
    kept.push(trimmed);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Splits a custom list into the rules that may be compiled now. Comments and
 * blank lines pass through for export; privileged rules are counted and
 * dropped when the trust switch is off.
 */
/** Combines the bundle and the user's list exactly as the engine sees them. */
export function scriptletSource(custom: string, youtube: boolean): string {
  return youtube ? `${YOUTUBE_FILTERS}\n${custom}` : custom;
}

export function activeCustomLines(text: string, options: CustomFilterOptions): CustomFilterReport {
  const value = sanitizeCustomFilters(text);
  const lines = value ? value.split('\n') : [];
  const kept: string[] = [];
  let rules = 0;
  let comments = 0;
  let skipped = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('!') || trimmed.startsWith('[')) {
      comments += 1;
      continue;
    }
    if (!options.scriptlets && isPrivilegedFilter(trimmed)) {
      skipped += 1;
      continue;
    }
    rules += 1;
    kept.push(trimmed);
  }
  return {
    rules,
    comments,
    skipped,
    bytes: Buffer.byteLength(value, 'utf8'),
    truncated:
      value.length > 0 &&
      (value.split('\n').length >= MAX_CUSTOM_LINES || Buffer.byteLength(value, 'utf8') >= MAX_CUSTOM_BYTES - 512),
  };
}

export interface ShieldFilterSources {
  /** The downloaded lists, already joined. */
  base: string;
  custom: string;
  /** Append the curated YouTube bundle. */
  youtube: boolean;
  options: CustomFilterOptions;
}

/**
 * Builds the single document parsed into a blocking engine. Custom rules come
 * last so a hand-written exception can override a bundled one, which is how
 * uBO orders dynamic user filters.
 */
export function composeFilterSource(sources: ShieldFilterSources): string {
  const parts: string[] = [];
  if (sources.base.trim()) parts.push(sources.base.trim());
  if (sources.youtube) {
    parts.push(`! ==== Kryvex: YouTube ads and feed noise ====\n${YOUTUBE_FILTERS}`);
  }
  const custom = sources.custom.trim();
  if (custom) {
    const active = custom
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) return true;
        return sources.options.scriptlets || !isPrivilegedFilter(trimmed);
      })
      .join('\n');
    if (active.trim()) {
      parts.push(`! ==== Kryvex: My filters ====\n${active}`);
    }
  }
  return parts.join('\n\n');
}

/** Line count of the stored custom list, for the editor footer. */
export function customLineCount(text: string): number {
  return text ? text.split('\n').length : 0;
}

export interface ScriptletRule {
  /** Scriptlet name: only the ones Kryvex implements are returned. */
  name: string;
  args: string[];
}

/**
 * uBO's `set`/`set-constant` is the only scriptlet Kryvex can honour without a
 * scriptlet library: it assigns a literal to a property path, which is safe to
 * generate and easy to reason about. Others are ignored rather than faked.
 */
const IMPLEMENTED = new Set(['set', 'set-constant']);

/** Host rules match the exact host and its subdomains, as uBO does. */
export function hostMatches(host: string, domain: string): boolean {
  const target = host.toLowerCase();
  const value = domain.trim().toLowerCase();
  if (!target || !value) return false;
  if (value.startsWith('~')) return false;
  const bare = value.replace(/^\*/, '').replace(/^\+?/, '');
  return target === bare || target.endsWith(`.${bare}`);
}

function filterHosts(pattern: string): string[] | null {
  const hosts = pattern
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  if (hosts.length === 0) return null;
  return hosts;
}

/**
 * Reads `host##+js(name, arg, …)` lines that apply to one URL. Comments,
 * cosmetic selectors and network rules are not scriptlets and are skipped.
 */
export function scriptletsFor(text: string, url: string): ScriptletRule[] {
  let host = '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return [];
    host = parsed.hostname.toLowerCase();
  } catch {
    return [];
  }
  const rules: ScriptletRule[] = [];
  for (const raw of sanitizeCustomFilters(text).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('!')) continue;
    const marker = line.indexOf('##+js(');
    const exception = line.indexOf('#@#+js(');
    if (marker < 0 || exception >= 0) continue;
    const pattern = line.slice(0, marker);
    if (pattern.includes('#@#')) continue;
    const hosts = filterHosts(pattern);
    if (!hosts) continue;
    const positives = hosts.filter(entry => !entry.startsWith('~'));
    const negatives = hosts.filter(entry => entry.startsWith('~')).map(entry => entry.slice(1));
    if (negatives.some(entry => hostMatches(host, entry))) continue;
    if (!positives.some(entry => hostMatches(host, entry))) continue;
    const body = line.slice(marker + '##+js('.length);
    const close = body.lastIndexOf(')');
    const inner = (close >= 0 ? body.slice(0, close) : body).trim();
    if (!inner) continue;
    const [name, ...args] = inner.split(',').map(part => part.trim());
    const key = (name ?? '').toLowerCase();
    if (!IMPLEMENTED.has(key)) continue;
    if (args.length === 0) continue;
    rules.push({ name: key, args });
    if (rules.length >= 24) break;
  }
  return rules;
}

/** Maps uBO's literal tokens to JavaScript values, never to arbitrary code. */
export function scriptletValue(raw: string): string {
  const value = raw.trim();
  if (value === 'true') return 'true';
  if (value === 'false') return 'false';
  if (value === '0') return '0';
  if (value === '1') return '1';
  if (value === 'noopFunc') return 'function(){}';
  if (value === '{}') return 'Object.create(null)';
  if (value === '[]') return '[]';
  if (value === '') return "''";
  if (/^-\d+(\.\d+)?$/.test(value)) return value;
  return JSON.stringify(value.replace(/^['"]|['"]$/g, ''));
}

/**
 * The code Kryvex runs in the page for these rules. It retries because ad
 * vendors create their config objects after first paint; it stops after 15s or
 * as soon as every path exists.
 */
/** The curated player code is only ever injected into YouTube's own hosts. */
export function isYouTubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'youtube-nocookie.com' ||
      host.endsWith('.youtube-nocookie.com')
    );
  } catch {
    return false;
  }
}

/**
 * YouTube stitched ads into the player response, where a URL blocklist cannot
 * see them. This code removes the ad payload before YouTube's player reads it
 * and skips anything that still starts. It edits only the ad keys, never the
 * video stream, so playback and quality selection are untouched.
 *
 * Runs once per page. The fetch wrapper is marked so a second injection (a
 * navigation within the same document) cannot stack another wrapper.
 */
export function youtubeAdCode(): string {
  return `(() => {
  if (window.__kryvexYouTubeAds) return 'already';
  window.__kryvexYouTubeAds = 'running';
  const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];
  const prune = data => {
    if (!data || typeof data !== 'object') return false;
    let changed = false;
    for (const key of AD_KEYS) {
      if (key in data) {
        try { delete data[key]; changed = true; } catch (error) { /* frozen payload */ }
      }
    }
    if (data.playerResponse) changed = prune(data.playerResponse) || changed;
    return changed;
  };
  const pruneWindow = () => {
    try {
      if (window.ytInitialPlayerResponse) prune(window.ytInitialPlayerResponse);
    } catch (error) { /* not on a watch page */ }
    try {
      const args = window.ytplayer && ytplayer.config && ytplayer.config.args;
      if (args && typeof args.player_response === 'string') {
        const data = JSON.parse(args.player_response);
        if (prune(data)) args.player_response = JSON.stringify(data);
      }
    } catch (error) { /* malformed config */ }
  };
  const wrapFetch = () => {
    if (typeof window.fetch !== 'function' || window.fetch.__kryvexYouTubeAds) return;
    const original = window.fetch.bind(window);
    const wrapped = async (input, init) => {
      const response = await original(input, init);
      try {
        const url = typeof input === 'string' ? input : input && input.url;
        if (typeof url === 'string' && url.includes('/youtubei/v1/player')) {
          const data = await response.clone().json();
          if (prune(data)) {
            return new Response(JSON.stringify(data), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          }
        }
      } catch (error) { /* a non-JSON response passes through */ }
      return response;
    };
    wrapped.__kryvexYouTubeAds = true;
    window.fetch = wrapped;
  };
  const skip = () => {
    const button = document.querySelector(
      '.ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button',
    );
    if (button && typeof button.click === 'function') button.click();
    const ad = document.querySelector('.ad-showing video, .ytp-ad-player-overlay video');
    if (ad && Number.isFinite(ad.duration) && Number.isFinite(ad.currentTime)) {
      if (ad.duration > 0 && ad.currentTime < ad.duration - 0.4) {
        try { ad.currentTime = ad.duration; } catch (error) { /* seek refused */ }
      }
    }
    const surface = document.querySelector('.ytp-ad-overlay-container, #player-ads');
    if (surface) surface.style.display = 'none';
    pruneWindow();
    return true;
  };
  wrapFetch();
  skip();
  // The player swaps its response on every navigation; a 500 ms sweep is cheap
  // and catches both the overlay controls and the next stitched ad.
  setInterval(skip, 500);
  return 'applied';
})();`;
}

export function scriptletCode(rules: ScriptletRule[]): string {
  if (rules.length === 0) return '';
  const assignments = rules
    .map(rule => `[${JSON.stringify(rule.args[0] ?? '')}, ${scriptletValue(rule.args[1] ?? '')}]`)
    .join(',');
  return `(() => {
  if (window.__kryvexScriptletRun) return 'already';
  window.__kryvexScriptletRun = true;
  const rules = [${assignments}];
  const setPath = (path, value) => {
    const parts = String(path).split('.').filter(Boolean);
    if (!parts.length) return true;
    let target = window;
    for (let index = 0; index < parts.length - 1; index += 1) {
      target = target && target[parts[index]];
      if (!target || (typeof target !== 'object' && typeof target !== 'function')) return false;
    }
    try {
      target[parts[parts.length - 1]] = value;
      return true;
    } catch (error) {
      return false;
    }
  };
  let pending = rules.slice();
  let tries = 0;
  const tick = () => {
    pending = pending.filter(([path, value]) => !setPath(path, value));
    tries += 1;
    if (!pending.length || tries > 300) clearInterval(timer);
  };
  const timer = setInterval(tick, 50);
  tick();
  return 'applied';
})();`;
}
