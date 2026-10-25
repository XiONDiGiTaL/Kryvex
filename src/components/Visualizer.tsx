import { useEffect, useRef } from 'react';
import {
  averageLevel,
  bands,
  smoothLevel,
  type VisualizerMode,
} from '../lib/visualizer';

/**
 * One Web Audio graph per media element, created at most once.
 *
 * `createMediaElementSource` throws if it is called twice for the same element,
 * and the provider keeps that element for the whole session, so the source and
 * its analyser are cached here and reused when the player page remounts.
 */
interface Graph {
  context: AudioContext;
  analyser: AnalyserNode;
  frequency: Uint8Array<ArrayBuffer>;
  time: Uint8Array<ArrayBuffer>;
}

const graphs = new WeakMap<HTMLMediaElement, Graph>();

function graphFor(media: HTMLMediaElement): Graph | null {
  const existing = graphs.get(media);
  if (existing) return existing;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const context = new Ctor();
    const source = context.createMediaElementSource(media);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;
    // Source → analyser → speakers. Routing through the graph is what keeps
    // the audio audible; the analyser only taps it.
    source.connect(analyser);
    analyser.connect(context.destination);
    const graph: Graph = {
      context,
      analyser,
      // Allocated from an explicit ArrayBuffer so the typed arrays match the
      // `Uint8Array<ArrayBuffer>` the analyser methods declare.
      frequency: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
      time: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
    };
    graphs.set(media, graph);
    return graph;
  } catch {
    return null;
  }
}

function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function Visualizer({
  media,
  mode,
  intensity,
  active,
}: {
  media: HTMLMediaElement;
  mode: VisualizerMode;
  intensity: number;
  active: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const node = canvas.current;
    if (!node || mode === 'off' || !active) return;
    const graph = graphFor(media);
    if (!graph) return;
    const { context, analyser, frequency, time } = graph;
    if (context.state === 'suspended') void context.resume().catch(() => undefined);

    const context2d = node.getContext('2d');
    if (!context2d) return;
    let frame = 0;
    let levels: number[] = [];
    const accent = cssColor('--accent', '#38bdf8');
    const soft = cssColor('--accent-soft', accent);

    const resize = () => {
      const rect = node.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      node.width = Math.max(1, Math.round(rect.width * ratio));
      node.height = Math.max(1, Math.round(rect.height * ratio));
      context2d.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);

    const draw = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (width === 0 || height === 0) {
        frame = requestAnimationFrame(draw);
        return;
      }
      context2d.clearRect(0, 0, width, height);
      analyser.getByteFrequencyData(frequency);
      analyser.getByteTimeDomainData(time);

      if (mode === 'bars' || mode === 'radial' || mode === 'ambient') {
        const count = mode === 'radial' ? 72 : Math.max(16, Math.round(width / 9));
        const next = bands(frequency, count);
        levels = next.map((value, index) => smoothLevel(levels[index] ?? 0, value));
      } else {
        // The waveform uses the raw samples; smoothing it would erase the shape.
        levels = [];
      }

      if (mode === 'bars') {
        const gap = 2;
        const barWidth = Math.max(2, width / Math.max(1, levels.length) - gap);
        context2d.fillStyle = accent;
        for (let index = 0; index < levels.length; index += 1) {
          const value = Math.min(1, (levels[index] ?? 0) * intensity);
          const bar = Math.max(2, value * height * 0.82);
          const x = index * (barWidth + gap);
          context2d.globalAlpha = 0.35 + value * 0.65;
          context2d.fillRect(x, height / 2 - bar / 2, barWidth, bar);
        }
        context2d.globalAlpha = 1;
      } else if (mode === 'wave') {
        context2d.lineWidth = 1.6;
        context2d.strokeStyle = accent;
        context2d.beginPath();
        const step = Math.max(1, Math.floor(time.length / width));
        for (let x = 0; x < width; x += 1) {
          const sample = (time[x * step] ?? 128) / 128 - 1;
          const y = height / 2 + sample * (height / 2) * 0.7 * intensity;
          if (x === 0) context2d.moveTo(x, y);
          else context2d.lineTo(x, y);
        }
        context2d.stroke();
      } else if (mode === 'radial') {
        const centreX = width / 2;
        const centreY = height / 2;
        const inner = Math.min(width, height) * 0.16;
        context2d.lineWidth = 3;
        context2d.lineCap = 'round';
        for (let index = 0; index < levels.length; index += 1) {
          const angle = (index / levels.length) * Math.PI * 2 - Math.PI / 2;
          const value = Math.min(1, (levels[index] ?? 0) * intensity);
          const outer = inner + value * Math.min(width, height) * 0.36;
          context2d.strokeStyle = index % 2 === 0 ? accent : soft;
          context2d.globalAlpha = 0.4 + value * 0.6;
          context2d.beginPath();
          context2d.moveTo(centreX + Math.cos(angle) * inner, centreY + Math.sin(angle) * inner);
          context2d.lineTo(centreX + Math.cos(angle) * outer, centreY + Math.sin(angle) * outer);
          context2d.stroke();
        }
        context2d.globalAlpha = 1;
      } else if (mode === 'ambient') {
        analyser.getByteFrequencyData(frequency);
        const level = Math.min(1, averageLevel(frequency) * intensity * 2.4);
        const radius = Math.max(width, height) * (0.22 + level * 0.3);
        const gradient = context2d.createRadialGradient(
          width / 2,
          height / 2,
          0,
          width / 2,
          height / 2,
          radius,
        );
        gradient.addColorStop(0, accent);
        gradient.addColorStop(0.55, soft);
        gradient.addColorStop(1, 'transparent');
        context2d.globalAlpha = 0.28 + level * 0.4;
        context2d.fillStyle = gradient;
        context2d.fillRect(0, 0, width, height);
        context2d.globalAlpha = 1;
      }

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [active, intensity, media, mode]);

  if (mode === 'off' || !active) return null;
  return <canvas className="player-visualizer" ref={canvas} aria-hidden="true" />;
}
