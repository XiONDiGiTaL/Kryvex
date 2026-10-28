import { describe, expect, it } from 'vitest';
import {
  MAX_NETPLAY_ROM_BYTES,
  NEUTRAL_PAD,
  NETPLAY_PAD_BUTTONS,
  joinRom,
  padFromGamepad,
  padIsNeutral,
  pickLocalPad,
  romFitsNetplay,
  samePad,
  sanitizePad,
  shouldSendCartridge,
  splitRom,
} from '../src/lib/netplay';
import { emulatorHostDocument } from '../src/lib/emulator';

/** The smallest object that answers like a standard Gamepad. */
function pad(
  pressed: number[],
  axes: [number, number] = [0, 0],
  overrides: Partial<Gamepad> = {},
): Gamepad {
  const buttons = Array.from({ length: 16 }, (_, index) => ({
    pressed: pressed.includes(index),
    touched: pressed.includes(index),
    value: pressed.includes(index) ? 1 : 0,
  }));
  return {
    id: 'test pad',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes,
    buttons,
    hapticActuators: [],
    vibrationActuator: null,
    ...overrides,
  } as unknown as Gamepad;
}

describe('netplay pads', () => {
  it('packs buttons in W3C standard order', () => {
    expect(NETPLAY_PAD_BUTTONS[0]).toBe('A');
    expect(NETPLAY_PAD_BUTTONS[9]).toBe('Start');
    expect(NETPLAY_PAD_BUTTONS[15]).toBe('Right');
    expect(padFromGamepad(pad([])).buttons).toBe(0);
    expect(padFromGamepad(pad([0])).buttons).toBe(1);
    expect(padFromGamepad(pad([1])).buttons).toBe(2);
    expect(padFromGamepad(pad([0, 9, 15])).buttons).toBe(1 | (1 << 9) | (1 << 15));
  });

  it('treats an analogue trigger past half as pressed', () => {
    const trigger = pad([]);
    (trigger.buttons as GamepadButton[])[6] = {
      pressed: false,
      touched: true,
      value: 0.9,
    } as GamepadButton;
    expect(padFromGamepad(trigger).buttons & (1 << 6)).toBeTruthy();
  });

  it('returns neutral for a missing or disconnected pad', () => {
    expect(padFromGamepad(null)).toEqual(NEUTRAL_PAD);
    expect(padFromGamepad(pad([], [0, 0], { connected: false }))).toEqual(NEUTRAL_PAD);
  });

  it('clamps stick axes and ignores a missing axis', () => {
    expect(padFromGamepad(pad([], [4, -4])).axesX).toBe(1);
    expect(padFromGamepad(pad([], [4, -4])).axesY).toBe(-1);
    expect(padFromGamepad({ ...pad([]), axes: [] } as unknown as Gamepad).axesX).toBe(0);
  });

  it('picks the first connected standard controller', () => {
    const legacy = pad([], [0, 0], { mapping: 'xinput' as GamepadMappingType });
    expect(pickLocalPad([null, legacy, pad([3])])?.mapping).toBe('standard');
    expect(pickLocalPad([null, undefined])).toBeNull();
    expect(pickLocalPad(null)).toBeNull();
  });

  it('compares frames for the wire', () => {
    expect(samePad({ buttons: 1, axesX: 0, axesY: 0 }, { buttons: 1, axesX: 0, axesY: 0 })).toBe(
      true,
    );
    expect(samePad({ buttons: 1, axesX: 0, axesY: 0 }, { buttons: 1, axesX: 0.5, axesY: 0 })).toBe(
      false,
    );
    expect(padIsNeutral(NEUTRAL_PAD)).toBe(true);
  });

  it('sanitises incoming payloads instead of trusting them', () => {
    expect(sanitizePad(null)).toEqual(NEUTRAL_PAD);
    expect(sanitizePad({ buttons: -4, axesX: 9, axesY: -9 })).toEqual({
      buttons: 0,
      axesX: 1,
      axesY: -1,
    });
    expect(sanitizePad({ buttons: 0xffff + 10 }).buttons).toBe(0xffff);
    expect(sanitizePad({ buttons: Number.NaN }).buttons).toBe(0);
    expect(sanitizePad({ buttons: 'up' }).buttons).toBe(0);
  });
});

describe('netplay cartridge transfer', () => {
  const rom = new Uint8Array(64 * 1024 + 7);
  for (let index = 0; index < rom.length; index += 1) rom[index] = index % 251;

  it('splits a cartridge into ordered base64 chunks and rebuilds it exactly', () => {
    const chunks = splitRom(rom.buffer, 12 * 1024);
    expect(chunks.length).toBe(6);
    expect(chunks.every(chunk => chunk.length > 0)).toBe(true);
    const rebuilt = joinRom(chunks);
    expect(rebuilt).not.toBeNull();
    expect(rebuilt!.length).toBe(rom.length);
    expect(Array.from(rebuilt!.subarray(0, 8))).toEqual(Array.from(rom.subarray(0, 8)));
    expect(Array.from(rebuilt!.subarray(-8))).toEqual(Array.from(rom.subarray(-8)));
  });

  it('waits for every chunk rather than starting a core with half a ROM', () => {
    const chunks = splitRom(rom.buffer, 12 * 1024);
    const holey: (string | null)[] = [...chunks];
    holey[2] = null;
    expect(joinRom(holey)).toBeNull();
    expect(joinRom([])).toBeNull();
    expect(joinRom(['not base64!'])).toBeNull();
  });

  it('keeps link play inside the same size ceiling as the cartridge slot', () => {
    expect(romFitsNetplay(0)).toBe(false);
    expect(romFitsNetplay(1024)).toBe(true);
    expect(romFitsNetplay(MAX_NETPLAY_ROM_BYTES)).toBe(true);
    expect(romFitsNetplay(MAX_NETPLAY_ROM_BYTES + 1)).toBe(false);
  });
});

describe('emulator frame netplay hooks', () => {
  const doc = emulatorHostDocument();

  it('accepts both seats and restores the previous gamepad handler', () => {
    expect(doc).toContain("data.type === 'kryvex-netplay'");
    expect(doc).toContain('installNetplayInput');
    expect(doc).toContain('netplayPads = null');
    expect(doc).toContain("post('kryvex-netplay-state'");
    expect(doc).toContain('netplayRestore');
  });

  it('sends the cartridge once per peer, and again only when asked', () => {
    // The two machines may open the link in either order, and a guest repeats
    // its hello until the cartridge arrives. The host has to answer the first
    // one without shipping the ROM again for every repeat.
    expect(shouldSendCartridge('hello', 'peer-a', null)).toBe(true);
    expect(shouldSendCartridge('hello', 'peer-a', 'peer-a')).toBe(false);
    // A different machine is a different transfer.
    expect(shouldSendCartridge('hello', 'peer-b', 'peer-a')).toBe(true);
    // An explicit ask means the first transfer did not arrive.
    expect(shouldSendCartridge('ask', 'peer-a', 'peer-a')).toBe(true);
  });

  it('shapes a pad the way a standard gamepad is read', () => {
    expect(doc).toContain("mapping: 'standard'");
    expect(doc).toContain('hapticActuators: []');
    expect(doc).toContain('for (var button = 0; button < 16; button += 1)');
  });
});
