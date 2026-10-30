import { describe, expect, it } from 'vitest';
import {
  appliesTo,
  hostsOf,
  matchInclude,
  matchPattern,
  parseUserscript,
  wrapUserscript,
} from '../electron/userscript-rules';

const SCRIPT = `// ==UserScript==
// @name         Dark Reader Lite
// @namespace    https://example.com/dark
// @version      1.2.3
// @description  Inverts pages that forget to be dark
// @match        *://*.example.com/*
// @match        https://news.example.org/article/*
// @exclude      *://*.example.com/checkout*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

document.body.dataset.kryvexTest = 'lit';
`;

describe('userscript metadata', () => {
  it('reads a Tampermonkey-style header', () => {
    const parsed = parseUserscript(SCRIPT);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.meta.name).toBe('Dark Reader Lite');
    expect(parsed.meta.namespace).toBe('https://example.com/dark');
    expect(parsed.meta.version).toBe('1.2.3');
    expect(parsed.meta.description).toBe('Inverts pages that forget to be dark');
    expect(parsed.meta.matches).toEqual([
      '*://*.example.com/*',
      'https://news.example.org/article/*',
    ]);
    expect(parsed.meta.excludes).toEqual(['*://*.example.com/checkout*']);
    expect(parsed.meta.runAt).toBe('document-idle');
    // @grant is metadata Kryvex does not implement; it must not abort the parse.
    expect(parsed.meta.includes).toEqual([]);
  });

  it('accepts a byte-order mark and CRLF line endings', () => {
    const parsed = parseUserscript(`\uFEFF${SCRIPT.replace(/\n/g, '\r\n')}`);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.meta.name).toBe('Dark Reader Lite');
  });

  it('refuses a file with no header rather than guessing a target', () => {
    const parsed = parseUserscript('document.body.remove();');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain('==UserScript==');
  });

  it('refuses a script that names no page', () => {
    const parsed = parseUserscript('// ==UserScript==\n// @name Empty\n// ==/UserScript==\n');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain('@match');
  });

  it('refuses an unnamed script', () => {
    const parsed = parseUserscript(
      '// ==UserScript==\n// @match *://*/*\n// ==/UserScript==\n',
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain('@name');
  });

  it('defaults @run-at to document-end and ignores an unknown value', () => {
    const parsed = parseUserscript(
      '// ==UserScript==\n// @name A\n// @match *://*/*\n// @run-at document-body\n// ==/UserScript==\n',
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.meta.runAt).toBe('document-end');
  });
});

describe('userscript matching', () => {
  it('understands the all-urls keyword and the http(s) boundary', () => {
    expect(matchPattern('<all_urls>', 'https://example.com/a')).toBe(true);
    expect(matchPattern('<all_urls>', 'file:///C:/notes.html')).toBe(false);
    expect(matchPattern('<all_urls>', 'not a url')).toBe(false);
  });

  it('covers the bare domain and its subdomains for a wildcard host', () => {
    expect(matchPattern('*://*.example.com/*', 'https://example.com/')).toBe(true);
    expect(matchPattern('*://*.example.com/*', 'https://www.example.com/a/b')).toBe(true);
    expect(matchPattern('*://*.example.com/*', 'https://example.com.evil.net/')).toBe(false);
  });

  it('matches scheme, host and the path glob', () => {
    expect(matchPattern('https://news.example.org/article/*', 'https://news.example.org/article/1')).toBe(
      true,
    );
    expect(matchPattern('https://news.example.org/article/*', 'http://news.example.org/article/1')).toBe(
      false,
    );
    expect(matchPattern('https://news.example.org/article/*', 'https://news.example.org/')).toBe(false);
  });

  it('matches the query string as part of the path', () => {
    expect(matchPattern('*://*/*?q=*', 'https://example.com/search?q=kryvex')).toBe(true);
    expect(matchPattern('*://*/*?q=*', 'https://example.com/search')).toBe(false);
  });

  it('reads @include as a glob over the whole URL and as a regex', () => {
    expect(matchInclude('https://example.com/*', 'https://example.com/x/y')).toBe(true);
    expect(matchInclude('*://*.example.com/*', 'https://a.example.com/z')).toBe(true);
    expect(matchInclude('/^https:\\/\\/example\\.com\\/item\\/\\d+$/', 'https://example.com/item/42')).toBe(
      true,
    );
    expect(matchInclude('/(unclosed/', 'https://example.com/')).toBe(false);
  });

  it('lets @exclude win over @match', () => {
    const parsed = parseUserscript(SCRIPT);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(appliesTo(parsed.meta, 'https://www.example.com/page')).toBe(true);
    expect(appliesTo(parsed.meta, 'https://www.example.com/checkout/pay')).toBe(false);
    expect(appliesTo(parsed.meta, 'https://news.example.org/article/9')).toBe(true);
    expect(appliesTo(parsed.meta, 'https://example.net/')).toBe(false);
  });

  it('never runs on a non-http page', () => {
    const parsed = parseUserscript(
      '// ==UserScript==\n// @name A\n// @match *://*/*\n// ==/UserScript==\n',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(appliesTo(parsed.meta, 'about:blank')).toBe(false);
    expect(appliesTo(parsed.meta, 'file:///C:/a.html')).toBe(false);
  });

  it('reduces patterns to hosts a person recognises', () => {
    const parsed = parseUserscript(SCRIPT);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(hostsOf(parsed.meta)).toEqual(['*.example.com', 'news.example.org']);
  });
});

describe('userscript wrapping', () => {
  it('keeps the source intact and names the file for DevTools', () => {
    const code = wrapUserscript('us-12345678', 'Dark Reader Lite', "document.body.dataset.x = '1';");
    expect(code).toContain("document.body.dataset.x = '1';");
    expect(code).toContain('sourceURL=kryvex-userscript-us-12345678.user.js');
    expect(code).toContain('Dark Reader Lite');
  });

  it('escapes a name that would otherwise break the wrapper', () => {
    const code = wrapUserscript('us-1', 'He said "hi" \\ bye', 'void 0;');
    expect(code).toContain('\\"hi\\"');
    // The wrapper still parses as JavaScript.
    expect(() => new Function(code)).not.toThrow();
  });
});
