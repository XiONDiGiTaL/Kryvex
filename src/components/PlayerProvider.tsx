import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { PlayerSettings, RepeatMode } from '../types';
import { makeId } from '../lib/services';
import {
  classifyMediaLink,
  clampVolume,
  fileMediaKind,
  fileValidation,
  hostLabel,
  nextIndex,
  nextRepeatMode,
  titleFromUrl,
  type MediaKind,
  type Platform,
  type PlayerTrack,
} from '../lib/player';

/**
 * One media element for the whole app.
 *
 * The element is created detached and attached to the player page when it is
 * open. Audio keeps playing while the user works in another view, and coming
 * back simply re-attaches the same element instead of restarting the track.
 * Object URLs are revoked when a track leaves the queue.
 */
export type LinkResult =
  | { ok: true; added: number }
  | { ok: false; reason: 'invalid' | 'unsupported' | 'platform'; platform?: Platform };

export interface PlayerApi {
  tracks: PlayerTrack[];
  current: PlayerTrack | null;
  index: number;
  playing: boolean;
  time: number;
  duration: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  volume: number;
  error: string | null;
  media: HTMLVideoElement;
  /** Move the engine into a stage, or back to its off-screen home. */
  attach: (node: HTMLElement | null) => void;
  addFiles: (files: FileList | File[]) => { added: number; errors: string[] };
  addLink: (input: string) => LinkResult;
  playAt: (index: number) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

const PlayerContext = createContext<PlayerApi | null>(null);

export function usePlayer(): PlayerApi {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('usePlayer must be used inside PlayerProvider');
  return value;
}

export function PlayerProvider({
  settings,
  onUpdate,
  children,
}: {
  settings: PlayerSettings;
  onUpdate: (patch: Partial<PlayerSettings>) => void;
  children: ReactNode;
}) {
  const [tracks, setTracks] = useState<PlayerTrack[]>([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoplay = useRef(true);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const media = useMemo(() => {
    const element = document.createElement('video');
    element.preload = 'metadata';
    element.playsInline = true;
    element.className = 'player-media';
    element.setAttribute('aria-label', 'Kryvex media player');
    return element;
  }, []);

  const current = index >= 0 ? tracks[index] ?? null : null;
  const repeat = settings.repeat;
  const shuffle = settings.shuffle;

  const playMedia = useCallback(() => {
    const attempt = media.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch((reason: unknown) => {
        const name = (reason as { name?: string } | null)?.name;
        // A pause() during load rejects with AbortError; that is not an error.
        if (name === 'AbortError') return;
        setPlaying(false);
        setError('playback');
      });
    }
  }, [media]);

  const advance = useCallback(
    (auto: boolean) => {
      if (index < 0 || tracks.length === 0) return;
      const next = nextIndex({
        current: index,
        length: tracks.length,
        repeat,
        shuffle,
        direction: 1,
        auto,
      });
      if (next < 0) {
        media.pause();
        setPlaying(false);
        setTime(0);
        return;
      }
      autoplay.current = true;
      if (next === index) {
        media.currentTime = 0;
        playMedia();
        return;
      }
      setIndex(next);
    },
    [index, tracks.length, repeat, shuffle, media, playMedia],
  );

  useEffect(() => {
    const onTime = () => setTime(media.currentTime || 0);
    const onDuration = () =>
      setDuration(Number.isFinite(media.duration) ? media.duration : 0);
    const onPlay = () => {
      setPlaying(true);
      setError(null);
    };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setError(null);
    const onEnded = () => advance(true);
    const onError = () => {
      setPlaying(false);
      setError('unplayable');
    };
    media.addEventListener('timeupdate', onTime);
    media.addEventListener('durationchange', onDuration);
    media.addEventListener('loadedmetadata', onDuration);
    media.addEventListener('play', onPlay);
    media.addEventListener('pause', onPause);
    media.addEventListener('waiting', onWaiting);
    media.addEventListener('ended', onEnded);
    media.addEventListener('error', onError);
    return () => {
      media.removeEventListener('timeupdate', onTime);
      media.removeEventListener('durationchange', onDuration);
      media.removeEventListener('loadedmetadata', onDuration);
      media.removeEventListener('play', onPlay);
      media.removeEventListener('pause', onPause);
      media.removeEventListener('waiting', onWaiting);
      media.removeEventListener('ended', onEnded);
      media.removeEventListener('error', onError);
    };
  }, [media, advance]);

  /**
   * The element must never be left detached: Chromium pauses a media element
   * that is removed from the document. Its permanent home is a 1px host, and
   * the player page borrows it while open, handing it back on unmount.
   */
  const attach = useCallback(
    (node: HTMLElement | null) => {
      const target = node ?? hostRef.current;
      if (target && media.parentElement !== target) target.appendChild(media);
    },
    [media],
  );

  useEffect(() => {
    attach(null);
  }, [attach]);

  useEffect(() => {
    media.volume = clampVolume(settings.volume);
  }, [media, settings.volume]);

  useEffect(() => {
    media.muted = muted;
  }, [media, muted]);

  useEffect(() => {
    if (!current) {
      media.removeAttribute('src');
      media.load();
      return;
    }
    media.src = current.url;
    media.load();
    setTime(0);
    setDuration(0);
    setError(null);
    if (autoplay.current) playMedia();
  }, [current?.id, media, playMedia]);

  // Release every object URL when the provider goes away.
  useEffect(
    () => () => {
      media.pause();
      media.removeAttribute('src');
    },
    [media],
  );

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files);
    const errors: string[] = [];
    const fresh: PlayerTrack[] = [];
    for (const file of list) {
      const problem = fileValidation(file);
      if (problem) {
        errors.push(problem);
        continue;
      }
      fresh.push({
        id: makeId('m'),
        title: file.name.replace(/\.[a-z0-9]{1,5}$/i, ''),
        subtitle: file.type || 'Local file',
        url: URL.createObjectURL(file),
        kind: fileMediaKind(file),
        origin: 'file',
        size: file.size,
        addedAt: Date.now(),
      });
    }
    if (fresh.length === 0) return { added: 0, errors };
    setTracks(previous => [...previous, ...fresh]);
    const wasEmpty = tracks.length === 0;
    if (wasEmpty) {
      autoplay.current = true;
      setIndex(0);
    }
    return { added: fresh.length, errors };
  }, [tracks.length]);

  const addLink = useCallback(
    (input: string): LinkResult => {
      const result = classifyMediaLink(input);
      if (!result.ok) {
        return result.reason === 'platform'
          ? { ok: false, reason: 'platform', platform: result.platform }
          : { ok: false, reason: result.reason };
      }
      const track: PlayerTrack = {
        id: makeId('m'),
        title: result.title || titleFromUrl(result.url),
        subtitle: hostLabel(result.url),
        url: result.url,
        kind: result.kind,
        origin: 'link',
        size: 0,
        addedAt: Date.now(),
      };
      setTracks(previous => [...previous, track]);
      if (tracks.length === 0) {
        autoplay.current = true;
        setIndex(0);
      }
      return { ok: true, added: 1 };
    },
    [tracks.length],
  );

  const playAt = useCallback(
    (next: number) => {
      if (next < 0 || next >= tracks.length) return;
      autoplay.current = true;
      if (next === index) {
        media.currentTime = 0;
        playMedia();
        return;
      }
      setIndex(next);
    },
    [tracks.length, index, media, playMedia],
  );

  const toggle = useCallback(() => {
    if (!current) return;
    if (media.paused) {
      autoplay.current = true;
      playMedia();
    } else {
      media.pause();
    }
  }, [current, media, playMedia]);

  const next = useCallback(() => advance(false), [advance]);

  const previous = useCallback(() => {
    if (!current) return;
    if (media.currentTime > 3) {
      media.currentTime = 0;
      return;
    }
    const target = nextIndex({
      current: index,
      length: tracks.length,
      repeat,
      shuffle,
      direction: -1,
      auto: false,
    });
    if (target < 0) return;
    autoplay.current = true;
    setIndex(target);
  }, [current, index, tracks.length, repeat, shuffle, media]);

  const seek = useCallback(
    (seconds: number) => {
      if (!current) return;
      const limit = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : seconds;
      media.currentTime = Math.max(0, Math.min(limit, seconds));
      setTime(media.currentTime);
    },
    [current, media],
  );

  const setVolume = useCallback(
    (value: number) => {
      const next = clampVolume(value);
      onUpdate({ volume: next });
      if (next > 0) setMuted(false);
    },
    [onUpdate],
  );

  const toggleMute = useCallback(() => setMuted(value => !value), []);

  const cycleRepeat = useCallback(() => {
    onUpdate({ repeat: nextRepeatMode(repeat) });
  }, [onUpdate, repeat]);

  const toggleShuffle = useCallback(() => {
    onUpdate({ shuffle: !shuffle });
  }, [onUpdate, shuffle]);

  const remove = useCallback(
    (id: string) => {
      const position = tracks.findIndex(track => track.id === id);
      if (position < 0) return;
      const target = tracks[position];
      if (target?.origin === 'file') URL.revokeObjectURL(target.url);
      const remaining = tracks.filter(track => track.id !== id);
      if (remaining.length === 0) {
        media.pause();
        media.removeAttribute('src');
        setTracks([]);
        setIndex(-1);
        setPlaying(false);
        setTime(0);
        setDuration(0);
        return;
      }
      let nextPosition = index;
      if (position < index) nextPosition = index - 1;
      if (position === index) {
        nextPosition = Math.min(position, remaining.length - 1);
        autoplay.current = true;
      }
      setTracks(remaining);
      setIndex(nextPosition);
    },
    [tracks, index, media],
  );

  const clear = useCallback(() => {
    for (const track of tracks) {
      if (track.origin === 'file') URL.revokeObjectURL(track.url);
    }
    media.pause();
    media.removeAttribute('src');
    setTracks([]);
    setIndex(-1);
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setError(null);
  }, [tracks, media]);

  const value: PlayerApi = {
    tracks,
    current,
    index,
    playing,
    time,
    duration,
    muted,
    repeat,
    shuffle,
    volume: settings.volume,
    error,
    media,
    attach,
    addFiles,
    addLink,
    playAt,
    toggle,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    cycleRepeat,
    toggleShuffle,
    remove,
    clear,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <div className="player-engine-host" ref={hostRef} aria-hidden="true" />
    </PlayerContext.Provider>
  );
}

export function trackKindLabel(kind: MediaKind): string {
  return kind === 'video' ? 'Video' : 'Audio';
}
