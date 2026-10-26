/**
 * Dragging a service card onto the sidebar's pinned rail.
 *
 * A custom MIME type keeps the drop target from reacting to a text selection or
 * a file dragged in from the desktop. `getData` is unreadable during `dragover`
 * in every browser, so the target checks `types` while the drag is in flight and
 * reads the id only on drop.
 */
export const SERVICE_DRAG_TYPE = 'application/x-kryvex-service';

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
