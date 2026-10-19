/** Chromium-style zoom steps. The UI snaps to these values only. */
export const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;
export const DEFAULT_ZOOM = 1;

/**
 * Returns the next zoom factor in the requested direction. A page can report a
 * factor Kryvex never set, so an off-step value restarts from the closest step.
 */
export function stepZoom(current: number, direction: 1 | -1): number {
  const factor = Number.isFinite(current) && current > 0 ? current : DEFAULT_ZOOM;
  const snapped =
    ZOOM_STEPS.find(step => Math.abs(step - factor) < 0.01) ??
    ZOOM_STEPS.reduce((best, step) =>
      Math.abs(step - factor) < Math.abs(best - factor) ? step : best,
    );
  const index = ZOOM_STEPS.indexOf(snapped);
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))] ?? DEFAULT_ZOOM;
}

export function canZoom(current: number, direction: 1 | -1): boolean {
  const factor = Number.isFinite(current) && current > 0 ? current : DEFAULT_ZOOM;
  return direction === 1
    ? factor < ZOOM_STEPS[ZOOM_STEPS.length - 1]!
    : factor > ZOOM_STEPS[0]!;
}
