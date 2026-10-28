import { describe, expect, it } from 'vitest';
import {
  COUCH_SEATS,
  KEYBOARD_MAPS,
  applyControlKey,
  assignSeat,
  claimFromPads,
  claimSeat,
  codesFromKey,
  codesOfLayouts,
  couchIsActive,
  deviceFromDescriptor,
  emptySeats,
  firstFreeSeat,
  freeSeat,
  keysOfLayout,
  keyboardLayouts,
  padFromKeys,
  releaseSeat,
  seatDescriptor,
  seatFrames,
  seatOfDevice,
  seatOfOwner,
} from '../src/lib/couch';
import { NETPLAY_PAD_BUTTONS } from '../src/lib/netplay';

/** The smallest object `claimFromPads` and `seatFrames` read. */
function pad(index: number, pressed: number[] = [], axes: number[] = [0, 0]): Gamepad {
  return {
    id: `pad-${index}`,
    index,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes,
    buttons: Array.from({ length: 17 }, (_, button) => ({
      pressed: pressed.includes(button),
      touched: pressed.includes(button),
      value: pressed.includes(button) ? 1 : 0,
    })),
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

describe('couch seats', () => {
  it('starts with four free seats numbered like the core numbers players', () => {
    const seats = emptySeats();
    expect(seats).toHaveLength(COUCH_SEATS);
    expect(seats.map(seat => seat.seat)).toEqual([1, 2, 3, 4]);
    expect(seats.every(seat => seat.device === null)).toBe(true);
    expect(freeSeat(seats)?.seat).toBe(1);
  });

  it('binds a device to one seat and never leaves it bound twice', () => {
    const padDevice = { kind: 'pad' as const, index: 0, id: 'pad-0' };
    let seats = claimSeat(emptySeats(), 1, padDevice);
    expect(seatOfDevice(seats, padDevice)?.seat).toBe(1);

    // Player 2 claims the same controller: it moves, it does not appear twice.
    seats = claimSeat(seats, 2, padDevice);
    expect(seats[0]?.device).toBeNull();
    expect(seatOfDevice(seats, padDevice)?.seat).toBe(2);
    expect(freeSeat(seats)?.seat).toBe(1);
  });

  it('does not disturb a seat nothing is claiming', () => {
    const seats = claimSeat(emptySeats(), 1, { kind: 'pad', index: 0, id: 'pad-0' });
    const after = claimSeat(seats, 3, { kind: 'pad', index: 2, id: 'pad-2' });
    expect(after[0]?.device).toEqual({ kind: 'pad', index: 0, id: 'pad-0' });
    expect(after[3]?.device).toBeNull();
    expect(releaseSeat(after, 3)[2]?.device).toBeNull();
  });

  it('binds the pad whose owner just pressed a button', () => {
    const before = [pad(0), pad(1)];
    const after = [pad(0), pad(1, [0])];
    expect(claimFromPads(before, after, [])).toBe(1);
    // A pad that was already held when the panel opened cannot claim by doing
    // nothing; only a new press counts.
    expect(claimFromPads([pad(0, [0])], [pad(0, [0])], [])).toBeNull();
    // A pad already bound to a seat is skipped for the next player.
    expect(claimFromPads(before, after, [1])).toBeNull();
  });
});

describe('keyboards as seats', () => {
  it('gives every seat its own corner of one keyboard', () => {
    const bed = new Set(['KeyJ', 'ArrowRight']);
    const first = padFromKeys(bed, 'wasd');
    const second = padFromKeys(bed, 'arrows');
    // J is a button for the WASD seat and nothing at all for the arrows seat,
    // which is what lets two people hold their own keys at the same time.
    expect(first.buttons).toBe(1 << NETPLAY_PAD_BUTTONS.indexOf('A'));
    expect(second.buttons).toBe(1 << NETPLAY_PAD_BUTTONS.indexOf('Right'));
    expect(second.axesX).toBe(1);
  });

  it('moves the stick with the d-pad so a stick-only game can be played', () => {
    const held = new Set(['KeyD', 'KeyA']);
    const frame = padFromKeys(held, 'wasd');
    expect(frame.axesX).toBe(0);
    expect(padFromKeys(new Set(['KeyD']), 'wasd').axesX).toBe(1);
    expect(padFromKeys(new Set(['KeyS']), 'wasd').axesY).toBe(1);
  });

  it('maps one code to one button in every keyset', () => {
    for (const layout of keyboardLayouts()) {
      const codes = KEYBOARD_MAPS[layout];
      expect(codes).toHaveLength(NETPLAY_PAD_BUTTONS.length);
      expect(new Set(codes).size).toBe(codes.length);
      expect(keysOfLayout(layout)).toHaveLength(codes.length);
    }
  });

  it('only listens for the codes its seats own', () => {
    const codes = codesOfLayouts(['wasd']);
    expect(codes.has('KeyW')).toBe(true);
    expect(codes.has('ArrowUp')).toBe(false);
    expect(codesOfLayouts(['wasd', 'arrows']).has('ArrowUp')).toBe(true);
  });
});

describe('seats assigned across the room', () => {
  it('describes a device as a string one machine can send another', () => {
    expect(seatDescriptor(null)).toBe('');
    expect(seatDescriptor({ kind: 'keyboard', layout: 'arrows' })).toBe('keyboard:arrows');
    expect(seatDescriptor({ kind: 'pad', index: 0, id: 'x' })).toBe('pad:0');
    expect(deviceFromDescriptor('keyboard:arrows')).toEqual({ kind: 'keyboard', layout: 'arrows' });
    // A pad index only means something to the machine that owns it, so the shape
    // travels and the receiver binds its own controller to that number.
    expect(deviceFromDescriptor('pad:2')).toMatchObject({ kind: 'pad', index: 2 });
    for (const bad of ['', 'keyboard:', 'pad:-1', 'pad:99', 'mouse:0', null, 7]) {
      expect(deviceFromDescriptor(bad)).toBeNull();
    }
  });

  it('puts a member in a seat, and can take it back', () => {
    let seats = assignSeat(emptySeats(), 2, 'keyboard:arrows', 'peer-b', 'XiØN');
    expect(seats[1]?.device).toEqual({ kind: 'keyboard', layout: 'arrows' });
    expect(seats[1]?.owner).toBe('peer-b');
    expect(seatOfOwner(seats, 'peer-b')?.seat).toBe(2);
    // Releasing leaves the seat free rather than deleting it.
    seats = assignSeat(seats, 2, '', 'peer-b');
    expect(seats[1]?.device).toBeNull();
    expect(seats).toHaveLength(COUCH_SEATS);
    // A descriptor this build does not know cannot squat in a seat.
    expect(assignSeat(seats, 3, 'keyboard:piano', 'peer-c')[2]?.device).toBeNull();
    // Seats 1 and 2 are free again; the hub hands out the lowest one.
    expect(firstFreeSeat(seats)?.seat).toBe(1);
    expect(freeSeat(seats)?.seat).toBe(1);
  });

  it('gives a controlling peer the keys its own keyboard sends', () => {
    expect(codesFromKey('a')).toEqual(['KeyA']);
    expect(codesFromKey('A')).toEqual(['KeyA']);
    expect(codesFromKey(' ')).toEqual(['Space']);
    expect(codesFromKey('ArrowLeft')).toEqual(['ArrowLeft']);
    expect(codesFromKey('1')).toEqual(['Digit1', 'Numpad1']);
    expect(codesFromKey('Enter')).toEqual(['Enter', 'NumpadEnter']);
    expect(codesFromKey('F13')).toEqual([]);
    expect(codesFromKey('')).toEqual([]);
  });

  it('holds a remote key until it is released', () => {
    const held = new Map<number, Set<string>>();
    expect(applyControlKey(held, 2, 'ArrowRight', true)).toBe(true);
    expect(held.get(2)?.has('ArrowRight')).toBe(true);
    expect(applyControlKey(held, 2, 'ArrowRight', false)).toBe(true);
    expect(held.get(2)?.has('ArrowRight')).toBe(false);
    // A key nobody can place allocates nothing.
    expect(applyControlKey(held, 3, 'F13', true)).toBe(false);
    expect(held.has(3)).toBe(false);
  });
});

describe('seat frames', () => {
  it('leaves a free seat neutral and fills a bound one', () => {
    const seats = claimSeat(emptySeats(), 2, { kind: 'pad', index: 0, id: 'pad-0' });
    const frames = seatFrames(seats, { pads: [pad(0, [3], [0.5, -0.5])], held: new Set() });
    expect(frames).toHaveLength(COUCH_SEATS);
    expect(frames[0]).toEqual({ buttons: 0, axesX: 0, axesY: 0 });
    expect(frames[1]?.buttons).toBe(1 << 3);
    expect(frames[1]?.axesX).toBe(0.5);
    expect(frames[1]?.axesY).toBe(-0.5);
    expect(couchIsActive(seats)).toBe(false);
  });

  it('merges a controlling peer’s keys into their seat', () => {
    let seats = claimSeat(emptySeats(), 1, { kind: 'keyboard', layout: 'wasd' });
    seats = assignSeat(seats, 2, 'keyboard:arrows', 'peer-b', 'XiØN');
    const remote = new Map<number, Set<string>>([[2, new Set(['ArrowRight'])]]);
    const frames = seatFrames(seats, {
      pads: [],
      held: new Set(['KeyW']),
      remote,
    });
    // Player 1's own keys, and player 2's room-controlled key, side by side.
    expect(frames[0]?.buttons).toBe(1 << NETPLAY_PAD_BUTTONS.indexOf('Up'));
    expect(frames[1]?.buttons).toBe(1 << NETPLAY_PAD_BUTTONS.indexOf('Right'));
    expect(frames[1]?.axesX).toBe(1);
    // The same seat with nothing held remotely is neutral, not stale.
    const idle = seatFrames(seats, { pads: [], held: new Set(), remote: new Map() });
    expect(idle[1]?.buttons).toBe(0);
  });

  it('is a real co-op session once two seats are bound', () => {
    let seats = claimSeat(emptySeats(), 1, { kind: 'keyboard', layout: 'wasd' });
    seats = claimSeat(seats, 2, { kind: 'keyboard', layout: 'arrows' });
    expect(couchIsActive(seats)).toBe(true);
    const frames = seatFrames(seats, { pads: [], held: new Set(['ArrowLeft']) });
    expect(frames[0]?.buttons).toBe(0);
    expect(frames[1]?.buttons).toBe(1 << NETPLAY_PAD_BUTTONS.indexOf('Left'));
  });
});
