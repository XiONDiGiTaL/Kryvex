/**
 * Unread detection for service modules.
 *
 * Kryvex does not read page content. The one signal it uses is the guest's
 * own document title, which every major web client already maintains for its
 * tab: Discord "(3) Discord", Telegram "(3) Telegram", Slack "(3) Slack",
 * WhatsApp "(2) WhatsApp". A leading asterisk is treated as a single unread
 * marker for clients that do not expose a count.
 *
 * Counts are advisory UI. Nothing is sent anywhere and no page DOM is read.
 */

const LEADING_PAREN = /^\s*\((\d{1,3})\+?\)\s*/;
const TRAILING_PAREN = /\s\((\d{1,3})\+?\)\s*$/;
const LEADING_BRACKET = /^\s*\[(\d{1,3})\+?\]\s*/;
const MARKER = /^\s*[*•]\s+\S/;

export const MAX_UNREAD = 999;

function plausible(count: number): number {
  if (!Number.isFinite(count) || count < 0) return 0;
  // "(1998) Trailer" is a title, not 1998 messages. Years are the realistic
  // false positive in this shape, so they are ignored.
  if (count >= 1900 && count <= 2100) return 0;
  return Math.min(Math.floor(count), MAX_UNREAD);
}

export function unreadFromTitle(title: string | null | undefined): number {
  if (!title) return 0;
  for (const pattern of [LEADING_PAREN, LEADING_BRACKET, TRAILING_PAREN]) {
    const match = pattern.exec(title);
    if (match) return plausible(Number(match[1]));
  }
  if (MARKER.test(title)) return 1;
  return 0;
}

export function totalUnread(counts: Record<string, number>): number {
  let total = 0;
  for (const value of Object.values(counts)) {
    if (Number.isFinite(value) && value > 0) total += Math.min(value, MAX_UNREAD);
  }
  return total;
}

/** The renderer keeps the taskbar/window title in sync with unread counts. */
export function windowTitle(unread: number, name = 'Kryvex'): string {
  return unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${name}` : name;
}
