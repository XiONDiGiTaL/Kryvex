import type { CaptureKind, PartySource, ScreenCapture } from '../types';

/**
 * Rules for the Home board's screen capture.
 *
 * The widget takes one still or one recording of something inside Kryvex — a
 * single service, or the whole app window — and then asks where to put it. All
 * the decisions that can be wrong (which sources are offered, what the file is
 * called, how big a transfer may get) live here so they can be tested without a
 * window, a stream or a dialog.
 */
export const MAX_SCREEN_CAPTURES = 12;
/** A recording stops itself here, so one press cannot fill the disk. */
export const MAX_RECORD_MS = 3 * 60 * 1000;
/** Decoded ceiling for one capture crossing IPC. */
export const MAX_CAPTURE_BYTES = 128 * 1024 * 1024;
/** Frames a still is allowed to skip before it gives up on a stream. */
export const SHOT_READY_TIMEOUT_MS = 6000;
/**
 * Frame rate of the canvas a cropped recording is drawn through.
 *
 * The canvas is redrawn on every animation frame; the recorder samples it at
 * this rate, which is what a screen recording of a window wants.
 */
export const RECORD_FPS = 30;

/** What the recorder asks for, best first. Chromium supports the first two. */
export const RECORDING_TYPES: readonly string[] = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function pickMimeType(supported: (type: string) => boolean): string {
  return RECORDING_TYPES.find(type => supported(type)) ?? '';
}

/** Audio is a bonus: a window that refuses it still records video. */
export function extensionFor(kind: CaptureKind): string {
  return kind === 'clip' ? 'webm' : 'png';
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** `kryvex-gmail-20261026-091500.png` — sortable, and safe on every filesystem. */
export function captureFileName(kind: CaptureKind, target: string, at: Date = new Date()): string {
  const stamp = [
    at.getFullYear(),
    `${at.getMonth() + 1}`.padStart(2, '0'),
    `${at.getDate()}`.padStart(2, '0'),
  ].join('');
  const time = [
    `${at.getHours()}`.padStart(2, '0'),
    `${at.getMinutes()}`.padStart(2, '0'),
    `${at.getSeconds()}`.padStart(2, '0'),
  ].join('');
  return `kryvex-${slug(target) || 'capture'}-${stamp}-${time}.${extensionFor(kind)}`;
}

/** The offered targets: services first, then Kryvex itself, then screens. */
export function groupSources(sources: PartySource[]): {
  services: PartySource[];
  windows: PartySource[];
  screens: PartySource[];
} {
  const services: PartySource[] = [];
  const windows: PartySource[] = [];
  const screens: PartySource[] = [];
  for (const source of sources) {
    if (!source || typeof source.id !== 'string') continue;
    if (source.kind === 'app') services.push(source);
    else if (source.kind === 'screen') screens.push(source);
    else if (source.kind === 'window') windows.push(source);
  }
  // A screen capture inside Kryvex is about Kryvex: the app's own window leads,
  // everything else the desktop is running follows rather than flooding the top.
  const own = windows.filter(source => /kryvex/i.test(source.name));
  const rest = windows.filter(source => !/kryvex/i.test(source.name));
  return { services, windows: [...own, ...rest], screens };
}

export function byteLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const shown = value >= 10 || unit === 0 || Number.isInteger(value) ? Math.round(value) : value.toFixed(1);
  return `${shown} ${units[unit]}`;
}

/** `1:07` for a recording, `0:04` before it has run a second. */
export function durationLabel(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${`${seconds}`.padStart(2, '0')}`;
}

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, limit);
}

function count(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

/** Keeps what a row can show and drops anything malformed. */
export function sanitizeScreenCaptures(raw: unknown): ScreenCapture[] {
  if (!Array.isArray(raw)) return [];
  const out: ScreenCapture[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = text(record.id, 64);
    if (!id || seen.has(id)) continue;
    const name = text(record.name, 160);
    if (!name) continue;
    const kind: CaptureKind = record.kind === 'clip' ? 'clip' : 'shot';
    seen.add(id);
    out.push({
      id,
      kind,
      name,
      path: text(record.path, 1024),
      bytes: count(record.bytes),
      width: count(record.width),
      height: count(record.height),
      target: text(record.target, 80),
      createdAt: count(record.createdAt),
    });
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out.slice(0, MAX_SCREEN_CAPTURES);
}

export function addScreenCapture(list: ScreenCapture[], capture: ScreenCapture): ScreenCapture[] {
  if (list.some(item => item.id === capture.id)) return list;
  return sanitizeScreenCaptures([capture, ...list]);
}

export function removeScreenCapture(list: ScreenCapture[], id: string): ScreenCapture[] {
  return list.filter(item => item.id !== id);
}
