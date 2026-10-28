/**
 * Couch co-op: one shared screen, one seat per player.
 *
 * Kryvex runs the game in one machine and the room carries input, so four
 * people can sit at one screen with their own controller or their own corner of
 * one keyboard. The hard part is not carrying the buttons — the room already
 * does that — it is knowing *whose* buttons they are:
 *
 * - a pad is bound by index, and `navigator.getGamepads()` lists a pad whether
 *   or not its owner is touching it, so a seat has to be claimed rather than
 *   guessed. `claimFromPads` compares two snapshots and returns the pad whose
 *   owner just pressed something;
 * - a keyboard has no index at all. One keyboard is four keysets, so each seat
 *   owns a non-overlapping set of `KeyboardEvent.code` values and two players
 *   can hold Left at the same time without either one seeing the other's key;
 * - seat 1 is never reassigned by another player's claim, so the person who
 *   was already playing cannot lose their controls mid-game.
 *
 * Everything here is pure: the panel owns the listeners, this file owns the
 * rules. See docs/COUCH_COOP.md for why this is done inside the emulator rather
 * than with a virtual gamepad driver.
 */
import { NEUTRAL_PAD, NETPLAY_PAD_BUTTONS, type NetplayPad } from './netplay';

/** Four is the pad count every core Kryvex offers exposes. */
export const COUCH_SEATS = 4;

/**
 * The keysets a seat can own, in the order the panel lists them.
 *
 * Every entry maps the core's button order to a `KeyboardEvent.code`, so the
 * mapping is layout-independent: `KeyW` is the key where W sits on a US board,
 * which is what a player means when they say "the W key", and it does not move
 * when the OS keyboard layout changes.
 */
export type KeyboardLayout = 'wasd' | 'arrows' | 'ijkl' | 'numpad';

/** Pad button index → `KeyboardEvent.code`, in `NETPLAY_PAD_BUTTONS` order. */
export const KEYBOARD_MAPS: Readonly<Record<KeyboardLayout, ReadonlyArray<string>>> = {
  // Player 1's usual corner: move with W A S D, act with J K U I.
  wasd: [
    'KeyJ', // A
    'KeyK', // B
    'KeyU', // X
    'KeyI', // Y
    'KeyQ', // LB
    'KeyE', // RB
    'KeyR', // LT
    'KeyT', // RT
    'ShiftRight', // Select
    'Space', // Start
    'KeyZ', // L3
    'KeyX', // R3
    'KeyW', // Up
    'KeyS', // Down
    'KeyA', // Left
    'KeyD', // Right
  ],
  // The right-hand corner of the same board: arrows to move, numpad to act.
  arrows: [
    'Numpad1', // A
    'Numpad2', // B
    'Numpad4', // X
    'Numpad5', // Y
    'Numpad7', // LB
    'Numpad9', // RB
    'Numpad8', // LT
    'NumpadAdd', // RT
    'NumpadDecimal', // Select
    'NumpadEnter', // Start
    'NumpadDivide', // L3
    'NumpadMultiply', // R3
    'ArrowUp', // Up
    'ArrowDown', // Down
    'ArrowLeft', // Left
    'ArrowRight', // Right
  ],
  // A laptop board with no numpad: I J K L to move, N M Y U to act. Every code
  // appears once, so a held direction and a held shoulder never collide.
  ijkl: [
    'KeyN', // A
    'KeyM', // B
    'KeyY', // X
    'KeyU', // Y
    'KeyG', // LB
    'KeyH', // RB
    'KeyT', // LT
    'KeyB', // RT
    'Comma', // Select
    'Period', // Start
    'KeyV', // L3
    'KeyC', // R3
    'KeyI', // Up
    'KeyK', // Down
    'KeyJ', // Left
    'KeyL', // Right
  ],
  // A real numpad for a second player on a full-size board.
  numpad: [
    'Numpad4', // A
    'Numpad5', // B
    'Numpad7', // X
    'Numpad8', // Y
    'NumpadDivide', // LB
    'NumpadMultiply', // RB
    'NumpadSubtract', // LT
    'NumpadAdd', // RT
    'NumpadDecimal', // Select
    'NumpadEnter', // Start
    'Numpad0', // L3
    'Numpad1', // R3
    'Numpad9', // Up
    'Numpad3', // Down
    'Numpad6', // Left
    'Numpad2', // Right
  ],
};

/**
 * The codes of one keyset, without duplicates.
 *
 * A key that meant two buttons at once would fire both, which a player would
 * notice immediately, so the maps above are written with unique codes and this
 * keeps that true for anything added later.
 */
export function keysOfLayout(layout: KeyboardLayout): ReadonlyArray<string> {
  const map = KEYBOARD_MAPS[layout] ?? [];
  const seen = new Set<string>();
  return map.filter(code => {
    if (seen.has(code)) return false;
    seen.add(code);
    return true;
  });
}

export function keyboardLayouts(): KeyboardLayout[] {
  return ['wasd', 'arrows', 'ijkl', 'numpad'];
}

/**
 * A seat's device as one string, for the room.
 *
 * A pad index only means something on the machine that owns it, so what travels
 * is the shape: `pad:0` says "my first controller", and the receiving machine
 * binds whichever controller its own player means. A keyboard travels by layout,
 * because the keyset is the thing both machines can agree on.
 */
export function seatDescriptor(device: SeatDevice | null): string {
  if (!device) return '';
  if (device.kind === 'keyboard') return `keyboard:${device.layout}`;
  return `pad:${device.index}`;
}

/** The inverse, refusing anything this build does not know. */
export function deviceFromDescriptor(text: unknown): SeatDevice | null {
  if (typeof text !== 'string') return null;
  const [kind, value] = text.split(':');
  if (kind === 'keyboard') {
    return keyboardLayouts().includes(value as KeyboardLayout)
      ? { kind: 'keyboard', layout: value as KeyboardLayout }
      : null;
  }
  if (kind === 'pad') {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index > 15) return null;
    return { kind: 'pad', index, id: `pad ${index}` };
  }
  return null;
}

/**
 * Puts a device in a seat on behalf of somebody else.
 *
 * Null releases the seat. The owner is recorded so the roster can name the
 * player rather than a controller number, and so a later claim by that player
 * does not read as somebody stealing their seat.
 */
export function assignSeat(
  seats: ReadonlyArray<CouchSeat>,
  seat: number,
  descriptor: unknown,
  owner: string,
  name?: string,
): CouchSeat[] {
  const device = deviceFromDescriptor(descriptor);
  const target = seats.find(item => item.seat === seat);
  if (!target) return [...seats];
  if (!device) {
    return seats.map(item => (item.seat === seat ? { ...item, device: null, owner } : item));
  }
  return claimSeat(seats, seat, device, name, owner);
}

/** The seat a room member holds, so the host can address them by seat. */
export function seatOfOwner(
  seats: ReadonlyArray<CouchSeat>,
  owner: string,
): CouchSeat | null {
  return seats.find(seat => seat.owner === owner && seat.device !== null) ?? null;
}

/** The first seat with no device, preferring one nobody has been given. */
export function firstFreeSeat(seats: ReadonlyArray<CouchSeat>): CouchSeat | null {
  return freeSeat(seats);
}

/** How the panel names a layout without a translation key per code. */
export function layoutLabel(layout: KeyboardLayout): string {
  switch (layout) {
    case 'wasd':
      return 'W A S D + J K';
    case 'arrows':
      return 'Arrows + number pad';
    case 'ijkl':
      return 'H J K L + Y U I';
    case 'numpad':
      return 'Number pad only';
    default:
      return layout;
  }
}

export type SeatDevice =
  /** A controller, bound by the index the browser gave it. */
  | { kind: 'pad'; index: number; id: string }
  /** A keyset on the shared keyboard. */
  | { kind: 'keyboard'; layout: KeyboardLayout };

export interface CouchSeat {
  /** 1-based, so it matches the core's own player numbering. */
  seat: number;
  name: string;
  /** Null until the seat is claimed. */
  device: SeatDevice | null;
  /** The room member that controls this seat, or `local`. */
  owner: string;
}

export function emptySeats(): CouchSeat[] {
  return Array.from({ length: COUCH_SEATS }, (_, index) => ({
    seat: index + 1,
    name: `Player ${index + 1}`,
    device: null,
    owner: 'local',
  }));
}

/** The first seat nobody holds, or null when all four are taken. */
export function freeSeat(seats: ReadonlyArray<CouchSeat>): CouchSeat | null {
  return seats.find(seat => seat.device === null) ?? null;
}

/** The seat a device is already bound to, so a claim never double-books one. */
export function seatOfDevice(
  seats: ReadonlyArray<CouchSeat>,
  device: SeatDevice,
): CouchSeat | null {
  return (
    seats.find(seat => {
      if (!seat.device || seat.device.kind !== device.kind) return false;
      if (device.kind === 'pad' && seat.device.kind === 'pad') {
        return seat.device.index === device.index;
      }
      if (device.kind === 'keyboard' && seat.device.kind === 'keyboard') {
        return seat.device.layout === device.layout;
      }
      return false;
    }) ?? null
  );
}

/**
 * Binds a device to a seat.
 *
 * Seat 1 is left alone unless it is the seat being claimed: a later player
 * taking "the free one" must never take the pad the first player is holding,
 * which is the failure mode that makes couch co-op unusable. A device already
 * bound elsewhere moves rather than appearing twice.
 */
export function claimSeat(
  seats: ReadonlyArray<CouchSeat>,
  seat: number,
  device: SeatDevice,
  name?: string,
  owner = 'local',
): CouchSeat[] {
  const target = seats.find(item => item.seat === seat);
  if (!target) return [...seats];
  return seats.map(item => {
    const bound = item.device && sameDevice(item.device, device);
    if (item.seat === seat) {
      return { ...item, device, name: name ?? item.name, owner };
    }
    if (bound) return { ...item, device: null };
    return item;
  });
}

export function releaseSeat(seats: ReadonlyArray<CouchSeat>, seat: number): CouchSeat[] {
  return seats.map(item => (item.seat === seat ? { ...item, device: null } : item));
}

export function sameDevice(a: SeatDevice, b: SeatDevice): boolean {
  if (a.kind === 'pad' && b.kind === 'pad') return a.index === b.index;
  if (a.kind === 'keyboard' && b.kind === 'keyboard') return a.layout === b.layout;
  return false;
}

/**
 * The pad a seat's keyset represents right now.
 *
 * Returns neutral for a seat that owns no keyboard, so the frame it contributes
 * to the room is a real, idle pad rather than a missing one.
 */
export function padFromKeys(
  held: ReadonlySet<string>,
  layout: KeyboardLayout,
): NetplayPad {
  const codes = KEYBOARD_MAPS[layout] ?? [];
  let buttons = 0;
  for (let index = 0; index < NETPLAY_PAD_BUTTONS.length; index += 1) {
    const code = codes[index];
    if (code && held.has(code)) buttons |= 1 << index;
  }
  // A d-pad and a stick are the same input to a core that reads both, so a
  // held direction also moves the stick: a keyboard player can steer a game
  // that only polls the analogue axis.
  const axesX = (held.has(codes[15] ?? '') ? 1 : 0) - (held.has(codes[14] ?? '') ? 1 : 0);
  const axesY = (held.has(codes[13] ?? '') ? 1 : 0) - (held.has(codes[12] ?? '') ? 1 : 0);
  return { buttons, axesX, axesY };
}

/** The `KeyboardEvent.code` a seat owns, for the shell's key listener. */
export function codesOfLayouts(layouts: ReadonlyArray<KeyboardLayout>): Set<string> {
  const codes = new Set<string>();
  for (const layout of layouts) {
    for (const code of keysOfLayout(layout)) codes.add(code);
  }
  return codes;
}

/**
 * Which pad a player just claimed.
 *
 * `before` and `after` are two snapshots of `navigator.getGamepads()`. A pad
 * counts as claimed when a button goes from up to down — a pad that was already
 * held when the panel opened cannot claim by doing nothing — and pads already
 * bound to another seat are skipped in `bound`.
 */
export function claimFromPads(
  before: ReadonlyArray<Gamepad | null>,
  after: ReadonlyArray<Gamepad | null>,
  bound: ReadonlyArray<number>,
): number | null {
  for (let index = 0; index < after.length; index += 1) {
    const pad = after[index];
    if (!pad || pad.connected === false) continue;
    if (bound.includes(index)) continue;
    const previous = before[index];
    const pressedNow = pressedMask(pad);
    if (pressedNow === 0) continue;
    const pressedBefore = previous ? pressedMask(previous) : 0;
    if ((pressedNow & ~pressedBefore) !== 0) return index;
  }
  return null;
}

function pressedMask(pad: Gamepad): number {
  let mask = 0;
  for (let index = 0; index < pad.buttons.length && index < 16; index += 1) {
    const button = pad.buttons[index];
    if (!button) continue;
    if (button.pressed || (typeof button.value === 'number' && button.value > 0.5)) {
      mask |= 1 << index;
    }
  }
  return mask;
}

/**
 * A frame for every seat, filled from this machine's devices.
 *
 * A seat with no device contributes neutral, which keeps every peer's pad list
 * the same length and keeps an unclaimed seat from holding a button down.
 */
export function seatFrames(
  seats: ReadonlyArray<CouchSeat>,
  local: {
    pads: ReadonlyArray<Gamepad | null>;
    held: ReadonlySet<string>;
    /**
     * Keys held by a peer whose control was granted, per seat.
     *
     * A viewer who is watching a shared screen has no core of its own and sends
     * key events rather than pad frames. Those keys belong to the seat the host
     * gave that viewer, and they are merged with the seat's own keyset so a pad
     * and a remote keyboard can drive the same player.
     */
    remote?: ReadonlyMap<number, ReadonlySet<string>>;
  },
): NetplayPad[] {
  const frames: NetplayPad[] = [];
  for (const seat of seats) {
    const device = seat.device;
    if (!device) {
      frames.push({ ...NEUTRAL_PAD });
      continue;
    }
    if (device.kind === 'keyboard') {
      const remote = local.remote?.get(seat.seat);
      if (remote && remote.size > 0) {
        // Union: the local keyset decides which codes count, and any of those a
        // remote player is holding count as held.
        const held = new Set(local.held);
        for (const code of remote) held.add(code);
        frames.push(padFromKeys(held, device.layout));
        continue;
      }
      frames.push(padFromKeys(local.held, device.layout));
      continue;
    }
    const pad = local.pads[device.index] ?? null;
    frames.push(pad ? padToFrame(pad) : { ...NEUTRAL_PAD });
  }
  return frames;
}

/**
 * The `KeyboardEvent.code` a raw key value stands for.
 *
 * Room control forwards `KeyboardEvent.key` — 'a', 'ArrowLeft', ' ' — because
 * that is what the webview injection needs. A seat's keyset is written in
 * `code` values, which is what makes it layout-independent, so the two have to
 * be reconciled here. Ambiguous values return every code they could be, and a
 * value nobody can place returns nothing rather than a guess.
 */
export function codesFromKey(key: unknown): string[] {
  if (typeof key !== 'string' || key.length === 0) return [];
  if (key.length === 1) {
    const lower = key.toLowerCase();
    if (lower >= 'a' && lower <= 'z') return [`Key${lower.toUpperCase()}`];
    if (lower >= '0' && lower <= '9') return [`Digit${lower}`, `Numpad${lower}`];
    switch (key) {
      case ' ':
        return ['Space'];
      case ',':
        return ['Comma'];
      case '.':
        return ['Period'];
      case '+':
        return ['NumpadAdd'];
      case '-':
        return ['NumpadSubtract'];
      case '*':
        return ['NumpadMultiply'];
      case '/':
        return ['NumpadDivide'];
      default:
        return [];
    }
  }
  const named: Record<string, string[]> = {
    ArrowUp: ['ArrowUp'],
    ArrowDown: ['ArrowDown'],
    ArrowLeft: ['ArrowLeft'],
    ArrowRight: ['ArrowRight'],
    Spacebar: ['Space'],
    Enter: ['Enter', 'NumpadEnter'],
    Shift: ['ShiftLeft', 'ShiftRight'],
    Control: ['ControlLeft', 'ControlRight'],
    Alt: ['AltLeft', 'AltRight'],
    Tab: ['Tab'],
    Escape: ['Escape'],
    Backspace: ['Backspace'],
    Delete: ['Delete'],
    Decimal: ['NumpadDecimal'],
  };
  return named[key] ?? [];
}

/**
 * Applies a down or up from a controlling peer to that seat's held set.
 *
 * Returns the same map when the key belongs to no seat, so a stray keypress
 * cannot allocate anything. A key the seat does not own is still recorded: the
 * layout filter happens in `padFromKeys`, which is where it belongs.
 */
export function applyControlKey(
  held: Map<number, Set<string>>,
  seat: number,
  key: unknown,
  down: boolean,
): boolean {
  const codes = codesFromKey(key);
  if (codes.length === 0) return false;
  let bucket = held.get(seat);
  if (!bucket) {
    bucket = new Set<string>();
    held.set(seat, bucket);
  }
  for (const code of codes) {
    if (down) bucket.add(code);
    else bucket.delete(code);
  }
  return true;
}

function padToFrame(pad: Gamepad): NetplayPad {
  let buttons = 0;
  for (let index = 0; index < NETPLAY_PAD_BUTTONS.length; index += 1) {
    const button = pad.buttons[index];
    if (!button) continue;
    if (button.pressed || (typeof button.value === 'number' && button.value > 0.5)) {
      buttons |= 1 << index;
    }
  }
  const clamp = (value: number | undefined): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  return { buttons, axesX: clamp(pad.axes[0]), axesY: clamp(pad.axes[1]) };
}

/** True when at least two seats have a device, which is when co-op is real. */
export function couchIsActive(seats: ReadonlyArray<CouchSeat>): boolean {
  return seats.filter(seat => seat.device !== null).length >= 2;
}
