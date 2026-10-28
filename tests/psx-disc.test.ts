import { describe, expect, it } from 'vitest';
import {
  discSetFromSelection,
  hasRawSync,
  joinDiscFiles,
  layoutForTrackType,
  parseCue,
  sectorsToImage,
  sniffLayout,
} from '../src/lib/psx-disc';

/**
 * A raw MODE1 sector: 12 sync bytes, a 4-byte header, 2048 user bytes, then the
 * ECC tail. Only the user bytes are meant to survive a join.
 */
function mode1Sector(fill: number): Uint8Array {
  const sector = new Uint8Array(2352);
  sector.set([0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00], 0);
  sector[15] = 1;
  sector.fill(fill, 16, 16 + 2048);
  sector.fill(0xaa, 16 + 2048);
  return sector;
}

/** A raw MODE2 Form 1 sector: sync, header, 8-byte subheader, user data at 24. */
function mode2Sector(fill: number): Uint8Array {
  const sector = new Uint8Array(2352);
  sector.set([0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00], 0);
  sector[15] = 2;
  sector.fill(0x20, 16, 24); // subheader
  sector.fill(fill, 24, 24 + 2048);
  return sector;
}

function join(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const all = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    all.set(part, offset);
    offset += part.length;
  }
  return all;
}

const encoder = new TextEncoder();

describe('cue sheets', () => {
  it('reads the track a join needs, and notices audio it cannot carry', () => {
    const sheet = parseCue(
      [
        'FILE "Game (Track 1).bin" BINARY',
        '  TRACK 01 MODE2/2352',
        '    INDEX 01 00:00:00',
        'FILE "Game (Track 2).bin" BINARY',
        '  TRACK 02 AUDIO',
        '    INDEX 01 00:00:00',
      ].join('\r\n'),
    );
    expect(sheet).not.toBeNull();
    expect(sheet?.data?.type).toBe('MODE2/2352');
    expect(sheet?.data?.file).toBe('Game (Track 1).bin');
    expect(sheet?.data?.index01).toBe(0);
    expect(sheet?.hasAudio).toBe(true);
    expect(sheet?.tracks).toHaveLength(2);
  });

  it('keeps a pregap out of the image and refuses a sheet with no data track', () => {
    const withGap = parseCue(
      ['FILE "a.bin" BINARY', 'TRACK 01 MODE1/2352', 'INDEX 00 00:00:00', 'INDEX 01 00:02:00'].join('\n'),
    );
    // 00:02:00 is 150 sectors of pregap at 75 frames per second.
    expect(withGap?.data?.index01).toBe(150);
    expect(parseCue('FILE "a.wav" BINARY\nTRACK 01 AUDIO')).toBeNull();
    expect(parseCue('')).toBeNull();
  });

  it('names a layout for every track type the formats use', () => {
    expect(layoutForTrackType('MODE1/2352')?.userOffset).toBe(16);
    expect(layoutForTrackType('MODE2/2352')?.userOffset).toBe(24);
    expect(layoutForTrackType('MODE1/2048')?.sectorSize).toBe(2048);
    expect(layoutForTrackType('AUDIO')).toBeNull();
  });
});

describe('joining a disc', () => {
  it('keeps the 2048 user bytes of a MODE1 track and drops the rest', () => {
    const track = join([mode1Sector(0x11), mode1Sector(0x22)]);
    const joined = joinDiscFiles([{ name: 'Game.bin', bytes: track }]);
    expect(joined).not.toBeNull();
    expect(joined?.name).toBe('Game.iso');
    expect(joined?.mode).toBe('MODE1/2352');
    expect(joined?.bytes.length).toBe(2 * 2048);
    expect(joined?.bytes[0]).toBe(0x11);
    expect(joined?.bytes[2048]).toBe(0x22);
  });

  it('reads MODE2 user data at offset 24, which is where Form 1 puts it', () => {
    const joined = joinDiscFiles([{ name: 'Game.bin', bytes: mode2Sector(0x33) }]);
    expect(joined?.mode).toBe('MODE2/2352');
    expect(joined?.bytes.length).toBe(2048);
    expect(joined?.bytes[0]).toBe(0x33);
  });

  it('pairs a cue with the bin its own sheet names, not just the first file', () => {
    const cue = encoder.encode(
      ['FILE "Disc (Track 1).bin" BINARY', '  TRACK 01 MODE1/2352', '    INDEX 01 00:00:00'].join('\n'),
    );
    const wrong = join([mode1Sector(0x01)]);
    const right = join([mode1Sector(0x02)]);
    const joined = joinDiscFiles([
      { name: 'Disc.cue', bytes: cue },
      { name: 'Other.bin', bytes: wrong },
      { name: 'Disc (Track 1).bin', bytes: right },
    ]);
    expect(joined?.bytes[0]).toBe(0x02);
    expect(joined?.name).toBe('Disc.iso');
  });

  it('refuses a cue whose track is missing instead of starting on half a disc', () => {
    const cue = encoder.encode('FILE "missing.bin" BINARY\nTRACK 01 MODE1/2352\nINDEX 01 00:00:00');
    expect(joinDiscFiles([{ name: 'Lonely.cue', bytes: cue }])).toBeNull();
    expect(joinDiscFiles([])).toBeNull();
  });

  it('passes an existing .iso through and sniffs a bare track by its own bytes', () => {
    const iso = new Uint8Array(4096);
    iso[0] = 0x7f;
    const passed = joinDiscFiles([{ name: 'Ready.iso', bytes: iso }]);
    expect(passed?.bytes).toBe(iso);
    expect(passed?.mode).toBe('MODE1/2048');

    expect(hasRawSync(mode1Sector(0))).toBe(true);
    expect(sniffLayout(mode1Sector(0))?.mode).toBe('MODE1/2352');
    expect(sniffLayout(mode2Sector(0))?.mode).toBe('MODE2/2352');
    expect(sniffLayout(new Uint8Array(2048))?.mode).toBe('MODE1/2048');
    // A length that divides by no sector size cannot be read as a disc.
    expect(sniffLayout(new Uint8Array(1234))).toBeNull();
  });

  it('empties a pregap before the data and drops a track that is all pregap', () => {
    const track = join([mode1Sector(0x44), mode1Sector(0x55)]);
    const image = sectorsToImage(track, { mode: 'MODE1/2352', sectorSize: 2352, userOffset: 16 }, 1);
    expect(image?.length).toBe(2048);
    expect(image?.[0]).toBe(0x55);
    const nothing = sectorsToImage(track, { mode: 'MODE1/2352', sectorSize: 2352, userOffset: 16 }, 9);
    expect(nothing).toBeNull();
  });

  it('picks one disc out of a selection that also holds other rips', () => {
    const cue = encoder.encode('FILE "Game.bin" BINARY\nTRACK 01 MODE1/2352\nINDEX 01 00:00:00');
    const picked = discSetFromSelection([
      { name: 'Game.bin', bytes: join([mode1Sector(0x01)]) },
      { name: 'Game.cue', bytes: cue },
      { name: 'Unrelated.chd', bytes: new Uint8Array(4) },
    ]);
    expect(picked.map(file => file.name)).toEqual(['Game.cue', 'Game.bin']);
  });
});
