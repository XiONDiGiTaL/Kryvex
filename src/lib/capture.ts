import type { CaptureKind, HomeCapture } from '../types';

/**
 * Quick capture: an intake queue, not a second note board.
 *
 * The box exists so a thought, a link or a to-do can be dropped without leaving
 * what the user is doing. Sorting happens later, so the rules here only keep the
 * list readable: known kinds, trimmed text, a stable id and a cap.
 */
export const MAX_CAPTURES = 40;
export const MAX_CAPTURE_TEXT = 240;
export const CAPTURE_KINDS: readonly CaptureKind[] = ['task', 'link', 'idea'];

export function isCaptureKind(value: unknown): value is CaptureKind {
  return typeof value === 'string' && (CAPTURE_KINDS as readonly string[]).includes(value);
}

/**
 * A link is recognised from its shape, not from a network call: a scheme, a
 * `www.` prefix, or a dotted host with no spaces in it. Anything else stays a
 * task unless the user says otherwise, because most captures are a to-do.
 */
export function looksLikeLink(text: string): boolean {
  const value = text.trim();
  if (!value || /\s/.test(value)) return false;
  if (/^https?:\/\//i.test(value)) return true;
  if (/^www\./i.test(value)) return true;
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value) && /\.[a-z]{2,}/i.test(value);
}

export function kindFor(text: string): CaptureKind {
  return looksLikeLink(text) ? 'link' : 'task';
}

/** Trims, drops empties and the unknown, and keeps the newest entries. */
export function sanitizeCaptures(raw: unknown): HomeCapture[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: HomeCapture[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.id !== 'string' || !entry.id || entry.id.length > 64) continue;
    if (seen.has(entry.id)) continue;
    if (typeof entry.text !== 'string') continue;
    const text = entry.text.trim().slice(0, MAX_CAPTURE_TEXT);
    if (!text) continue;
    const createdAt =
      typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
        ? Math.round(entry.createdAt)
        : 0;
    seen.add(entry.id);
    out.push({
      id: entry.id,
      text,
      kind: isCaptureKind(entry.kind) ? entry.kind : kindFor(text),
      createdAt,
    });
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out.slice(0, MAX_CAPTURES);
}

/** Newest first, so the thing just captured is the thing in reach. */
export function prependCapture(list: HomeCapture[], capture: HomeCapture): HomeCapture[] {
  if (list.some(item => item.id === capture.id)) return list;
  return [capture, ...list].slice(0, MAX_CAPTURES);
}

export function removeCapture(list: HomeCapture[], id: string): HomeCapture[] {
  return list.filter(item => item.id !== id);
}
