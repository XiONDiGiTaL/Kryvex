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
