/**
 * Emulator link play ("netplay") rules.
 *
 * Two Kryvex copies run the same cartridge and exchange two things over the
 * room the rest of Kryvex already uses: the host's two controller frames and a
 * periodic save state. The host is authoritative — its state is the one both
 * cores restore — so the guests never drift for long even if a packet is late.
 *
 * A pad is a 16-bit mask in W3C "standard" gamepad order plus two stick axes.
 * That is the one shape EmulatorJS itself reads, so no core-specific mapping
 * table has to be kept in sync with an upstream release.
 */

export type NetplayPad = {
  /** Standard-mapping buttons, bit 0 = A … bit 15 = D-pad right. */
  buttons: number;
  /** Left stick, already clamped to -1…1. */
  axesX: number;
  axesY: number;
};

export const NETPLAY_PAD_BUTTONS = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'Select',
  'Start',
  'L3',
  'R3',
  'Up',
  'Down',
  'Left',
  'Right',
] as const;

export const NEUTRAL_PAD: NetplayPad = { buttons: 0, axesX: 0, axesY: 0 };

/** EmulatorJS names the cartridge core, not the console, in its own state. */
export const MAX_NETPLAY_ROM_BYTES = 16 * 1024 * 1024;
/** About 16 KB of base64 per message, inside every transport's chunk budget. */
export const NETPLAY_ROM_CHUNK_BYTES = 12 * 1024;
/** A held button still needs a heartbeat: the other side has no other clock. */
export const NETPLAY_PAD_HEARTBEAT_MS = 250;
/** How often the host hands the guest a fresh state to restore. */
export const NETPLAY_STATE_INTERVAL_MS = 1500;

function clampAxis(value: unknown): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(-1, Math.min(1, number));
}

/**
 * One frame from a real controller.
 *
 * `value` is read as well as `pressed` because analogue triggers report a
 * pressed flag only past their threshold; a half-pulled trigger is still input.
 */
export function padFromGamepad(pad: Gamepad | null | undefined): NetplayPad {
  if (!pad || pad.connected === false) return { ...NEUTRAL_PAD };
  let buttons = 0;
  for (let index = 0; index < NETPLAY_PAD_BUTTONS.length; index += 1) {
    const button = pad.buttons[index];
    if (!button) continue;
    if (button.pressed || (typeof button.value === 'number' && button.value > 0.5)) {
      buttons |= 1 << index;
    }
  }
  return {
    buttons,
    axesX: clampAxis(pad.axes[0]),
    axesY: clampAxis(pad.axes[1]),
  };
}

/** The first connected controller in standard mapping, if the shell sees one. */
export function pickLocalPad(
  pads: ReadonlyArray<Gamepad | null | undefined> | null | undefined,
): Gamepad | null {
  if (!pads) return null;
  for (const pad of pads) {
    if (!pad || pad.connected === false) continue;
    // A non-standard mapping cannot be packed into 16 bits without guessing.
    if (pad.mapping && pad.mapping !== 'standard') continue;
    return pad;
  }
  return null;
}

/** Change detection for the wire: equal frames do not need a second packet. */
export function samePad(a: NetplayPad, b: NetplayPad): boolean {
  return a.buttons === b.buttons && a.axesX === b.axesX && a.axesY === b.axesY;
}

export function padIsNeutral(pad: NetplayPad): boolean {
  return samePad(pad, NEUTRAL_PAD);
}

/** Applied to an incoming payload before it reaches a core. */
export function sanitizePad(raw: unknown): NetplayPad {
  if (!raw || typeof raw !== 'object') return { ...NEUTRAL_PAD };
  const frame = raw as Record<string, unknown>;
  const buttons =
    typeof frame.buttons === 'number' && Number.isFinite(frame.buttons)
      ? Math.max(0, Math.min(0xffff, Math.floor(frame.buttons)))
      : 0;
  return {
    buttons,
    axesX: clampAxis(frame.axesX),
    axesY: clampAxis(frame.axesY),
  };
}

function binaryToBase64(bytes: Uint8Array): string {
  let binary = '';
  // `apply` with tens of thousands of arguments overflows the stack; step.
  const step = 0x2000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

function base64ToBinary(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * A cartridge is sent as numbered base64 chunks, because the action payload is
 * JSON and a multi-megabyte string is what both the transport and the main
 * thread handle worst. Every chunk says which index it is, so a lost one is a
 * retry rather than a corrupt core.
 */
export function splitRom(
  buffer: ArrayBuffer,
  chunkBytes: number = NETPLAY_ROM_CHUNK_BYTES,
): string[] {
  const bytes = new Uint8Array(buffer);
  const size = Math.max(1, Math.floor(chunkBytes));
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += size) {
    chunks.push(binaryToBase64(bytes.subarray(offset, offset + size)));
  }
  return chunks;
}

/**
 * Rebuild a cartridge from whatever arrived. Returns null until every chunk is
 * present, so a guest never starts a core with half a ROM.
 */
export function joinRom(chunks: ReadonlyArray<string | null | undefined>): Uint8Array | null {
  if (chunks.length === 0) return null;
  const parts: Uint8Array[] = [];
  let total = 0;
  for (const chunk of chunks) {
    if (typeof chunk !== 'string' || chunk.length === 0) return null;
    let part: Uint8Array;
    try {
      part = base64ToBinary(chunk);
    } catch {
      return null;
    }
    parts.push(part);
    total += part.length;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

export function romFitsNetplay(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_NETPLAY_ROM_BYTES;
}

/** The pad that a client should show beside a seat, for the panel's own copy. */
export function describePad(pad: NetplayPad): string {
  const held = NETPLAY_PAD_BUTTONS.filter((_, index) => (pad.buttons & (1 << index)) !== 0);
  return held.length > 0 ? held.join(' + ') : '—';
}
