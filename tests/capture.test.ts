import { describe, expect, it } from 'vitest';
import {
  MAX_CAPTURES,
  kindFor,
  looksLikeLink,
  prependCapture,
  removeCapture,
  sanitizeCaptures,
} from '../src/lib/capture';
import type { HomeCapture } from '../src/types';

function entry(id: string, text: string, createdAt: number): HomeCapture {
  return { id, text, kind: kindFor(text), createdAt };
}

describe('quick capture', () => {
  it('recognises a link from its shape, not from the network', () => {
    expect(looksLikeLink('https://example.com/a?b=1')).toBe(true);
    expect(looksLikeLink('www.example.com')).toBe(true);
    expect(looksLikeLink('xiondigital.net')).toBe(true);
    expect(looksLikeLink('buy milk')).toBe(false);
    expect(looksLikeLink('note about example.com later')).toBe(false);
    expect(kindFor('https://example.com')).toBe('link');
    expect(kindFor('call the studio')).toBe('task');
  });

  it('keeps the newest entries first and drops junk', () => {
    const list = sanitizeCaptures([
      { id: 'a', text: '  first  ', kind: 'task', createdAt: 1 },
      { id: 'a', text: 'duplicate id', kind: 'task', createdAt: 9 },
      { id: 'b', text: 'link', kind: 'link', createdAt: 5 },
      { id: 'c', text: '   ', kind: 'idea', createdAt: 6 },
      { id: 'd', text: 'idea', kind: 'nonsense', createdAt: 7 },
      { text: 'no id', createdAt: 8 },
    ]);
    expect(list.map(item => item.id)).toEqual(['d', 'b', 'a']);
    expect(list[2]?.text).toBe('first');
    // An unrecognised kind is inferred from the text, not invented.
    expect(list[0]?.kind).toBe('task');
  });

  it('caps the inbox rather than growing without bound', () => {
    const full: HomeCapture[] = Array.from({ length: MAX_CAPTURES }, (_, index) =>
      entry(`id-${index}`, `item ${index}`, index),
    );
    const next = prependCapture(full, entry('new', 'a thought', MAX_CAPTURES + 1));
    expect(next).toHaveLength(MAX_CAPTURES);
    expect(next[0]?.id).toBe('new');
    expect(next.some(item => item.id === `id-${MAX_CAPTURES - 1}`)).toBe(false);
  });

  it('never adds the same capture twice and removes by id', () => {
    const one = entry('a', 'a thought', 1);
    expect(prependCapture([one], one)).toHaveLength(1);
    expect(removeCapture([one, entry('b', 'another', 2)], 'a').map(item => item.id)).toEqual(['b']);
  });
});
