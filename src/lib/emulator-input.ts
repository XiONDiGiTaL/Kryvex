/**
 * The host's route from a granted peer's keyboard to a couch seat.
 *
 * Room control already forwards pointer and key events from the one peer the
 * host allowed, and Rooms injects them into the shared `<webview>`. That misses
 * the emulator: it is a Kryvex view, not a guest page, so there is nothing for
 * `sendInputEvent` to address. A viewer who asks for control of a shared
 * emulator therefore typed into nothing.
 *
 * This module is the seam. Rooms offers every granted event here first; when a
 * sink is installed and takes the event, it is the emulator's and no webview sees
 * it. When no emulator is mounted, or the host is sharing a service instead, the
 * sink takes nothing and the existing path runs untouched.
 *
 * One sink, because one emulator can be mounted: the tool is single-instance, so
 * two panels can never both claim the same keys.
 */

export interface SeatInputEvent {
  kind: 'key';
  key: string;
  phase: 'down' | 'up';
}

export type SeatInputSink = (event: SeatInputEvent) => boolean;

let sink: SeatInputSink | null = null;

/**
 * Installs the emulator's sink and returns the remover.
 *
 * Identity-checked on removal so a remount cannot tear down the sink the next
 * mount installed — the same rule the room's own `onNetplay` follows.
 */
export function setSeatInputSink(next: SeatInputSink): () => void {
  sink = next;
  return () => {
    if (sink === next) sink = null;
  };
}

/** True when the emulator consumed the event and no guest should see it. */
export function routeSeatInput(event: SeatInputEvent): boolean {
  if (!sink) return false;
  try {
    return sink(event);
  } catch {
    return false;
  }
}

/** Whether anything is listening; used by the panel's own copy. */
export function hasSeatInputSink(): boolean {
  return sink !== null;
}
