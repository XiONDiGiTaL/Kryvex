/**
 * Reading a choice out of an embedded page.
 *
 * Two scripts are injected into the guest, and only on an explicit user action
 * (a context-menu item, a shortcut or a palette command). Neither reads
 * cookies, storage or form values: one returns the live selection, the other
 * the page's visible text. Both are plain strings, so the guest never receives
 * an object from the shell.
 */
import type { VexiumSourceInput } from './vexium-transfer';
import { clipSourceText } from './vexium-transfer';

type Guest = {
  executeJavaScript: (code: string) => Promise<unknown>;
  getURL?: () => string;
};

/**
 * The selection, including text selected inside a textarea or input — the
 * places `window.getSelection()` reports nothing.
 */
export const SELECTION_SCRIPT = `(() => {
  try {
    const node = document.activeElement;
    if (node && (node.tagName === 'TEXTAREA' || node.tagName === 'INPUT')) {
      const start = node.selectionStart;
      const end = node.selectionEnd;
      if (typeof start === 'number' && typeof end === 'number' && end > start) {
        return String(node.value).slice(start, end);
      }
    }
    const selection = window.getSelection ? window.getSelection() : null;
    return selection ? selection.toString() : '';
  } catch (error) {
    return '';
  }
})()`;

/**
 * The page as the reader sees it: title, address and visible text. Hidden
 * nodes and scripts are excluded because `innerText` reports rendered text.
 */
export const PAGE_TEXT_SCRIPT = `(() => {
  try {
    const body = document.body;
    const text = body ? (body.innerText || body.textContent || '') : '';
    return JSON.stringify({
      title: document.title || '',
      url: location.href,
      text: String(text)
    });
  } catch (error) {
    return JSON.stringify({ title: '', url: '', text: '' });
  }
})()`;

export interface CapturedPage {
  title: string;
  url: string;
  text: string;
}

function guestUrl(guest: Guest): string {
  try {
    return guest.getURL?.() || '';
  } catch {
    return '';
  }
}

function hostOfUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export async function readSelection(guest: Guest): Promise<string> {
  try {
    const value = await guest.executeJavaScript(SELECTION_SCRIPT);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

export async function readPage(guest: Guest): Promise<CapturedPage> {
  const url = guestUrl(guest);
  try {
    const raw = await guest.executeJavaScript(PAGE_TEXT_SCRIPT);
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      return {
        title: typeof record.title === 'string' ? record.title : '',
        url: typeof record.url === 'string' && record.url ? record.url : url,
        text: typeof record.text === 'string' ? record.text : '',
      };
    }
  } catch {
    /* the guest may be mid-navigation; fall through to the address alone */
  }
  return { title: '', url, text: '' };
}

/**
 * A selection with the page it came from. `withPageDetails` keeps the address
 * and title in the content as well, for the explicit "page and selection"
 * action; the metadata is attached either way.
 */
export function selectionSource(
  page: { title: string; url: string },
  selection: string,
  withPageDetails = false,
): VexiumSourceInput {
  const text = clipSourceText(selection);
  const host = hostOfUrl(page.url);
  const label = page.title.trim()
    ? `${page.title.trim().slice(0, 100)} — ${clipSourceText(selection, 60).replace(/\s+/g, ' ')}`
    : host || 'Webpage selection';
  if (!withPageDetails) {
    return { kind: 'webpage-selection', content: text, label, url: page.url };
  }
  const header = [
    page.title.trim() ? `Title: ${page.title.trim()}` : '',
    page.url ? `URL: ${page.url}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    kind: 'webpage-selection',
    content: header ? `${header}\n\n${text}` : text,
    label,
    url: page.url,
  };
}

/** A whole page, clipped to the per-source cap before it leaves this layer. */
export function pageSource(page: CapturedPage): VexiumSourceInput {
  return {
    kind: 'webpage',
    content: clipSourceText(page.text),
    label: page.title.trim() || hostOfUrl(page.url) || 'Web page',
    url: page.url,
  };
}
