import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appliesTo,
  hostsOf,
  parseUserscript,
  wrapUserscript,
} from '../electron/userscript-rules';

/**
 * The shipped Discord theme is a real file on disk, so it is checked as one: the
 * engine's own parser, matcher and wrapper run against it, and its body is
 * executed against a fake document to prove it inserts a stylesheet. Nothing
 * here contacts Discord, and nothing claims the colours look right — that needs
 * a browser.
 */
const FILE = path.join(process.cwd(), 'docs', 'userscripts', 'discord-theme.user.js');
const SOURCE = fs.readFileSync(FILE, 'utf8');

interface FakeNode {
  tagName: string;
  id: string;
  textContent: string;
}

function fakeDocument(readyState: 'loading' | 'complete') {
  const byId = new Map<string, FakeNode>();
  const children: FakeNode[] = [];
  const listeners: string[] = [];
  const doc = {
    readyState,
    documentElement: {
      appendChild(node: FakeNode) {
        children.push(node);
        if (node.id) byId.set(node.id, node);
      },
    },
    head: {
      appendChild(node: FakeNode) {
        children.push(node);
        if (node.id) byId.set(node.id, node);
      },
    },
    createElement(tag: string): FakeNode {
      return { tagName: tag.toUpperCase(), id: '', textContent: '' };
    },
    getElementById(id: string): FakeNode | null {
      return byId.get(id) ?? null;
    },
    addEventListener(name: string) {
      listeners.push(name);
    },
  };
  return { doc, children, listeners };
}

/** The engine's wrapper, evaluated the way `executeJavaScript` would. */
function run(fake: ReturnType<typeof fakeDocument>) {
  const wrapped = wrapUserscript('us-discord-theme', 'Discord Theme (Kryvex)', SOURCE);
  const evaluate = new Function('document', 'console', wrapped);
  evaluate(fake.doc, { warn() {}, log() {} });
}

describe('the shipped Discord theme', () => {
  it('is a file the engine accepts', () => {
    const parsed = parseUserscript(SOURCE);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.meta.name).toBe('Discord Theme (Kryvex)');
    expect(parsed.meta.version).toBe('1.0.0');
    expect(parsed.meta.runAt).toBe('document-end');
    expect(parsed.meta.matches).toEqual([
      '*://discord.com/*',
      '*://*.discord.com/*',
      '*://*.discordapp.com/*',
    ]);
  });

  it('claims Discord and nothing else', () => {
    const parsed = parseUserscript(SOURCE);
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(appliesTo(parsed.meta, 'https://discord.com/app')).toBe(true);
    expect(appliesTo(parsed.meta, 'https://discord.com/channels/1/2')).toBe(true);
    expect(appliesTo(parsed.meta, 'https://canary.discord.com/channels/@me')).toBe(true);
    expect(appliesTo(parsed.meta, 'https://example.com/')).toBe(false);
    expect(appliesTo(parsed.meta, 'https://discord.com.evil.test/')).toBe(false);
    expect(hostsOf(parsed.meta)).toEqual(['discord.com', '*.discord.com', '*.discordapp.com']);
  });

  it('inserts one recolouring sheet, with no remote fetch', () => {
    const fake = fakeDocument('complete');
    run(fake);
    expect(fake.children).toHaveLength(1);
    const style = fake.children[0];
    expect(style?.tagName).toBe('STYLE');
    expect(style?.id).toBe('kryvex-discord-theme');
    expect(style?.textContent).toContain('--background-primary: #181b23');
    expect(style?.textContent).toContain('--brand-500: #8b7cf6');
    expect(style?.textContent).toContain('--text-normal: #e6e8ee');
    // A theme is colours and nothing else: no image, font or stylesheet URL.
    expect(style?.textContent).not.toContain('url(');
    expect(style?.textContent).not.toContain('@import');
  });

  it('updates in place rather than stacking copies', () => {
    const fake = fakeDocument('complete');
    run(fake);
    run(fake);
    expect(fake.children).toHaveLength(1);
  });

  it('waits for the head when the document is still loading', () => {
    const fake = fakeDocument('loading');
    run(fake);
    expect(fake.listeners).toContain('DOMContentLoaded');
    // It still paints immediately, so a tab that never fires the event is not blank.
    expect(fake.children).toHaveLength(1);
  });
});
