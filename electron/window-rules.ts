/**
 * Window sizing rules.
 *
 * A window larger than the display is the most common cause of a UI that looks
 * "chopped": the right column and the bottom row sit off-screen. The shell fits
 * its initial size to the work area instead, and never asks for less than the
 * size the layout is verified at (`verify:layout`).
 */

export interface WindowSize {
  width: number;
  height: number;
}

/** Verified floor: the layout harness passes at 900×520. */
export const MIN_WINDOW_SIZE: WindowSize = { width: 900, height: 520 };

/** The design size, used whenever the display can hold it. */
export const PREFERRED_WINDOW_SIZE: WindowSize = { width: 1440, height: 900 };

/** Keep a small margin so taskbars and rounded corners do not eat the edge. */
export const WORK_AREA_MARGIN = 32;

export function fitWindowToWorkArea(
  workArea: WindowSize,
  preferred: WindowSize = PREFERRED_WINDOW_SIZE,
  margin: number = WORK_AREA_MARGIN,
): WindowSize {
  return {
    width: Math.max(MIN_WINDOW_SIZE.width, Math.min(preferred.width, workArea.width - margin)),
    height: Math.max(
      MIN_WINDOW_SIZE.height,
      Math.min(preferred.height, workArea.height - margin),
    ),
  };
}
