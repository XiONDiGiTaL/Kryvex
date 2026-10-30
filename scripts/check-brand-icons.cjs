/* eslint-disable no-console */
/**
 * Fails a build that would ship a bundled brand mark nobody can see.
 *
 * Service tiles draw a mark on a dark, barely tinted square. A site icon is
 * usually full colour, but some are a single dark glyph on transparency, and
 * those disappear against the tile. `BRAND_ICONS` marks such an icon with
 * `plate: true`, which puts it on a light backing plate.
 *
 * This check decodes every bundled image, composites it over the tile colour and
 * measures contrast, so a newly added dark mark is caught here instead of by eye:
 *
 * - A transparent mark is unreadable when most of its ink sits below the 3:1
 *   non-text contrast floor.
 * - An opaque mark carries its own background, so it is unreadable only when no
 *   part of it reaches 3:1 against the tile.
 *
 * Only bundled images are measured; Simple Icons paths follow the tile tone and
 * are never a contrast risk.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const iconsDir = path.join(root, 'public');
const source = path.join(root, 'src', 'lib', 'brand-icons.ts');

/** The tile behind a service mark on a dark theme: accent 16% over the backdrop. */
const TILE = { r: 0x1e, g: 0x23, b: 0x2c };
/** WCAG 1.4.11 minimum contrast for graphical objects. */
const MIN_CONTRAST = 3;
const INK_ALPHA = 128;
const OPAQUE_SHARE = 0.9;

let failures = 0;

function check(name, ok, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `, ${detail}` : ''}`);
}

function channel(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance({ r, g, b }) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const TILE_LUMINANCE = luminance(TILE);

function contrast(rgb) {
  const value = luminance(rgb);
  const lighter = Math.max(value, TILE_LUMINANCE);
  const darker = Math.min(value, TILE_LUMINANCE);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Reads a 1/2/4-bit sample, which PNG packs several of into one byte. */
function packed(line, x, bitDepth) {
  const perByte = 8 / bitDepth;
  const byte = line[Math.floor(x / perByte)];
  const shift = 8 - bitDepth * ((x % perByte) + 1);
  return (byte >> shift) & ((1 << bitDepth) - 1);
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
}

/** Decodes a non-interlaced 8-bit PNG into RGBA pixels. */
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let transparency = null;
  const idat = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      transparency = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (!width || !height) throw new Error('PNG has no size');
  if (![1, 2, 4, 8].includes(bitDepth)) {
    throw new Error(`PNG bit depth ${bitDepth} is not supported`);
  }
  if (interlace !== 0) throw new Error('interlaced PNG is not supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`PNG colour type ${colorType} is not supported`);
  if (bitDepth < 8 && colorType !== 0 && colorType !== 3) {
    throw new Error(`PNG colour type ${colorType} at ${bitDepth} bits is not supported`);
  }
  if (colorType === 3 && !palette) throw new Error('palette PNG without a palette');

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = Math.ceil((width * channels * bitDepth) / 8);
  // Filters step a whole byte at a time, even for four pixels packed in one.
  const step = Math.max(1, Math.ceil((channels * bitDepth) / 8));
  const pixels = Buffer.alloc(width * height * 4);
  const previous = Buffer.alloc(stride);
  let position = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[position];
    position += 1;
    const line = Buffer.from(raw.subarray(position, position + stride));
    position += stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= step ? line[i - step] : 0;
      const up = previous[i];
      const upLeft = i >= step ? previous[i - step] : 0;
      if (filter === 1) line[i] = (line[i] + left) & 0xff;
      else if (filter === 2) line[i] = (line[i] + up) & 0xff;
      else if (filter === 3) line[i] = (line[i] + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) line[i] = (line[i] + paeth(left, up, upLeft)) & 0xff;
      else if (filter !== 0) throw new Error(`PNG filter ${filter} is not supported`);
    }
    line.copy(previous);

    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      const from = x * channels;
      const sample = bitDepth === 8 ? line[from] : packed(line, x, bitDepth);
      if (colorType === 0) {
        const value = bitDepth === 8 ? sample : Math.round((sample * 255) / ((1 << bitDepth) - 1));
        pixels[at] = value;
        pixels[at + 1] = value;
        pixels[at + 2] = value;
        pixels[at + 3] = 255;
      } else if (colorType === 2) {
        pixels[at] = line[from];
        pixels[at + 1] = line[from + 1];
        pixels[at + 2] = line[from + 2];
        pixels[at + 3] = 255;
      } else if (colorType === 3) {
        pixels[at] = palette[sample * 3];
        pixels[at + 1] = palette[sample * 3 + 1];
        pixels[at + 2] = palette[sample * 3 + 2];
        pixels[at + 3] =
          transparency && sample < transparency.length ? transparency[sample] : 255;
      } else if (colorType === 4) {
        pixels[at] = line[from];
        pixels[at + 1] = line[from];
        pixels[at + 2] = line[from];
        pixels[at + 3] = line[from + 1];
      } else {
        pixels[at] = line[from];
        pixels[at + 1] = line[from + 1];
        pixels[at + 2] = line[from + 2];
        pixels[at + 3] = line[from + 3];
      }
    }
  }

  return { width, height, pixels };
}

/** Decodes the bitmap of one ICO directory entry, PNG-compressed or DIB. */
function decodeIconBitmap(payload) {
  if (payload.readUInt32BE(0) === 0x89504e47) return decodePng(payload);

  const headerSize = payload.readUInt32LE(0);
  const width = payload.readInt32LE(4);
  const storedHeight = payload.readInt32LE(8);
  const height = Math.abs(storedHeight) / 2;
  const bitCount = payload.readUInt16LE(14);
  const compression = payload.readUInt32LE(16);
  const paletteSize = payload.readUInt32LE(32) || (bitCount <= 8 ? 1 << bitCount : 0);

  if (compression !== 0) throw new Error(`ICO compression ${compression} is not supported`);
  if (!width || !height) throw new Error('ICO bitmap has no size');
  if (![1, 4, 8, 24, 32].includes(bitCount)) {
    throw new Error(`ICO bit depth ${bitCount} is not supported`);
  }

  const paletteAt = headerSize;
  const dataAt = headerSize + paletteSize * 4;
  const rowBytes = Math.ceil((width * bitCount) / 32) * 4;
  const pixels = Buffer.alloc(width * height * 4);
  let anyAlpha = false;

  for (let row = 0; row < height; row += 1) {
    const y = height - 1 - row;
    const line = dataAt + row * rowBytes;
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      if (bitCount === 32) {
        const from = line + x * 4;
        pixels[at] = payload[from + 2];
        pixels[at + 1] = payload[from + 1];
        pixels[at + 2] = payload[from];
        pixels[at + 3] = payload[from + 3];
        if (payload[from + 3]) anyAlpha = true;
      } else if (bitCount === 24) {
        const from = line + x * 3;
        pixels[at] = payload[from + 2];
        pixels[at + 1] = payload[from + 1];
        pixels[at + 2] = payload[from];
        pixels[at + 3] = 255;
      } else {
        const perByte = 8 / bitCount;
        const byte = payload[line + Math.floor(x / perByte)];
        const shift = 8 - bitCount * ((x % perByte) + 1);
        const index = (byte >> shift) & ((1 << bitCount) - 1);
        const from = paletteAt + index * 4;
        pixels[at] = payload[from + 2];
        pixels[at + 1] = payload[from + 1];
        pixels[at + 2] = payload[from];
        pixels[at + 3] = 255;
      }
    }
  }

  // Old 32-bit icons leave the alpha channel at zero and rely on the AND mask.
  if (bitCount === 32 && !anyAlpha) {
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  }

  return { width, height, pixels };
}

/** Picks the largest image inside an ICO and decodes it. */
function decodeIco(buffer) {
  const count = buffer.readUInt16LE(4);
  let best = null;
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 16;
    const width = buffer[at] || 256;
    const height = buffer[at + 1] || 256;
    const bytes = buffer.readUInt32LE(at + 8);
    const offset = buffer.readUInt32LE(at + 12);
    if (!bytes || offset + bytes > buffer.length) continue;
    if (!best || width * height > best.width * best.height) {
      best = { width, height, payload: buffer.subarray(offset, offset + bytes) };
    }
  }
  if (!best) throw new Error('ICO has no readable image');
  return decodeIconBitmap(best.payload);
}

function decodeImage(file) {
  const buffer = fs.readFileSync(file);
  const extension = path.extname(file).toLowerCase();
  if (extension === '.png') return decodePng(buffer);
  if (extension === '.ico') return decodeIco(buffer);
  throw new Error(`${extension || 'unknown'} files cannot be measured, so save this mark as PNG`);
}

/** Measures how much of a mark is legible against the service tile. */
function analyze({ width, height, pixels }) {
  const total = width * height;
  let ink = 0;
  let faintInk = 0;
  let bestContrast = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    if (alpha < INK_ALPHA / 255) continue;
    ink += 1;
    const over = {
      r: pixels[i] * alpha + TILE.r * (1 - alpha),
      g: pixels[i + 1] * alpha + TILE.g * (1 - alpha),
      b: pixels[i + 2] * alpha + TILE.b * (1 - alpha),
    };
    const value = contrast(over);
    if (value > bestContrast) bestContrast = value;
    if (value < MIN_CONTRAST) faintInk += 1;
  }

  if (!ink) return { readable: false, reason: 'has no visible pixels' };
  const opaque = ink / total >= OPAQUE_SHARE;
  const readability = bestContrast < MIN_CONTRAST;

  if (opaque) {
    return readability
      ? { readable: false, reason: `reads at ${bestContrast.toFixed(1)}:1` }
      : { readable: true };
  }

  const faintShare = faintInk / ink;
  return faintShare > 0.5
    ? {
        readable: false,
        reason: `${Math.round(faintShare * 100)}% of the mark reads at ${bestContrast.toFixed(1)}:1 or less`,
      }
    : { readable: true };
}

const entries = [];
const pattern =
  /^\s*(?:'([^']+)'|"([^"]+)"|([\w$]+)):\s*\{\s*title:\s*'[^']*',\s*hex:\s*"[0-9A-Fa-f]{6}",\s*src:\s*'([^']+)'(,\s*plate:\s*true)?\s*\},$/gm;
const text = fs.readFileSync(source, 'utf8');
for (const match of text.matchAll(pattern)) {
  entries.push({
    key: match[1] || match[2] || match[3],
    src: match[4],
    plate: Boolean(match[5]),
  });
}

if (!entries.length) {
  console.log('brand icons: FAIL (no bundled image marks found in src/lib/brand-icons.ts)');
  process.exitCode = 1;
  return;
}

console.log(`brand icons: ${entries.length} bundled images`);
const plated = entries.filter(entry => entry.plate).length;

for (const entry of entries) {
  const file = path.join(iconsDir, entry.src);
  if (!fs.existsSync(file)) {
    check(`the mark for ${entry.key} exists`, false, entry.src);
    continue;
  }
  let result;
  try {
    result = analyze(decodeImage(file));
  } catch (error) {
    check(`the mark for ${entry.key} can be measured`, false, error.message);
    continue;
  }
  if (result.readable) continue;
  check(
    `the mark for ${entry.key} is legible on a dark tile`,
    entry.plate,
    entry.plate
      ? undefined
      : `${result.reason}, add \`plate: true\` to ${entry.key} in src/lib/brand-icons.ts`,
  );
}

if (failures === 0) {
  console.log(`brand icons: PASS (${plated} on a light plate)`);
} else {
  console.log(`brand icons: FAIL (${failures})`);
  process.exitCode = 1;
}
