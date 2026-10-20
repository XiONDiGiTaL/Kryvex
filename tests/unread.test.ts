import { describe, expect, it } from 'vitest';
import { MAX_UNREAD, totalUnread, unreadFromTitle, windowTitle } from '../src/lib/unread';

describe('unreadFromTitle', () => {
  it('reads the count formats the major web clients use', () => {
    expect(unreadFromTitle('(3) Discord')).toBe(3);
    expect(unreadFromTitle('(12+) Slack')).toBe(12);
    expect(unreadFromTitle('[4] Element')).toBe(4);
    expect(unreadFromTitle('WhatsApp (2)')).toBe(2);
    expect(unreadFromTitle('* Discord')).toBe(1);
  });

  it('ignores titles without a real unread marker', () => {
    expect(unreadFromTitle('Discord')).toBe(0);
    expect(unreadFromTitle('')).toBe(0);
    expect(unreadFromTitle(null)).toBe(0);
    expect(unreadFromTitle('(1998) The Matrix trailer')).toBe(0);
    expect(unreadFromTitle('Chapter (7) notes')).toBe(0);
  });

  it('clamps absurd counts instead of trusting the page', () => {
    expect(unreadFromTitle('(999+) Discord')).toBe(MAX_UNREAD);
  });
});

describe('totals', () => {
  it('sums only positive counts', () => {
    expect(totalUnread({ a: 2, b: 0, c: 5 })).toBe(7);
    expect(totalUnread({ a: -3, b: Number.NaN })).toBe(0);
  });

  it('formats the window title', () => {
    expect(windowTitle(0)).toBe('Kryvex');
    expect(windowTitle(4)).toBe('(4) Kryvex');
    expect(windowTitle(120)).toBe('(99+) Kryvex');
  });
});
