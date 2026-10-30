/**
 * Pure rules for user scripts.
 *
 * Kryvex runs Greasemonkey/Tampermonkey-style `.user.js` files in browser tabs.
 * Nothing here touches Electron, the disk or a page: this module decides what a
 * file *is* (its `==UserScript==` block), which URLs it applies to (Chrome match
 * patterns plus Tampermonkey `@include` globs), and how its source is wrapped
 * before it is evaluated. The manager and the UI both read these rules, so the
 * tests can hold them without a window.
 */

/** One script larger than this is refused; real ones are a few kilobytes. */
export const MAX_USERSCRIPT_BYTES = 512 * 1024;
/** Enough for a personal collection, far short of what would slow every page. */
export const MAX_USERSCRIPTS = 60;

export type UserscriptRunAt = 'document-start' | 'document-end' | 'document-idle';

export interface UserscriptMeta {
  name: string;
  namespace: string;
  version: string;
  description: string;
  matches: string[];
  includes: string[];
  excludes: string[];
  runAt: UserscriptRunAt;
}

/**
 * The part of a script that decides *where* it runs. The browser panel holds a
 * record rather than the whole metadata block, so matching is typed against
 * these three lists instead of the full header.
 */
export interface UserscriptTargets {
  matches: string[];
  includes: string[];
  excludes: string[];
}

export type UserscriptParse =
  | { ok: true; meta: UserscriptMeta }
  | { ok: false; reason: string };

const HEADER_START = /\/\/\s*==UserScript==\r?\n([\s\S]*?)\/\/\s*==\/UserScript==/;

function clip(value: string, max: number): string {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reads the metadata block.
 *
 * A file without a block is rejected rather than guessed at: without `@match`
 * or `@include` there is no page it should ever run on, and running arbitrary
 * script on every site because a header was malformed is the wrong default.
 */
export function parseUserscript(source: string): UserscriptParse {
  if (typeof source !== 'string' || !source.trim()) {
    return { ok: false, reason: 'The file is empty.' };
  }
  const body = source.replace(/^\uFEFF/, '');
  const header = HEADER_START.exec(body);
  if (!header) {
    return { ok: false, reason: 'The file has no ==UserScript== metadata block.' };
  }

  const meta: UserscriptMeta = {
    name: '',
    namespace: '',
    version: '0.0.1',
    description: '',
    matches: [],
    includes: [],
    excludes: [],
    runAt: 'document-end',
  };

  for (const line of (header[1] ?? '').split(/\r?\n/)) {
    const entry = /^\s*\/\/\s*@([A-Za-z-]+)\s*(.*)$/.exec(line);
    if (!entry) continue;
    const key = (entry[1] ?? '').toLowerCase();
    const value = (entry[2] ?? '').trim();
    if (!value) continue;
    switch (key) {
      case 'name':
        if (!meta.name) meta.name = clip(value, 80);
        break;
      case 'namespace':
        if (!meta.namespace) meta.namespace = clip(value, 200);
        break;
      case 'version':
        if (meta.version === '0.0.1') meta.version = clip(value, 30);
        break;
      case 'description':
        if (!meta.description) meta.description = clip(value, 300);
        break;
      case 'match':
        if (meta.matches.length < 40) meta.matches.push(value);
        break;
      case 'include':
        if (meta.includes.length < 40) meta.includes.push(value);
        break;
      case 'exclude':
        if (meta.excludes.length < 40) meta.excludes.push(value);
        break;
      case 'run-at': {
        const at = value.toLowerCase();
        if (at === 'document-start' || at === 'document-end' || at === 'document-idle') {
          meta.runAt = at;
        }
        break;
      }
      default:
        // @grant, @icon, @require, @resource and the rest are metadata Kryvex
        // does not implement, so they are recorded nowhere and change nothing.
        break;
    }
  }

  if (!meta.name) {
    return { ok: false, reason: 'The metadata block has no @name.' };
  }
  if (meta.matches.length === 0 && meta.includes.length === 0) {
    return {
      ok: false,
      reason: 'The script names no @match or @include, so there is no page to run it on.',
    };
  }
  return { ok: true, meta };
}

function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function globToRegExp(glob: string): RegExp | null {
  try {
    const pattern = glob
      .split('*')
      .map(escapeRegExp)
      .join('.*');
    return new RegExp(`^${pattern}$`, 'i');
  } catch {
    return null;
  }
}

function hostMatches(pattern: string, hostname: string): boolean {
  const wanted = pattern.toLowerCase();
  const host = hostname.toLowerCase();
  if (wanted === '*') return true;
  // Chrome's `*.example.com` covers the bare domain as well as subdomains.
  if (wanted.startsWith('*.')) {
    const base = wanted.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return host === wanted;
}

/** A Chrome-style match pattern: `*://*.example.com/path/*`. */
export function matchPattern(pattern: string, rawUrl: string): boolean {
  if (typeof pattern !== 'string' || !pattern) return false;
  if (pattern === '<all_urls>') return Boolean(parseUrl(rawUrl));
  const match = /^(\*|https?):\/\/([^/]*)(\/.*)$/i.exec(pattern);
  if (!match) return false;
  const url = parseUrl(rawUrl);
  if (!url) return false;
  const scheme = match[1] ?? '';
  const host = match[2] ?? '';
  const path = match[3] ?? '/';
  if (scheme !== '*' && `${scheme.toLowerCase()}:` !== url.protocol) return false;
  if (!hostMatches(host, url.hostname)) return false;
  const glob = globToRegExp(path);
  if (!glob) return false;
  return glob.test(`${url.pathname}${url.search}`);
}

/**
 * A Tampermonkey `@include`: a glob over the whole URL, or `/regex/`.
 */
export function matchInclude(pattern: string, rawUrl: string): boolean {
  if (typeof pattern !== 'string' || !pattern) return false;
  if (!parseUrl(rawUrl)) return false;
  if (pattern.length > 2 && pattern.startsWith('/') && pattern.endsWith('/')) {
    try {
      return new RegExp(pattern.slice(1, -1)).test(rawUrl);
    } catch {
      return false;
    }
  }
  const glob = globToRegExp(pattern);
  return glob ? glob.test(rawUrl) : false;
}

function patternApplies(pattern: string, rawUrl: string): boolean {
  return matchPattern(pattern, rawUrl) || matchInclude(pattern, rawUrl);
}

/**
 * Whether a script should run on a URL. `@exclude` wins over `@include`, which
 * is what both Tampermonkey and Greasemonkey do, and only http(s) pages are
 * eligible at all.
 */
export function appliesTo(meta: UserscriptTargets, rawUrl: string): boolean {
  if (!parseUrl(rawUrl)) return false;
  if (meta.excludes.some(pattern => patternApplies(pattern, rawUrl))) return false;
  return (
    meta.matches.some(pattern => matchPattern(pattern, rawUrl)) ||
    meta.includes.some(pattern => matchInclude(pattern, rawUrl))
  );
}

/**
 * The hosts a script claims, for the settings list. Patterns are reduced to the
 * part a person recognises; `<all_urls>` and a bare `*` stay as they are.
 */
export function hostsOf(meta: UserscriptTargets): string[] {
  const hosts = new Set<string>();
  for (const pattern of [...meta.matches, ...meta.includes]) {
    if (pattern === '<all_urls>') {
      hosts.add('all sites');
      continue;
    }
    const match = /^(\*|https?):\/\/([^/]+)/i.exec(pattern);
    if (match) {
      const host = (match[2] ?? '').toLowerCase();
      hosts.add(host === '*' ? 'all sites' : host.replace(/^\*\./, '*.'));
      continue;
    }
    hosts.add(clip(pattern, 40));
  }
  return [...hosts].slice(0, 6);
}

/**
 * Wraps one script for `executeJavaScript`.
 *
 * The wrapper is a function scope, not a module: it keeps the script's own
 * names out of the page's globals, and turns a thrown error into a console
 * warning instead of an unhandled rejection. A syntax error still fails the
 * whole evaluation, which the manager reports per script. `sourceURL` gives the
 * DevTools console a readable name for the file.
 */
export function wrapUserscript(key: string, name: string, source: string): string {
  const label = JSON.stringify(`[Kryvex] userscript "${name}"`);
  return `(() => {
  try {
${source}
  } catch (error) {
    console.warn(${label} + ' failed', error);
  }
})();
//# sourceURL=kryvex-userscript-${key}.user.js`;
}
