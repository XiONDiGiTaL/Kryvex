/**
 * Rules for capturing a dragged region.
 *
 * A region is kept in the target's own pixels, never in the pixels the picker
 * happened to draw at. The frozen frame is scaled to fit the window, and that
 * scale changes with the window size, the monitor's scale factor and the size of
 * whatever is being captured — so a box dragged on screen means nothing until it
 * is converted back. Everything that can be wrong (an inverted drag, a selection
 * hanging off the frame, a one-pixel box, an odd width an encoder refuses) is
 * settled here, which is also why this file has no Electron, no canvas and no
 * DOM in it: the arithmetic is unit-tested on its own.
 */
export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropBox {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /**
   * True when the box is the region that was asked for.
   *
   * False means the region cannot be honoured on this frame and the whole frame
   * is about to be taken instead. Callers say so rather than pretending the
   * picture is the area the card still claims.
   */
  exact: boolean;
}

/** A drag shorter than this in either direction is a click, not a selection. */
export const MIN_REGION_PX = 24;
/** Screen edge the picker leaves free on each side. */
export const PICKER_MARGIN_X = 48;
/** Room for the picker's bar, its hint, its buttons and its padding. */
export const PICKER_MARGIN_Y = 168;

function positive(value: number, fallback = 0): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * The frozen frame's size on screen: the whole frame, shrunk to fit and never
 * enlarged past 1:1, so a small target is not shown blurred and a 4K one fits.
 */
export function fitSize(source: Size, available: Size): Size {
  const sourceWidth = positive(source.width);
  const sourceHeight = positive(source.height);
  const roomWidth = positive(available.width);
  const roomHeight = positive(available.height);
  // Nothing to draw, or nowhere to draw it.
  if (!sourceWidth || !sourceHeight || !roomWidth || !roomHeight) return { width: 0, height: 0 };
  const scale = Math.min(roomWidth / sourceWidth, roomHeight / sourceHeight, 1);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

/** The space the picker may draw in, from the window it is inside. */
export function pickerArena(viewport: Size): Size {
  return {
    width: Math.max(1, positive(viewport.width, 1) - PICKER_MARGIN_X),
    height: Math.max(1, positive(viewport.height, 1) - PICKER_MARGIN_Y),
  };
}

/** A region that fits inside the frame, or null when too little is left of it. */
export function clampRegion(region: CaptureRegion, source: Size): CaptureRegion | null {
  const sourceWidth = positive(source.width);
  const sourceHeight = positive(source.height);
  if (!sourceWidth || !sourceHeight) return null;
  // Clamped in this order on purpose: the anchor moves inside the frame first,
  // then the span shrinks to what is left, so a region can only ever lose area.
  const x = Math.min(Math.max(0, Math.round(region.x)), sourceWidth - 1);
  const y = Math.min(Math.max(0, Math.round(region.y)), sourceHeight - 1);
  const width = Math.min(Math.max(0, Math.round(region.width)), sourceWidth - x);
  const height = Math.min(Math.max(0, Math.round(region.height)), sourceHeight - y);
  if (width < MIN_REGION_PX || height < MIN_REGION_PX) return null;
  return { x, y, width, height };
}

/**
 * The drag, read back in the frame's own pixels, or null when it is unusable.
 *
 * `frame` is the displayed size and `source` the intrinsic one, so the scale is
 * whatever the picker happened to draw at. The drag may run in any direction:
 * the box is the span between the two corners.
 */
export function regionFromDrag(start: Point, end: Point, frame: Size, source: Size): CaptureRegion | null {
  const frameWidth = positive(frame.width);
  const frameHeight = positive(frame.height);
  const sourceWidth = positive(source.width);
  const sourceHeight = positive(source.height);
  if (!frameWidth || !frameHeight || !sourceWidth || !sourceHeight) return null;
  const scaleX = sourceWidth / frameWidth;
  const scaleY = sourceHeight / frameHeight;
  // A drag that leaves the frame is held at its edge rather than refused.
  const left = Math.min(Math.max(0, Math.min(start.x, end.x)), frameWidth);
  const top = Math.min(Math.max(0, Math.min(start.y, end.y)), frameHeight);
  const right = Math.min(Math.max(0, Math.max(start.x, end.x)), frameWidth);
  const bottom = Math.min(Math.max(0, Math.max(start.y, end.y)), frameHeight);
  const width = Math.round((right - left) * scaleX);
  const height = Math.round((bottom - top) * scaleY);
  if (width < MIN_REGION_PX || height < MIN_REGION_PX) return null;
  return clampRegion(
    { x: Math.round(left * scaleX), y: Math.round(top * scaleY), width, height },
    source,
  );
}

/**
 * The box `drawImage` asks for: source pixels, and only when they fit.
 *
 * A region that no longer fits is not trimmed into a different picture: the
 * frame came back smaller (the window was resized, or the target changed since
 * the area was drawn), so the whole frame is captured and the card drops the
 * area instead of quietly cutting a strip out of it.
 */
export function cropBox(region: CaptureRegion | null, source: Size): CropBox {
  const whole: CropBox = {
    sx: 0,
    sy: 0,
    sw: Math.max(1, Math.round(positive(source.width, 1))),
    sh: Math.max(1, Math.round(positive(source.height, 1))),
    // Nothing was refused: the whole frame is what was asked for.
    exact: true,
  };
  if (!region) return whole;
  const sourceWidth = positive(source.width);
  const sourceHeight = positive(source.height);
  if (!sourceWidth || !sourceHeight) return { ...whole, exact: false };
  const x = Math.round(region.x);
  const y = Math.round(region.y);
  const width = Math.round(region.width);
  const height = Math.round(region.height);
  if (x < 0 || y < 0 || width < MIN_REGION_PX || height < MIN_REGION_PX) return { ...whole, exact: false };
  if (x + width > sourceWidth || y + height > sourceHeight) return { ...whole, exact: false };
  return { sx: x, sy: y, sw: width, sh: height, exact: true };
}

/** VP8 and VP9 encode even dimensions; a rounding must not break a recording. */
export function even(value: number): number {
  const rounded = Math.max(2, Math.round(positive(value, 2)));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

/** `800 × 600`, the way the picker and the card both read it. */
export function regionLabel(region: CaptureRegion): string {
  return `${Math.round(positive(region.width))} × ${Math.round(positive(region.height))}`;
}

/**
 * Where a region sits on the scaled-down frozen frame.
 *
 * The picker draws the box from this rather than from the raw drag, so what the
 * user sees marked is exactly what a capture will take.
 */
export function regionRect(
  region: CaptureRegion,
  frame: Size,
  source: Size,
): { left: number; top: number; width: number; height: number } {
  const empty = { left: 0, top: 0, width: 0, height: 0 };
  const sourceWidth = positive(source.width);
  const sourceHeight = positive(source.height);
  const frameWidth = positive(frame.width);
  const frameHeight = positive(frame.height);
  if (!sourceWidth || !sourceHeight || !frameWidth || !frameHeight) return empty;
  const scaleX = frameWidth / sourceWidth;
  const scaleY = frameHeight / sourceHeight;
  return {
    left: region.x * scaleX,
    top: region.y * scaleY,
    width: region.width * scaleX,
    height: region.height * scaleY,
  };
}
