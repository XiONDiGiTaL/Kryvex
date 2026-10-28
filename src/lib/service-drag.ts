/**
 * Dragging a service card onto the sidebar's pinned rail.
 *
 * A custom MIME type keeps the drop target from reacting to a text selection or
 * a file dragged in from the desktop. `getData` is unreadable during `dragover`
 * in every browser, so the target checks `types` while the drag is in flight and
 * reads the id only on drop.
 */
import { isSecretToolId } from './secret-tools';
import { isViewWindowId, type ViewWindowId } from './tool-windows';
import type { SecretToolId } from '../types';

export const SERVICE_DRAG_TYPE = 'application/x-kryvex-service';

/**
 * A built-in tool dragged out of the pinned rail.
 *
 * A tool has no service record, so it cannot ride the service payload: the pin
 * drop target would try to pin an id nothing owns. Its own type keeps the two
 * gestures apart at the target, which is also what lets the rail ignore a tool
 * drag while the canvas accepts it.
 */
export const TOOL_DRAG_TYPE = 'application/x-kryvex-tool';

export function isToolDrag(transfer: DataTransfer | null): boolean {
  if (!transfer) return false;
  return Array.from(transfer.types).includes(TOOL_DRAG_TYPE);
}

/** The tool a drag carries, or null when the id is not one this build knows. */
export function readToolDrag(transfer: DataTransfer | null): SecretToolId | null {
  if (!transfer) return null;
  const tool = transfer.getData(TOOL_DRAG_TYPE);
  return isSecretToolId(tool) ? tool : null;
}

/**
 * A built-in view (today: Rooms) dragged out of its own route.
 *
 * A view is neither a service nor a tool: it has no URL, no partition and no
 * card on the Services page. It needed its own type because the canvas has to
 * tell a room dropped from the Rooms header apart from a pinned service.
 */
export const VIEW_DRAG_TYPE = 'application/x-kryvex-view';

export function isViewDrag(transfer: DataTransfer | null): boolean {
  if (!transfer) return false;
  return Array.from(transfer.types).includes(VIEW_DRAG_TYPE);
}

/** The view a drag carries, or null when this build does not know it. */
export function readViewDrag(transfer: DataTransfer | null): ViewWindowId | null {
  if (!transfer) return null;
  const view = transfer.getData(VIEW_DRAG_TYPE);
  return isViewWindowId(view) ? view : null;
}

export function isServiceDrag(transfer: DataTransfer | null): boolean {
  if (!transfer) return false;
  return Array.from(transfer.types).includes(SERVICE_DRAG_TYPE);
}

export function readServiceDrag(transfer: DataTransfer | null): string | null {
  if (!transfer) return null;
  const id = transfer.getData(SERVICE_DRAG_TYPE);
  return id && id.length <= 120 ? id : null;
}

/**
 * The effect a surface may ask for, given what the drag source allows.
 *
 * The browser intersects what a drop target requests with the source's
 * `effectAllowed`, and a target that asks for something the source never
 * offered gets no drop at all: the `drop` event is simply not dispatched. A
 * pinned row is the awkward one — the same drag reorders the row where it
 * stands (`move`) or opens the service on the Workspace canvas (`copy`) — so a
 * canvas that insisted on `copy` silently ignored every drag started there.
 *
 * Asking for an effect the source permits is therefore the whole rule: prefer
 * the copy a service drop means, fall back to the move the source offers, and
 * say nothing when neither is allowed so the browser keeps its own default.
 */
export function serviceDropEffect(effectAllowed: string): 'copy' | 'move' | null {
  // `copyMove`, `linkMove` … the values are camel case, so compare in one case.
  const allowed = effectAllowed.toLowerCase();
  if (allowed === 'uninitialized' || allowed === 'all') return 'copy';
  if (allowed.includes('copy')) return 'copy';
  if (allowed.includes('move')) return 'move';
  return null;
}

/** Asks for the effect above, and stays quiet when the source refuses both. */
export function requestServiceDropEffect(transfer: DataTransfer | null): void {
  if (!transfer) return;
  const effect = serviceDropEffect(transfer.effectAllowed);
  if (effect) transfer.dropEffect = effect;
}
