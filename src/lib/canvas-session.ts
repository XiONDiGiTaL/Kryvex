import { useSyncExternalStore } from 'react';
import {
  emptyDocument,
  readDocument,
  type CanvasDocument,
  type CanvasExport,
  type CanvasTool,
} from './canvas-rules';

/**
 * The sheet, its preferences and its history, held for the session.
 *
 * Canvas is reachable from three places — its own view, the secret-services
 * card and a Workspace window — and all three mount and unmount the component,
 * so the drawing cannot live in component state: walking away would erase it.
 * It lives here instead, one sheet for the session, which is also what makes two
 * Canvas windows show the same drawing rather than two unrelated ones.
 *
 * Nothing here is written to disk. Saving is an explicit act, through the same
 * file boundary File Forge uses, and the view says so.
 */
export interface CanvasPrefs {
  tool: CanvasTool;
  colour: string;
  width: number;
  background: string;
  exportFormat: CanvasExport;
  fontSize: number;
  /** The name the sheet is saved under, remembered between exports. */
  docName: string;
}

export interface CanvasSnapshot {
  doc: CanvasDocument;
  prefs: CanvasPrefs;
  canUndo: boolean;
  canRedo: boolean;
}

const DEFAULT_PREFS: CanvasPrefs = {
  tool: 'brush',
  colour: '#38bdf8',
  width: 4,
  background: '#0b1120',
  exportFormat: 'png',
  fontSize: 28,
  docName: 'kryvex-canvas',
};

const HISTORY_LIMIT = 60;

let doc: CanvasDocument = emptyDocument();
let prefs: CanvasPrefs = { ...DEFAULT_PREFS };
let past: CanvasDocument[] = [];
let future: CanvasDocument[] = [];
let snapshot: CanvasSnapshot = build();
const listeners = new Set<() => void>();

function build(): CanvasSnapshot {
  return { doc, prefs, canUndo: past.length > 0, canRedo: future.length > 0 };
}

function notify(): void {
  snapshot = build();
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): CanvasSnapshot {
  return snapshot;
}

export function useCanvas(): CanvasSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Replaces the sheet. `history` is true for a drawn mark and false for a
 * preference-like change, so undo never walks back over a colour switch.
 */
export function updateDoc(
  recipe: (current: CanvasDocument) => CanvasDocument,
  options: { history?: boolean } = {},
): void {
  const next = recipe(doc);
  if (next === doc) return;
  if (options.history !== false) {
    past = [...past.slice(-HISTORY_LIMIT + 1), doc];
    future = [];
  }
  doc = next;
  notify();
}

export function updatePrefs(patch: Partial<CanvasPrefs>): void {
  prefs = { ...prefs, ...patch };
  notify();
}

export function undo(): void {
  const previous = past[past.length - 1];
  if (!previous) return;
  past = past.slice(0, -1);
  future = [doc, ...future].slice(0, HISTORY_LIMIT);
  doc = previous;
  notify();
}

export function redo(): void {
  const [next, ...rest] = future;
  if (!next) return;
  future = rest;
  past = [...past, doc].slice(-HISTORY_LIMIT);
  doc = next;
  notify();
}

/** Loading a file starts a fresh history: the old steps describe another sheet. */
export function replaceDoc(value: unknown): boolean {
  const parsed = readDocument(value);
  if (!parsed) return false;
  doc = parsed;
  past = [];
  future = [];
  notify();
  return true;
}

/** A new sheet keeps the preferences and clears the history. */
export function resetDoc(width: number, height: number): void {
  doc = emptyDocument(width, height, prefs.background);
  past = [];
  future = [];
  notify();
}
