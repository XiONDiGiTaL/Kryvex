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

/** A stable English key for `t()`; the failure itself is a code, not prose. */
export function failureMessage(error: string | undefined): string {
  switch (error) {
    case 'cancelled':
      return 'The download was cancelled.';
    case 'size':
      return 'Size mismatch — nothing was installed.';
    case 'hash':
      return 'Checksum mismatch — nothing was installed.';
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
    default:
      return id;
  }
}

export function limitationLabel(id: string): string {
  switch (id) {
    case 'reasoning':
      return 'Multi-step reasoning';
    case 'arithmetic':
      return 'Arithmetic — use the calculator';
    case 'current-facts':
      return 'Current facts without a search';
    default:
      return id;
  }
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
    default:
      return code.toUpperCase();
  }
}
