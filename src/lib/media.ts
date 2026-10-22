import { useCallback, useEffect, useState } from 'react';
import type { Service, ServiceMediaEvent, ServiceMediaState } from '../types';
import { partitionFor } from './services';

export type MediaAction = 'play' | 'pause' | 'next' | 'previous';

export function sortMedia(list: ServiceMediaState[]): ServiceMediaState[] {
  return [...list].sort(
    (a, b) => Number(b.playing) - Number(a.playing) || b.updatedAt - a.updatedAt,
  );
}

/** Which service owns a guest; the partition is the stable identity. */
export function serviceForPartition(services: Service[], partition: string): Service | undefined {
  return services.find(service => partitionFor(service.id) === partition);
}

/**
 * The media dock is driven by the main process, which is the only process that
 * can read a guest's Media Session. Nothing here polls: events arrive when a
 * page starts, pauses, navigates or is destroyed.
 */
export function useServiceMedia(enabled = true): {
  entries: ServiceMediaState[];
  control: (id: number, action: MediaAction) => Promise<boolean>;
} {
  const [entries, setEntries] = useState<ServiceMediaState[]>([]);

  useEffect(() => {
    if (!enabled || !window.kryvex) {
      setEntries([]);
      return;
    }
    let alive = true;
    void window.kryvex
      .mediaList()
      .then(list => {
        if (alive) setEntries(sortMedia(list));
      })
      .catch(() => undefined);
    const stop = window.kryvex.onMediaChanged((event: ServiceMediaEvent) => {
      if (!alive) return;
      setEntries(current => {
        if (event.removed) return current.filter(item => item.id !== event.id);
        const next = current.filter(item => item.id !== event.id);
        return sortMedia([
          ...next,
          {
            id: event.id,
            partition: event.partition,
            url: event.url,
            title: event.title,
            artist: event.artist,
            artwork: event.artwork,
            playing: event.playing,
            position: event.position,
            duration: event.duration,
            updatedAt: event.updatedAt,
          },
        ]);
      });
    });
    return () => {
      alive = false;
      stop();
    };
  }, [enabled]);

  const control = useCallback(async (id: number, action: MediaAction) => {
    if (!window.kryvex) return false;
    return window.kryvex.mediaControl(id, action).catch(() => false);
  }, []);

  return { entries, control };
}
