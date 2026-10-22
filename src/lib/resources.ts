import { useEffect, useMemo, useRef, useState } from 'react';
import type { ResourceSnapshot, Service } from '../types';

const POLL_MS = 2200;

/**
 * Polls Kryvex's own process metrics only while something shows them.
 * A hidden monitor costs nothing: no timer, no IPC, no wakeups.
 */
export function useResourceSnapshot(
  services: Service[],
  enabled: boolean,
): ResourceSnapshot | null {
  const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(null);
  const alive = useRef(true);
  const targets = useMemo(
    () => services.map(service => ({ id: service.id, url: service.url })),
    // The identity of the array changes with every state edit; the wire value
    // is what matters, so derive a stable key from the fields we send.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [services.map(service => `${service.id}|${service.url}`).join('~')],
  );

  useEffect(() => {
    alive.current = true;
    if (!enabled || !window.kryvex) {
      setSnapshot(null);
      return () => {
        alive.current = false;
      };
    }
    let timer = 0;
    const sample = () => {
      void window.kryvex
        ?.resourcesSample(targets)
        .then(next => {
          if (alive.current) setSnapshot((next as ResourceSnapshot | null) ?? null);
        })
        .catch(() => undefined);
    };
    sample();
    timer = window.setInterval(sample, POLL_MS);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
    };
  }, [enabled, targets]);

  return snapshot;
}

export function formatMB(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`;
  return `${Math.round(value)} MB`;
}

export function formatCpu(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)}%`;
}
