/**
 * PlayStation disc images: joining a `.cue` and its `.bin` into one file.
 *
 * The cartridge slot hands the core a single blob and a single name. A
 * PlayStation rip usually arrives as a small `.cue` manifest plus one or more
 * multi-hundred-megabyte `.bin` tracks, and a core given only the `.cue` has no
 * picture data while a core given only a raw track has no layout. Neither file
 * can be started on its own, which is why a PSX game used to look like "the
 * emulator does not even try to find the file".
 *
 * This module rebuilds the pair into the one shape every PlayStation core
 * accepts — a 2048-byte-per-sector `.iso`:
 *
 * - a raw MODE1 track (2352 bytes per sector) keeps the 2048 user bytes at
 *   offset 16 and drops sync, header and ECC;
 * - a raw MODE2 track keeps the 2048 Form 1 bytes at offset 24;
 * - a track that is already 2048 per sector is passed through untouched.
 *
 * Only the data track is joined. A disc whose music lives in separate CD audio
 * tracks therefore loses that audio, which is exactly why the panel tells the
 * user to prefer a `.chd` when they have one: nothing here is a replacement for
 * a proper multi-track container.
 *
 * Everything is pure, so it is tested with synthetic sectors.
 */

/** A sector layout a cue sheet can declare, or a bare track can be sniffed as. */
export type SectorMode =
  | 'MODE1/2048'
  | 'MODE1/2352'
  | 'MODE2/2048'
  | 'MODE2/2324'
  | 'MODE2/2336'
  | 'MODE2/2352';

export interface DiscLayout {
  mode: SectorMode;
  /** Bytes per sector in the source file. */
  sectorSize: number;
  /** Where the 2048 user bytes start inside a sector. */
  userOffset: number;
}

const MODE1_2352: DiscLayout = { mode: 'MODE1/2352', sectorSize: 2352, userOffset: 16 };
const MODE2_2352: DiscLayout = { mode: 'MODE2/2352', sectorSize: 2352, userOffset: 24 };
const MODE1_2048: DiscLayout = { mode: 'MODE1/2048', sectorSize: 2048, userOffset: 0 };
const MODE2_2336: DiscLayout = { mode: 'MODE2/2336', sectorSize: 2336, userOffset: 8 };

/** 12-byte sync pattern that starts every raw CD sector. */
const SYNC = [0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00];

/** The 12-byte sync a raw 2352/2336 track begins with. */
export function hasRawSync(bytes: Uint8Array, offset = 0): boolean {
  if (bytes.length < offset + SYNC.length) return false;
  for (let index = 0; index < SYNC.length; index += 1) {
    if (bytes[offset + index] !== SYNC[index]) return false;
  }
  return true;
}

/**
 * How a track is laid out, from its own bytes.
 *
 * A raw track says so itself: a sync pattern and the mode byte at offset 15.
 * A track with neither is either a 2048 image or something this module cannot
 * read, and those are told apart by whether the length divides evenly.
 */
export function sniffLayout(bytes: Uint8Array): DiscLayout | null {
  if (bytes.length === 0) return null;
  if (hasRawSync(bytes)) {
    const mode = bytes[15];
    if (mode === 1) return MODE1_2352;
    if (mode === 2) return MODE2_2352;
    // A raw track whose mode byte is not 1 or 2 is still a 2352 track; MODE1
    // offsets read the same 2048 bytes, so it is the safer reading.
    return MODE1_2352;
  }
  if (bytes.length % 2048 === 0) return MODE1_2048;
  if (bytes.length % 2336 === 0) return MODE2_2336;
  if (bytes.length % 2352 === 0) return MODE1_2352;
  return null;
}

/** The layout a cue sheet names, or null for a track type this cannot join. */
export function layoutForTrackType(trackType: string): DiscLayout | null {
  const type = trackType.trim().toUpperCase();
  if (type === 'MODE1/2048') return MODE1_2048;
  if (type === 'MODE1/2352') return MODE1_2352;
  if (type === 'MODE2/2048') return { mode: 'MODE2/2048', sectorSize: 2048, userOffset: 0 };
  if (type === 'MODE2/2352') return MODE2_2352;
  if (type === 'MODE2/2324') return { mode: 'MODE2/2324', sectorSize: 2352, userOffset: 24 };
  if (type === 'MODE2/2336') return MODE2_2336;
  return null;
}

export interface CueTrack {
  /** Track number as written in the sheet. */
  number: number;
  /** `MODE1/2352`, `AUDIO`, … */
  type: string;
  /** The FILE the track lives in. */
  file: string;
  /** `INDEX 01` in sectors, or 0 when the sheet stops after INDEX 00. */
  index01: number;
}

export interface CueSheet {
  /** Every track, in the sheet's order. */
  tracks: CueTrack[];
  /** The first data track, which is the one that gets joined. */
  data: CueTrack | null;
  /** True when the sheet also lists CD audio, which is not carried over. */
  hasAudio: boolean;
}

function parseTimestamp(text: string): number {
  const parts = text.trim().split(':');
  if (parts.length !== 3) return 0;
  const [minutes = 0, seconds = 0, frames = 0] = parts.map(part => Number(part));
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(frames)) return 0;
  return Math.max(0, minutes) * 60 * 75 + Math.max(0, seconds) * 75 + Math.max(0, frames);
}

/**
 * A cue sheet, as the small text file it is.
 *
 * The grammar people actually write is loose: quoting is optional, the same
 * FILE can hold several tracks, and lines can be indented or capitalised. Only
 * what a join needs is read, and a sheet with no data track returns null so the
 * caller can say so instead of starting a core on nonsense.
 */
export function parseCue(text: string): CueSheet | null {
  if (typeof text !== 'string' || text.trim().length === 0) return null;
  const tracks: CueTrack[] = [];
  let file = '';
  let current: CueTrack | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const fileMatch = /^FILE\s+(?:"([^"]+)"|(\S+))/i.exec(line);
    if (fileMatch) {
      file = (fileMatch[1] ?? fileMatch[2] ?? '').trim();
      current = null;
      continue;
    }
    const trackMatch = /^TRACK\s+(\d{1,2})\s+(\S+)/i.exec(line);
    if (trackMatch) {
      current = {
        number: Number(trackMatch[1]),
        type: (trackMatch[2] ?? '').toUpperCase(),
        file,
        index01: 0,
      };
      tracks.push(current);
      continue;
    }
    const indexMatch = /^INDEX\s+(\d{2})\s+(\d+:\d+:\d+)/i.exec(line);
    if (indexMatch && current && Number(indexMatch[1]) === 1) {
      current.index01 = parseTimestamp(indexMatch[2] ?? '');
    }
  }
  if (tracks.length === 0) return null;
  const data = tracks.find(track => /^MODE/.test(track.type)) ?? null;
  // A sheet of nothing but CD audio has no game data to join, so it is not a
  // disc image this module can produce: the caller says so instead of starting
  // a core on a track list.
  if (!data) return null;
  return {
    tracks,
    data,
    hasAudio: tracks.some(track => track.type === 'AUDIO'),
  };
}

/**
 * The user bytes of one track, as a 2048-byte-per-sector image.
 *
 * `index01` skips the two-second pregap a sheet may place before the track's
 * real start; a file shorter than its declared start is refused rather than
 * returned half-read.
 */
export function sectorsToImage(
  bytes: Uint8Array,
  layout: DiscLayout,
  index01 = 0,
): Uint8Array | null {
  const start = index01 * layout.sectorSize;
  if (start >= bytes.length) return null;
  const usable = bytes.length - start;
  const sectors = Math.floor(usable / layout.sectorSize);
  if (sectors <= 0) return null;
  const image = new Uint8Array(sectors * 2048);
  for (let sector = 0; sector < sectors; sector += 1) {
    const from = start + sector * layout.sectorSize + layout.userOffset;
    const to = sector * 2048;
    image.set(bytes.subarray(from, from + 2048), to);
  }
  return image;
}

export interface DiscFileInput {
  name: string;
  bytes: Uint8Array;
}

export interface JoinedDisc {
  /** What the core is handed: one 2048-byte-per-sector image. */
  bytes: Uint8Array;
  /** The name the core sees, with the extension it expects. */
  name: string;
  /** How the join happened, for the panel's own line. */
  mode: SectorMode;
  /** True when the source sheet listed CD audio this image does not carry. */
  lostAudio: boolean;
}

function stem(name: string): string {
  return name.replace(/\.[^./\\]+$/, '').split(/[/\\]/).pop() || 'disc';
}

function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * One startable image from whatever the user selected.
 *
 * Returns null when the selection cannot be joined — a cue whose bin is
 * missing, a raw track whose size divides by nothing — so the panel can ask for
 * the companion file instead of starting a core on half a disc.
 */
export function joinDiscFiles(files: ReadonlyArray<DiscFileInput>): JoinedDisc | null {
  const usable = files.filter(file => file.bytes.length > 0);
  if (usable.length === 0) return null;
  const cueFile = usable.find(file => /\.cue$/i.test(file.name));
  if (cueFile) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(cueFile.bytes);
    const sheet = parseCue(text);
    if (!sheet || !sheet.data) return null;
    const track = sheet.data;
    const layout = layoutForTrackType(track.type);
    if (!layout) return null;
    // The track names its own file, which is why the bin is looked up by the
    // name in the sheet rather than by being the only other file selected.
    const source =
      usable.find(file => sameName(file.name, track.file)) ??
      usable.find(file => /\.(bin|img|iso)$/i.test(file.name) && file !== cueFile);
    if (!source) return null;
    const image = sectorsToImage(source.bytes, layout, track.index01);
    if (!image) return null;
    return {
      bytes: image,
      name: `${stem(cueFile.name)}.iso`,
      mode: layout.mode,
      lostAudio: sheet.hasAudio,
    };
  }

  // A bare bin or iso: its own first sector says how it is laid out.
  const single = usable[0]!;
  if (/\.(iso|img)$/i.test(single.name)) {
    return { bytes: single.bytes, name: `${stem(single.name)}.iso`, mode: 'MODE1/2048', lostAudio: false };
  }
  const layout = sniffLayout(single.bytes);
  if (!layout) return null;
  const image = sectorsToImage(single.bytes, layout);
  if (!image) return null;
  return { bytes: image, name: `${stem(single.name)}.iso`, mode: layout.mode, lostAudio: false };
}

/**
 * The files that belong to one PlayStation disc, from a selection of any size.
 *
 * A person who selects a folder of rips and picks the cue beside it should not
 * have to deselect the rest; the first cue wins and its own sheet says which bin
 * it needs. When several cues were selected the first is used, which matches
 * the file picker's own order.
 */
export function discSetFromSelection(files: ReadonlyArray<DiscFileInput>): DiscFileInput[] {
  if (files.length === 0) return [];
  const cue = files.find(file => /\.cue$/i.test(file.name));
  if (cue) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(cue.bytes);
    const sheet = parseCue(text);
    const named = sheet?.data
      ? files.find(file => sameName(file.name, sheet.data!.file))
      : undefined;
    if (named) return [cue, named];
    const bin = files.find(file => file !== cue && /\.(bin|img)$/i.test(file.name));
    return bin ? [cue, bin] : [cue];
  }
  const disc = files.find(file => /\.(chd|pbp|iso|img|bin)$/i.test(file.name));
  return disc ? [disc] : [files[0]!];
}
