/**
 * Media visualizer rules.
 *
 * Only audio Kryvex itself decodes can be analysed. A blob URL for a local file
 * is same-origin, so a Web Audio graph can read its samples; a YouTube embed or
 * a cross-origin stream is opaque to that graph, and pretending otherwise would
 * either draw from silence or silence the track. `canAnalyse` is the single
 * place that decision is made.
 */
export type VisualizerMode = 'off' | 'bars' | 'wave' | 'radial' | 'ambient';

export const VISUALIZER_MODES: Array<{ id: VisualizerMode; label: string }> = [
  { id: 'off', label: 'Off' },
  { id: 'bars', label: 'Spectrum bars' },
  { id: 'wave', label: 'Waveform' },
  { id: 'radial', label: 'Radial spectrum' },
  { id: 'ambient', label: 'Ambient glow' },
];

export function isVisualizerMode(value: unknown): value is VisualizerMode {
  return VISUALIZER_MODES.some(mode => mode.id === value);
}

export const MIN_VISUALIZER_INTENSITY = 0.5;
export const MAX_VISUALIZER_INTENSITY = 2;

export function clampIntensity(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(MAX_VISUALIZER_INTENSITY, Math.max(MIN_VISUALIZER_INTENSITY, number));
}

/**
 * A blob URL is same-origin by definition; an http(s) URL is only analysable
 * when it points at the page's own origin. Anything else (a CDN, an iframe) is
 * excluded so the audio graph never taints playback.
 */
export function canAnalyse(url: string, pageOrigin: string): boolean {
  if (!url) return false;
  if (url.startsWith('blob:')) return true;
  if (url.startsWith('data:')) return true;
  try {
    return new URL(url).origin === pageOrigin;
  } catch {
    return false;
  }
}

/**
 * Bucket FFT magnitudes into a fixed number of bars. Bins are spread with a
 * square-root curve so the low end, where music lives, does not collapse into
 * the first two bars; anything past the requested count averages in.
 */
export function bands(data: Uint8Array | number[], buckets: number): number[] {
  const total = Math.max(1, Math.floor(buckets));
  const out = new Array<number>(total).fill(0);
  if (data.length === 0) return out;
  for (let index = 0; index < data.length; index += 1) {
    const ratio = Math.sqrt(index / data.length);
    const slot = Math.min(total - 1, Math.floor(ratio * total));
    out[slot] = Math.max(out[slot] ?? 0, (data[index] ?? 0) / 255);
  }
  return out;
}

/**
 * Smooths a bar's height: it jumps to a new peak at once but falls back slowly,
 * which is what makes a spectrum read as music instead of a flickering bar
 * chart. `rise` and `fall` are fractions per frame.
 */
export function smoothLevel(previous: number, next: number, rise = 0.6, fall = 0.12): number {
  const before = Number.isFinite(previous) ? previous : 0;
  const target = Number.isFinite(next) ? next : 0;
  return target > before ? before + (target - before) * rise : before + (target - before) * fall;
}

/** Overall loudness, used by the ambient mode to pick its radius. */
export function averageLevel(data: Uint8Array | number[]): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < data.length; index += 1) sum += data[index] ?? 0;
  return sum / data.length / 255;
}
