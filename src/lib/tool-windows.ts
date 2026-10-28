import { isEmbeddableTool } from './secret-tools';
import type { SecretToolId } from '../types';

/**
 * Built-in tools in Workspace windows.
 *
 * A service window is keyed by the service's id, and a tool has no service
 * record, so a tool window carries a prefixed id in the same `WindowMap`. That
 * keeps one set of geometry, clamping, stacking and persistence rules for both
 * kinds of window rather than a second, drifting copy for tools.
 *
 * Every built-in is allowed here. The five that own a session — Lexium, the
 * player, the emulator, Disk pulse and Kryvex Link — are single-instance
 * instead: while one is in a window its route draws a docking card, so a second
 * copy is never mounted behind it. See `isSingletonTool` in `secret-tools.ts`.
 */
export const TOOL_WINDOW_PREFIX = 'tool:';

/**
 * The app's own views that can be popped out into a window.
 *
 * A view is not a service and not a tool: it has no URL, no partition and no
 * secret-services card. What it shares with them is the box — a window that
 * floats over the app, so a reader can watch a room while using another view —
 * which is why it lives in the same `WindowMap` and is drawn by the same board.
 *
 * Only Rooms is here. Lexium, the player, the emulator, Disk pulse and the link
 * all keep a route, and a second copy of any of them would be a second session
 * rather than a second view of one.
 */
export const VIEW_WINDOW_PREFIX = 'view:';

export const VIEW_WINDOW_IDS = ['rooms'] as const;
export type ViewWindowId = (typeof VIEW_WINDOW_IDS)[number];

export function isViewWindowId(value: unknown): value is ViewWindowId {
  return typeof value === 'string' && (VIEW_WINDOW_IDS as readonly string[]).includes(value);
}

export function viewWindowId(view: ViewWindowId): string {
  return `${VIEW_WINDOW_PREFIX}${view}`;
}

/** What a non-service window holds, or null when the id is a service's. */
export type BuiltInWindow =
  | { kind: 'tool'; tool: SecretToolId }
  | { kind: 'view'; view: ViewWindowId };

export function builtInWindowOfId(id: string): BuiltInWindow | null {
  if (id.startsWith(VIEW_WINDOW_PREFIX)) {
    const view = id.slice(VIEW_WINDOW_PREFIX.length);
    return isViewWindowId(view) ? { kind: 'view', view } : null;
  }
  const tool = toolOfWindowId(id);
  return tool ? { kind: 'tool', tool } : null;
}

export function toolWindowId(tool: SecretToolId): string {
  return `${TOOL_WINDOW_PREFIX}${tool}`;
}

export function toolOfWindowId(id: string): SecretToolId | null {
  if (!id.startsWith(TOOL_WINDOW_PREFIX)) return null;
  const tool = id.slice(TOOL_WINDOW_PREFIX.length);
  return isEmbeddableTool(tool) ? tool : null;
}

export function isToolWindowId(id: string): boolean {
  return toolOfWindowId(id) !== null;
}
