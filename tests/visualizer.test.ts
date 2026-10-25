import { describe, expect, it } from 'vitest';
import {
  MAX_VISUALIZER_INTENSITY,
  MIN_VISUALIZER_INTENSITY,
  VISUALIZER_MODES,
  averageLevel,
  bands,
  canAnalyse,
  clampIntensity,
  isVisualizerMode,
  smoothLevel,
} from '../src/lib/visualizer';

describe('visualizer', () => {
  it('offers five modes and rejects anything else', () => {
    expect(VISUALIZER_MODES.map(mode => mode.id)).toEqual([
      'off',
      'bars',
      'wave',
      'radial',
      'ambient',
    ]);
    expect(isVisualizerMode('bars')).toBe(true);
    expect(isVisualizerMode('plasma')).toBe(false);
  });

  it('clamps the amplitude multiplier', () => {
    expect(clampIntensity(1)).toBe(1);
    expect(clampIntensity(9)).toBe(MAX_VISUALIZER_INTENSITY);
    expect(clampIntensity(0)).toBe(MIN_VISUALIZER_INTENSITY);
    expect(clampIntensity('loud')).toBe(1);
  });

  it('buckets FFT bins without losing the loudest value', () => {
    const data = new Uint8Array(64);
    data[0] = 200;
    data[63] = 255;
    const out = bands(data, 8);
    expect(out).toHaveLength(8);
    expect(Math.max(...out)).toBeCloseTo(1);
    expect(out[0]).toBeGreaterThan(0.7);
    // An empty slice still yields the requested number of zeroed bars.
    expect(bands([], 4)).toEqual([0, 0, 0, 0]);
  });

  it('rises quickly and falls slowly', () => {
    const up = smoothLevel(0, 1);
    const down = smoothLevel(1, 0);
    expect(up).toBeGreaterThan(0.5);
    expect(down).toBeGreaterThan(0.8);
    expect(smoothLevel(0.5, 0.5)).toBe(0.5);
    expect(smoothLevel(Number.NaN, Number.NaN)).toBe(0);
  });

  it('averages a frame for the ambient mode', () => {
    expect(averageLevel(new Uint8Array(4))).toBe(0);
    expect(averageLevel([255, 255])).toBe(1);
    expect(averageLevel([])).toBe(0);
  });

  it('analyses only audio this page can read', () => {
    const origin = 'http://localhost:4183';
    expect(canAnalyse('blob:http://localhost:4183/abc', origin)).toBe(true);
    expect(canAnalyse('http://localhost:4183/song.mp3', origin)).toBe(true);
    expect(canAnalyse('https://cdn.example/song.mp3', origin)).toBe(false);
    expect(canAnalyse('', origin)).toBe(false);
    expect(canAnalyse('not a url', origin)).toBe(false);
  });
});
