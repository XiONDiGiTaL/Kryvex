/**
 * Presentation helpers for the model manager.
 *
 * The numbers come from the catalogue (bytes, pinned hash) and the main
 * process (progress). Nothing here decides what may be downloaded; that lives
 * in `electron/model-rules.ts`. Keeping the formatting pure makes the labels
 * testable without a window.
 */
import type { ModelDownloadPhase, ModelMemoryEstimate } from '../types';

const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

/** The readable filename without its directory or `.gguf` suffix. */
export function modelFileLabel(value: string): string {
  const name = value.split(/[\\/]/).pop() ?? '';
  return name.replace(/\.gguf$/i, '') || name;
}

export function formatModelSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

/** Explicitly an estimate: weights plus a KV cache plus runtime overhead. */
export function formatMemoryEstimate(memory: ModelMemoryEstimate): string {
  return `≈${formatModelSize(memory.minBytes)}–${formatModelSize(memory.maxBytes)}`;
}

export function downloadPercent(received: number, total: number): number {
  if (!Number.isFinite(received) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((received / total) * 100)));
}

export function isActivePhase(phase: ModelDownloadPhase | undefined): boolean {
  return phase === 'downloading' || phase === 'verifying';
}

/**
 * The card that leads the panel: the model in use, else the default core, else
 * the catalogue order. The rest are shown behind the fold, so the one the
 * runtime was handed is always the one on screen.
 */
export function orderCatalogue<T extends { id: string }>(
  entries: T[],
  inUseId: string | null,
  starterId: string,
): T[] {
  if (entries.length < 2) return entries;
  const lead = entries.find(entry => entry.id === inUseId) ?? entries.find(entry => entry.id === starterId);
  if (!lead) return entries;
  return [lead, ...entries.filter(entry => entry.id !== lead.id)];
}

/** A stable English key for `t()`; the failure itself is a code, not prose. */
export function failureMessage(error: string | undefined): string {
  switch (error) {
    case 'cancelled':
      return 'The download was cancelled.';
    case 'size':
      return 'Size mismatch: nothing was installed.';
    case 'hash':
      return 'Checksum mismatch: nothing was installed.';
    case 'disk-space':
      return 'Not enough free disk space for this model.';
    case 'already-installed':
      return 'That model is already installed.';
    case 'running':
      return 'That model is running. Stop the server before deleting it.';
    case 'invalid-entry':
      return 'That catalogue entry is incomplete, so it cannot be downloaded.';
    case 'not-in-catalogue':
      return 'That model is not in the reviewed catalogue.';
    default:
      return 'The download could not be completed.';
  }
}

export function capabilityLabel(id: string): string {
  switch (id) {
    case 'conversation':
      return 'Ordinary conversation';
    case 'rewriting':
      return 'Rewriting and editing';
    case 'summaries':
      return 'Short summaries of text you paste';
    case 'explanations':
      return 'Explanations and how-to';
    case 'web-tools':
      return 'Looks things up through Kryvex’s search and page tools';
    default:
      return id;
  }
}

export function limitationLabel(id: string): string {
  switch (id) {
    case 'reasoning':
      return 'Multi-step reasoning';
    case 'arithmetic':
      return 'Arithmetic: use the calculator';
    case 'current-facts':
      return 'Current facts without a search';
    default:
      return id;
  }
}

/**
 * Where a card's artifact actually comes from, read from the URL the downloader
 * will fetch.
 *
 * The panel used to print `huggingface.co/<repository>` for every entry, which
 * was wrong for anything Kryvex redistributes as a GitHub release asset: the
 * repository name is real, but it lives on a different host. The host is taken
 * from the resolved URL so the label cannot drift from the download.
 */
export function modelSource(url: string | undefined): { host: string; repository: string } | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  return {
    host: parsed.hostname.toLowerCase().replace(/^www\./, ''),
    repository: `${segments[0]}/${segments[1]}`,
  };
}

/** `github.com/XiONDiGiTaL/Vexium-Core`, or the bare repository if unparsable. */
export function modelSourceLabel(url: string | undefined, fallback: string): string {
  const source = modelSource(url);
  return source ? `${source.host}/${source.repository}` : fallback;
}

export function languageLabel(code: string): string {
  switch (code) {
    case 'en':
      return 'English';
    case 'es':
      return 'Spanish';
    case 'de':
      return 'German';
    case 'fr':
      return 'French';
    case 'tr':
      return 'Turkish';
    default:
      return code.toUpperCase();
  }
}
