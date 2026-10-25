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
  playlistTargetFor,
  titleFromUrl,
  youtubeFault,
  type MediaKind,
  type PlayerFault,
  type Platform,
  type PlayerTrack,
} from '../lib/player';
import {
  clampIntensity,
  type VisualizerMode,
} from '../lib/visualizer';

/**
 * One media element for local files, direct links and Spotify previews, plus a
 * sandboxed YouTube embed for YouTube rows.
 *
 * The local engine is a detached <video>; the YouTube engine is an <iframe>
 * that is never reparented. When the player page is open, its host is positioned
 * over the stage with fixed coordinates; navigating away only hides it, so the
 * audio keeps playing. Object URLs are revoked when a track leaves the queue.
 */
export type LinkResult =
  | {
      ok: true;
      added: number;
      skipped?: number;
      title?: string;
      kind?: 'track' | 'playlist';
    }
  | {
      ok: false;
      reason:
        | 'invalid'
        | 'unsupported'
        | 'platform'
        | 'not-found'
        | 'unavailable'
        | 'offline'
        | 'empty'
        | 'too-large'
        | 'blocked'
        | 'desktop-only';
      platform?: Platform;
    };

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
  /** Why the current row cannot play, in terms the player page explains. */
  error: PlayerFault | null;
  /** A YouTube embed is between "src set" and its first player event. */
  loading: boolean;
  media: HTMLVideoElement;
  /** Move the local engine into a stage, or back to its off-screen home. */
  attach: (node: HTMLElement | null) => void;
  addFiles: (files: FileList | File[]) => { added: number; errors: string[] };
  addLink: (input: string) => Promise<LinkResult>;
  playAt: (index: number) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  /** Visualizer mode and amplitude multiplier, persisted with the settings. */
  visualizer: VisualizerMode;
  visualizerIntensity: number;
  setVisualizer: (mode: VisualizerMode) => void;
  setVisualizerIntensity: (value: number) => void;
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

const YOUTUBE_HOST = /^https:\/\/(www\.|m\.)?youtube(-nocookie)?\.com$/;
const LOOPBACK_BRIDGE = /^http:\/\/127\.0\.0\.1:\d+$/;

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
  const [muted, setMutedState] = useState(false);
  const [error, setError] = useState<PlayerFault | null>(null);
  const [loading, setLoading] = useState(false);
  const autoplay = useRef(true);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const detachStage = useRef<(() => void) | null>(null);
  const youtubeState = useRef(-2);
  const advanceRef = useRef<(auto: boolean) => void>(() => {});
  const volumeRef = useRef(settings.volume);
  volumeRef.current = settings.volume;
  const mutedRef = useRef(false);

  const media = useMemo(() => {
    const element = document.createElement('video');
    element.preload = 'metadata';
    element.playsInline = true;
    element.className = 'player-media';
    element.setAttribute('aria-label', 'Kryvex media player');
    return element;
  }, []);

  const youtube = useMemo(() => {
    const frame = document.createElement('iframe');
    frame.className = 'player-media player-youtube-frame';
    frame.title = 'YouTube player';
    frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
    frame.setAttribute('allowfullscreen', 'true');
    frame.src = 'about:blank';
    return frame;
  }, []);

  const current = index >= 0 ? tracks[index] ?? null : null;
  mutedRef.current = muted;
  const repeat = settings.repeat;
  const shuffle = settings.shuffle;
  const youtubeActive = current?.origin === 'youtube';
  const youtubeActiveRef = useRef(false);
  youtubeActiveRef.current = youtubeActive;

  const postYouTube = useCallback(
    (func: string, args: unknown[] = []) => {
      const target = youtube.contentWindow;
      if (!target) return;
      target.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    },
    [youtube],
  );

  const positionHost = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const stage = stageRef.current;
    if (!youtubeActiveRef.current || !stage) {
      host.classList.remove('is-stage');
      for (const property of ['top', 'left', 'width', 'height']) {
        host.style.removeProperty(property);
      }
      return;
    }
    const rect = stage.getBoundingClientRect();
    host.classList.add('is-stage');
    host.style.top = `${Math.round(rect.top)}px`;
    host.style.left = `${Math.round(rect.left)}px`;
    host.style.width = `${Math.round(rect.width)}px`;
    host.style.height = `${Math.round(rect.height)}px`;
  }, []);

  const attach = useCallback(
    (node: HTMLElement | null) => {
      stageRef.current = node;
      detachStage.current?.();
      detachStage.current = null;
      if (!node) {
        if (media.parentElement !== hostRef.current) hostRef.current?.appendChild(media);
        positionHost();
        return;
      }
      if (!youtubeActiveRef.current && media.parentElement !== node) node.appendChild(media);
      const update = () => positionHost();
      window.addEventListener('resize', update);
      window.addEventListener('scroll', update, true);
      // The stage changes size without the window resizing: the queue grows, a
      // wrapped title makes `.player-now` taller, the media dock appears. A
      // ResizeObserver keeps the overlay on the stage instead of leaving a
      // stale rectangle behind.
      const observer =
        typeof ResizeObserver === 'function' ? new ResizeObserver(() => update()) : null;
      observer?.observe(node);
      detachStage.current = () => {
        observer?.disconnect();
        window.removeEventListener('resize', update);
        window.removeEventListener('scroll', update, true);
      };
      window.requestAnimationFrame(update);
    },
    [media, positionHost],
  );

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
        postYouTube('pauseVideo');
        setPlaying(false);
        setTime(0);
        return;
      }
      autoplay.current = true;
      if (next === index) {
        if (tracks[index]?.origin === 'youtube') {
          postYouTube('seekTo', [0, true]);
          postYouTube('playVideo');
          setPlaying(true);
        } else {
          media.currentTime = 0;
          playMedia();
        }
        return;
      }
      setIndex(next);
    },
    [index, tracks, repeat, shuffle, media, playMedia, postYouTube],
  );

  advanceRef.current = advance;

  useEffect(() => {
    if (!youtubeActive) return;
    const timer = window.setInterval(() => positionHost(), 400);
    return () => window.clearInterval(timer);
  }, [youtubeActive, positionHost]);

  useEffect(() => {
    const host = hostRef.current;
    if (host && youtube.parentElement !== host) host.appendChild(youtube);
    return () => {
      youtube.remove();
    };
  }, [youtube]);

  useEffect(() => {
    const onLoad = () => {
      const target = youtube.contentWindow;
      if (!target) return;
      target.postMessage(
        JSON.stringify({ event: 'listening', id: 'kryvex-player', channel: 'widget' }),
        '*',
      );
      postYouTube('setVolume', [Math.round(clampVolume(volumeRef.current) * 100)]);
      postYouTube(mutedRef.current ? 'mute' : 'unMute');
      if (autoplay.current && youtubeActiveRef.current) {
        window.setTimeout(() => postYouTube('playVideo'), 180);
      }
    };
    youtube.addEventListener('load', onLoad);
    return () => youtube.removeEventListener('load', onLoad);
  }, [youtube, postYouTube]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== youtube.contentWindow) return;
      // Desktop uses the loopback bridge because a file:// parent triggers
      // YouTube Error 153; the web preview can still talk to the embed direct.
      if (!YOUTUBE_HOST.test(event.origin) && !LOOPBACK_BRIDGE.test(event.origin)) return;
      let data: unknown;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!data || typeof data !== 'object') return;
      const message = data as Record<string, unknown>;
      if (message.event === 'onError') {
        const code =
          typeof message.info === 'number'
            ? message.info
            : typeof message.data === 'number'
              ? message.data
              : message.info;
        setPlaying(false);
        setLoading(false);
        setError(youtubeFault(code));
        return;
      }
      const info =
        message.info && typeof message.info === 'object'
          ? (message.info as Record<string, unknown>)
          : null;
      if (!info) return;
      if (typeof info.currentTime === 'number' && Number.isFinite(info.currentTime)) {
        setTime(Math.max(0, info.currentTime));
      }
      if (typeof info.duration === 'number' && Number.isFinite(info.duration)) {
        setDuration(Math.max(0, info.duration));
      }
      const videoData =
        info.videoData && typeof info.videoData === 'object'
          ? (info.videoData as Record<string, unknown>)
          : null;
      if (videoData && typeof videoData.errorCode === 'string' && videoData.errorCode) {
        setPlaying(false);
        setError('unplayable');
      }
      if (typeof info.playerState === 'number') {
        const state = info.playerState;
        if (state === 1 || state === 2 || state === 3 || state === 0) setLoading(false);
        const previous = youtubeState.current;
        youtubeState.current = state;
        if (state === 0) {
          setPlaying(false);
          if (previous === 1 || previous === 3) advanceRef.current(true);
        } else if (state === 1 || state === 3) {
          setPlaying(true);
          setError(null);
        } else if (state === 2 || state === 5 || state === -1) {
          setPlaying(false);
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [youtube]);

  useEffect(() => {
    // While a YouTube row owns playback the local element has no source. Its
    // teardown events (error, pause, duration 0) must not overwrite the embed's
    // transport state.
    const onTime = () => {
      if (!youtubeActiveRef.current) setTime(media.currentTime || 0);
    };
    const onDuration = () => {
      if (!youtubeActiveRef.current) {
        setDuration(Number.isFinite(media.duration) ? media.duration : 0);
      }
    };
    const onPlay = () => {
      if (youtubeActiveRef.current) return;
      setPlaying(true);
      setError(null);
    };
    const onPause = () => {
      if (!youtubeActiveRef.current) setPlaying(false);
    };
    const onWaiting = () => {
      if (!youtubeActiveRef.current) setError(null);
    };
    const onEnded = () => {
      if (!youtubeActiveRef.current) advance(true);
    };
    const onError = () => {
      if (youtubeActiveRef.current) return;
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

  useEffect(() => {
    // The player page's effect runs before this one, so do not call attach(null)
    // here: it would clear a stage that is already mounted and leave the local
    // engine stranded in its hidden host.
    const host = hostRef.current;
    if (host && !stageRef.current && media.parentElement !== host) {
      host.appendChild(media);
    }
    return () => {
      detachStage.current?.();
      detachStage.current = null;
      stageRef.current = null;
    };
  }, [media]);

  useEffect(() => {
    media.volume = clampVolume(settings.volume);
    postYouTube('setVolume', [Math.round(clampVolume(settings.volume) * 100)]);
  }, [media, postYouTube, settings.volume]);

  useEffect(() => {
    media.muted = muted;
    postYouTube(muted ? 'mute' : 'unMute');
  }, [media, muted, postYouTube]);

  useEffect(() => {
    const track = current;
    if (!track) {
      media.pause();
      media.removeAttribute('src');
      media.load();
      postYouTube('pauseVideo');
      if (youtube.src !== 'about:blank') youtube.src = 'about:blank';
      if (hostRef.current && media.parentElement !== hostRef.current) {
        hostRef.current.appendChild(media);
      }
      setTime(0);
      setDuration(0);
      setPlaying(false);
      setError(null);
      positionHost();
      return;
    }

    if (track.origin === 'youtube') {
      media.pause();
      media.removeAttribute('src');
      media.load();
      if (hostRef.current && media.parentElement !== hostRef.current) {
        hostRef.current.appendChild(media);
      }
      setTime(0);
      setDuration(track.durationMs ? track.durationMs / 1000 : 0);
      setPlaying(false);
      setError(null);
      setLoading(true);
      youtubeState.current = -2;
      if (!track.sourceId) {
        setError('unplayable');
        return;
      }
      const direct =
        `https://www.youtube.com/embed/${encodeURIComponent(track.sourceId)}` +
        `?enablejsapi=1&autoplay=${autoplay.current ? '1' : '0'}` +
        '&controls=1&playsinline=1&rel=0&modestbranding=1';
      const bridge = window.kryvex;
      let live = true;
      if (bridge?.playerEmbedUrl) {
        void bridge
          .playerEmbedUrl(track.sourceId, autoplay.current)
          .then(url => {
            if (live) youtube.src = url ?? direct;
          })
          .catch(() => {
            if (live) youtube.src = direct;
          });
      } else {
        youtube.src = direct;
      }
      positionHost();
      return () => {
        live = false;
      };
    }

    if (!track.url) {
      media.pause();
      media.removeAttribute('src');
      media.load();
      setTime(0);
      setDuration(track.durationMs ? track.durationMs / 1000 : 0);
      setPlaying(false);
      setError(track.origin === 'spotify' ? 'no-preview' : 'unplayable');
      positionHost();
      return;
    }

    postYouTube('pauseVideo');
    if (youtube.src !== 'about:blank') youtube.src = 'about:blank';
    if (stageRef.current && media.parentElement !== stageRef.current) {
      stageRef.current.appendChild(media);
    } else if (!stageRef.current && hostRef.current && media.parentElement !== hostRef.current) {
      hostRef.current.appendChild(media);
    }
    media.src = track.url;
    media.load();
    setTime(0);
    setDuration(0);
    setError(null);
    setLoading(false);
    if (autoplay.current) playMedia();
    positionHost();
  }, [current?.id, media, playMedia, positionHost, postYouTube, youtube]);

  useEffect(
    () => () => {
      media.pause();
      media.removeAttribute('src');
      youtube.src = 'about:blank';
    },
    [media, youtube],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
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
      if (tracks.length === 0) {
        autoplay.current = true;
        setIndex(0);
      }
      return { added: fresh.length, errors };
    },
    [tracks.length],
  );

  const addLink = useCallback(
    async (input: string): Promise<LinkResult> => {
      const target = playlistTargetFor(input);
      if (target) {
        const bridge = window.kryvex;
        if (!bridge?.playlistResolve) {
          return { ok: false, reason: 'desktop-only' };
        }
        let result: Awaited<ReturnType<typeof bridge.playlistResolve>>;
        try {
          result = await bridge.playlistResolve(input);
        } catch {
          return { ok: false, reason: 'offline' };
        }
        if (!result.ok) {
          const reason =
            result.error === 'not-found' ||
            result.error === 'unavailable' ||
            result.error === 'offline' ||
            result.error === 'empty' ||
            result.error === 'too-large' ||
            result.error === 'blocked'
              ? result.error
              : 'unsupported';
          return { ok: false, reason };
        }
        const source = result.tracks ?? [];
        const seen = new Set(
          tracks.map(track => `${track.origin}:${track.sourceId ?? track.url}`),
        );
        const fresh: PlayerTrack[] = [];
        let duplicates = 0;
        for (const track of source) {
          const key = `${track.platform}:${track.sourceId}`;
          if (seen.has(key)) {
            duplicates += 1;
            continue;
          }
          seen.add(key);
          fresh.push({
            id: makeId('m'),
            title: track.title,
            subtitle: track.artist || (track.platform === 'spotify' ? 'Spotify' : 'YouTube'),
            url: track.platform === 'youtube' ? track.externalUrl : track.url,
            kind: target.provider === 'youtube' ? 'video' : 'audio',
            art: track.art ?? (track.platform === 'youtube'
              ? `https://i.ytimg.com/vi/${track.sourceId}/mqdefault.jpg`
              : undefined),
            previewOnly: track.platform === 'spotify' && !track.url,
            origin: track.platform,
            platform: track.platform,
            externalUrl: track.externalUrl,
            sourceId: track.sourceId,
            durationMs: track.durationMs,
            size: 0,
            addedAt: Date.now(),
          });
        }
        if (fresh.length > 0) {
          setTracks(previous => [...previous, ...fresh]);
          if (tracks.length === 0) {
            autoplay.current = true;
            setIndex(0);
          }
        }
        return {
          ok: true,
          added: fresh.length,
          skipped: duplicates + (result.skipped ?? 0),
          title: result.title,
          kind: target.kind === 'track' || target.kind === 'video' ? 'track' : 'playlist',
        };
      }

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
      return { ok: true, added: 1, kind: 'track' };
    },
    [tracks],
  );

  const playAt = useCallback(
    (next: number) => {
      if (next < 0 || next >= tracks.length) return;
      autoplay.current = true;
      if (next === index) {
        if (tracks[next]?.origin === 'youtube') {
          postYouTube('seekTo', [0, true]);
          postYouTube('playVideo');
          setPlaying(true);
          return;
        }
        media.currentTime = 0;
        playMedia();
        return;
      }
      setIndex(next);
    },
    [tracks, index, media, playMedia, postYouTube],
  );

  const toggle = useCallback(() => {
    if (!current) return;
    if (current.origin === 'youtube') {
      autoplay.current = true;
      if (playing) {
        postYouTube('pauseVideo');
        setPlaying(false);
      } else {
        postYouTube('playVideo');
        setPlaying(true);
      }
      return;
    }
    if (media.paused) {
      autoplay.current = true;
      playMedia();
    } else {
      media.pause();
    }
  }, [current, media, playMedia, playing, postYouTube]);

  const next = useCallback(() => advance(false), [advance]);

  const previous = useCallback(() => {
    if (!current) return;
    const inTrack = current.origin === 'youtube' ? time : media.currentTime;
    if (inTrack > 3) {
      if (current.origin === 'youtube') {
        postYouTube('seekTo', [0, true]);
        setTime(0);
      } else {
        media.currentTime = 0;
      }
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
  }, [current, index, tracks.length, repeat, shuffle, media, postYouTube, time]);

  const seek = useCallback(
    (seconds: number) => {
      if (!current) return;
      if (current.origin === 'youtube') {
        const limit = duration > 0 ? duration : seconds;
        const target = Math.max(0, Math.min(limit, seconds));
        postYouTube('seekTo', [target, true]);
        setTime(target);
        return;
      }
      const limit = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : seconds;
      media.currentTime = Math.max(0, Math.min(limit, seconds));
      setTime(media.currentTime);
    },
    [current, duration, media, postYouTube],
  );

  const setVolume = useCallback(
    (value: number) => {
      const next = clampVolume(value);
      onUpdate({ volume: next });
      if (next > 0) setMutedState(false);
    },
    [onUpdate],
  );

  const toggleMute = useCallback(() => setMutedState(value => !value), []);

  const setVisualizer = useCallback(
    (mode: VisualizerMode) => onUpdate({ visualizer: mode }),
    [onUpdate],
  );

  const setVisualizerIntensity = useCallback(
    (value: number) => onUpdate({ visualizerIntensity: clampIntensity(value) }),
    [onUpdate],
  );

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
        postYouTube('pauseVideo');
        youtube.src = 'about:blank';
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
    [tracks, index, media, postYouTube, youtube],
  );

  const clear = useCallback(() => {
    for (const track of tracks) {
      if (track.origin === 'file') URL.revokeObjectURL(track.url);
    }
    media.pause();
    media.removeAttribute('src');
    postYouTube('pauseVideo');
    youtube.src = 'about:blank';
    setTracks([]);
    setIndex(-1);
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setError(null);
  }, [tracks, media, postYouTube, youtube]);

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
    loading,
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
    visualizer: settings.visualizer,
    visualizerIntensity: settings.visualizerIntensity,
    setVisualizer,
    setVisualizerIntensity,
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
