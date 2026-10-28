import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PartySettings, PartySource } from '../types';
import { useI18n } from '../lib/i18n';
import { partySession, type InputEvent } from '../lib/party';
import {
  DEFAULT_TRACKERS,
  PEER_COLORS,
  formatInvite,
  initials,
  monitorShareByDefault,
  newRoomId,
  parseInvite,
  sanitizeDisplayName,
} from '../lib/party-rules';
import { Icon } from '../components/ui';
import { VirtualLanPanel } from '../components/VirtualLanPanel';

interface RoomsProps {
  settings: PartySettings;
  isElectron: boolean;
  initialRoom?: string | null;
  onUpdateParty: (patch: Partial<PartySettings>) => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
  /**
   * Pops the room out into a window over the app. A room is a place somebody
   * watches while doing something else, so the shell offers this; a build with
   * nowhere to put the window passes nothing and the control is not drawn.
   */
  onPopOut?: () => void;
  /** Rendered inside that window: the window owns the title bar. */
  embedded?: boolean;
}

type OverlayBox = { x: number; y: number; width: number; alpha: number };

function dayLabel(at: number, locale: string): string {
  const date = new Date(at);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (sameDay) return '';
  if (isYesterday) return 'yesterday';
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

function VideoTile({
  stream,
  label,
  color,
  muted,
  badge,
  volume = 1,
  interactive = false,
  onInput,
}: {
  stream: MediaStream;
  label: string;
  color: string;
  muted: boolean;
  badge: string;
  volume?: number;
  interactive?: boolean;
  onInput?: (event: InputEvent) => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.srcObject = stream;
    const play = () => void node.play().catch(() => undefined);
    play();
    node.addEventListener('loadedmetadata', play);
    return () => node.removeEventListener('loadedmetadata', play);
  }, [stream]);

  useEffect(() => {
    if (ref.current) ref.current.volume = Math.min(1, Math.max(0, volume));
  }, [volume]);

  const point = (event: React.MouseEvent<HTMLVideoElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / Math.max(1, rect.width),
      y: (event.clientY - rect.top) / Math.max(1, rect.height),
    };
  };

  return (
    <figure
      className={`room-tile ${interactive ? 'is-controlling' : ''}`}
      style={{ '--tile-accent': color } as React.CSSProperties}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        tabIndex={interactive ? 0 : undefined}
        onPointerMove={
          interactive && onInput
            ? event => onInput({ kind: 'move', ...point(event) })
            : undefined
        }
        onPointerDown={
          interactive && onInput
            ? event => {
                event.currentTarget.focus();
                onInput({
                  kind: 'down',
                  ...point(event),
                  button: event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left',
                });
              }
            : undefined
        }
        onPointerUp={
          interactive && onInput
            ? event => onInput({ kind: 'up', ...point(event) })
            : undefined
        }
        onWheel={
          interactive && onInput
            ? event => onInput({ kind: 'wheel', ...point(event), deltaY: event.deltaY })
            : undefined
        }
        onKeyDown={
          interactive && onInput
            ? event => {
                event.preventDefault();
                onInput({ kind: 'key', key: event.key });
              }
            : undefined
        }
      />
      <figcaption>
        <span className="room-dot" style={{ background: color }} aria-hidden="true" />
        <span className="room-tile-name">{label}</span>
        <span className="mono room-tile-badge">{badge}</span>
      </figcaption>
    </figure>
  );
}

export function Rooms({
  settings,
  isElectron,
  initialRoom = null,
  onUpdateParty,
  onToast,
  onPopOut,
  embedded = false,
}: RoomsProps) {
  const { t, locale } = useI18n();
  const session = partySession;
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);

  const [joinText, setJoinText] = useState('');
  const [draft, setDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sources, setSources] = useState<PartySource[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [withAudio, setWithAudio] = useState(false);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareMuted, setShareMuted] = useState(false);
  const [monitor, setMonitor] = useState(false);
  const [remoteVolume, setRemoteVolume] = useState(0.9);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [tileSize, setTileSize] = useState<'s' | 'm' | 'l'>('m');
  const [theatre, setTheatre] = useState(false);
  const [overlay, setOverlay] = useState<OverlayBox>({
    x: 24,
    y: 24,
    width: 320,
    alpha: 0.82,
  });
  const [overlayShown, setOverlayShown] = useState(true);
  const [popout, setPopout] = useState(false);
  const chatEnd = useRef<HTMLDivElement | null>(null);
  const autoJoined = useRef(false);
  const monitorGraph = useRef<AudioContext | null>(null);
  const popoutWindow = useRef<Window | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  /** webContents id of the Kryvex app being shared, so control can address it. */
  const sharedAppId = useRef<number | null>(null);

  const displayName = settings.displayName;
  const color = settings.color || PEER_COLORS[0]!;
  const share = state.share;

  const startRoom = useCallback(
    (roomId: string) => {
      session.join(roomId, settings, displayName);
      const recent = [roomId, ...settings.recentRooms.filter(id => id !== roomId)].slice(0, 6);
      onUpdateParty({ recentRooms: recent });
    },
    [displayName, onUpdateParty, session, settings],
  );

  useEffect(() => {
    if (autoJoined.current || !initialRoom) return;
    autoJoined.current = true;
    startRoom(initialRoom);
  }, [initialRoom, startRoom]);

  // No leave-on-unmount: the session belongs to the application, so switching
  // service tabs keeps the membership, the chat and any live stream.

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' });
  }, [state.messages.length, share?.peerId]);

  useEffect(() => {
    if (state.status === 'error' && state.error) onToast(state.error, 'danger');
  }, [onToast, state.error, state.status]);

  // Host side of remote control: an event from the granted peer is injected
  // into the Kryvex app that is being shared. Screen and window captures cannot
  // be reached this way, so the UI never offers control for them.
  useEffect(() => {
    session.onInput = (event: InputEvent) => {
      if (!state.local) return;
      const view = Array.from(document.querySelectorAll('webview')).find(candidate => {
        const id = (candidate as unknown as { getWebContentsId?: () => number })
          .getWebContentsId?.();
        return sharedAppId.current !== null && id === sharedAppId.current;
      }) as (HTMLElement & {
        sendInputEvent?: (input: Record<string, unknown>) => void;
        getBoundingClientRect: () => DOMRect;
      }) | undefined;
      if (!view?.sendInputEvent) return;
      const rect = view.getBoundingClientRect();
      const x = Math.round((event.x ?? 0) * rect.width);
      const y = Math.round((event.y ?? 0) * rect.height);
      if (event.kind === 'move') {
        view.sendInputEvent({ type: 'mouseMove', x, y });
        return;
      }
      if (event.kind === 'down' || event.kind === 'up') {
        view.sendInputEvent({
          type: event.kind === 'down' ? 'mouseDown' : 'mouseUp',
          x,
          y,
          button: event.button ?? 'left',
          clickCount: 1,
        });
        return;
      }
      if (event.kind === 'wheel') {
        view.sendInputEvent({
          type: 'mouseWheel',
          x,
          y,
          deltaX: 0,
          deltaY: Math.round(event.deltaY ?? 0),
          canScroll: true,
        });
        return;
      }
      if (event.kind === 'key' && event.key) {
        // Single characters go as `char`, named keys as `keyDown`.
        if (event.key.length === 1) {
          view.sendInputEvent({ type: 'char', keyCode: event.key });
        } else {
          view.sendInputEvent({ type: 'keyDown', keyCode: event.key });
        }
      }
    };
    return () => {
      session.onInput = null;
    };
  }, [session, state.local]);

  // Local monitoring of the captured audio. Chromium silences the tab it
  // captures, so a sharer who shares a tab's audio stops hearing it; routing the
  // captured track back to the speakers restores it.
  useEffect(() => {
    const local = state.local;
    if (!local) {
      monitorGraph.current?.close().catch(() => undefined);
      monitorGraph.current = null;
      return;
    }
    if (!monitor || local.stream.getAudioTracks().length === 0) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      const context = new Ctor();
      const source = context.createMediaStreamSource(local.stream);
      source.connect(context.destination);
      monitorGraph.current = context;
      void context.resume().catch(() => undefined);
    } catch {
      /* monitoring is a convenience; the share itself keeps working */
    }
    return () => {
      monitorGraph.current?.close().catch(() => undefined);
      monitorGraph.current = null;
    };
  }, [monitor, state.local]);

  useEffect(() => {
    if (!popout) {
      popoutWindow.current?.close();
      popoutWindow.current = null;
    }
  }, [popout]);

  async function copyInvite() {
    if (!state.roomId) return;
    const link = formatInvite(state.roomId);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      onToast(t('Invite copied.'), 'success');
    } catch {
      onToast(t('Copy the room code instead.'), 'warning');
    }
  }

  function joinByCode() {
    const roomId = parseInvite(joinText);
    if (!roomId) {
      onToast(t('That room code or invite link is not valid.'), 'warning');
      return;
    }
    setJoinText('');
    startRoom(roomId);
  }

  async function openPicker() {
    if (!isElectron || !window.kryvex) {
      onToast(t('Screen sharing needs the desktop app.'), 'warning');
      return;
    }
    setPickerOpen(true);
    setSources(null);
    setSelected(null);
    try {
      const list = await window.kryvex.partySources();
      setSources(list);
      setSelected(list[0]?.id ?? null);
    } catch {
      setSources([]);
      onToast(t('Capture sources could not be listed.'), 'danger');
    }
  }

  async function beginShare() {
    if (!window.kryvex || !selected || starting) return;
    const source = sources?.find(item => item.id === selected);
    setStarting(true);
    try {
      const armed = await window.kryvex.partySelectSource(selected, withAudio);
      if (!armed) {
        onToast(t('That source could not be selected.'), 'danger');
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: withAudio });
      } catch (error) {
        if (!withAudio) throw error;
        // Some platforms refuse system audio; keep the video.
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        onToast(t('Shared without system audio.'), 'warning');
      }
      const appMatch = /^app:(\d+)$/.exec(selected);
      sharedAppId.current = appMatch ? Number(appMatch[1]) : null;
      setShareMuted(false);
      // An app capture is muted by Chromium; a screen capture is the system
      // mix the sharer already hears. Monitoring the second one doubled it.
      setMonitor(monitorShareByDefault(Boolean(appMatch), stream.getAudioTracks().length > 0));
      await session.startShare(stream, source?.name ?? t('Screen'));
      setPickerOpen(false);
    } catch {
      onToast(t('The share could not start.'), 'danger');
    } finally {
      setStarting(false);
    }
  }

  function stopShare() {
    session.stopShare();
    sharedAppId.current = null;
    setMonitor(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    onToast(t('Share stopped.'), 'info');
  }

  function toggleShareAudio() {
    const enabled = shareMuted;
    if (!session.setShareAudioEnabled(enabled)) {
      onToast(t('This capture has no audio track.'), 'info');
      return;
    }
    setShareMuted(!enabled);
  }

  async function toggleFullscreen() {
    const node = stageRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setTheatre(false);
      } else {
        await node.requestFullscreen();
        setTheatre(true);
      }
    } catch {
      setTheatre(current => !current);
    }
  }

  function openPopout() {
    const stream = share?.stream ?? state.local?.stream;
    if (!stream) return;
    if (!isElectron) {
      const opened = window.open('', `kryvex-share-${state.roomId ?? 'room'}`, 'popup,width=960,height=600');
      const video = opened?.document.createElement('video');
      if (opened && video) {
        opened.document.title = t('Kryvex share');
        opened.document.body.style.cssText = 'margin:0;background:#000;display:grid;place-items:center;height:100vh';
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = Boolean(state.local);
        video.style.cssText = 'width:100%;height:100%;object-fit:contain';
        opened.document.body.appendChild(video);
        popoutWindow.current = opened;
        setPopout(true);
        return;
      }
      onToast(t('A separate window was blocked, so the share stays in this view.'), 'warning');
      setPopout(true);
      return;
    }
    // In Electron the shell keeps the stream; the in-app panel is the fallback
    // and the fullscreen view is the native path.
    setPopout(true);
  }

  function sendDraft() {
    if (!session.send(draft)) return;
    setDraft('');
  }

  const inRoom = state.status === 'joined' || state.status === 'joining';
  const peerCount = state.peers.length;
  const control = state.control;
  const grantedToMe = Boolean(control && control.state === 'granted' && !state.local);
  const sharedIsApp = sharedAppId.current !== null;

  return (
    <section className={`view rooms-view ${embedded ? 'is-embedded' : ''}`}>
      {embedded ? null : (
        <header className="view-head">
          <div>
            <p className="eyebrow mono">{t('ROOMS / PEER TO PEER')}</p>
            <h1>{t('Rooms')}</h1>
            <p className="lede">
              {t(
                'Open a room, send the link, and share a screen, a window or one of your apps. Names and chat stay in the room; media goes straight between you.',
              )}
            </p>
          </div>
          {onPopOut ? (
            <div className="view-head-actions">
              <button className="btn secondary small" onClick={onPopOut}>
                <Icon name="monitor" size={14} />
                {t('Pop out')}
              </button>
            </div>
          ) : null}
        </header>
      )}

      {!inRoom ? (
        <div className="rooms-lobby">
          <section className="settings-block panel room-card">
            <h2>{t('Start a room')}</h2>
            <p className="settings-copy">
              {t('A room code is the invite. Anyone who has it can join; nothing is listed publicly.')}
            </p>
            <label className="room-field">
              <span>{t('Display name')}</span>
              <input
                value={displayName}
                maxLength={24}
                placeholder={t('Guest')}
                aria-label={t('Display name')}
                onChange={event => onUpdateParty({ displayName: sanitizeDisplayName(event.target.value) })}
              />
            </label>
            <div className="room-colors" role="group" aria-label={t('Your colour')}>
              {PEER_COLORS.map(swatch => (
                <button
                  key={swatch}
                  className={`room-swatch ${swatch === color ? 'is-active' : ''}`}
                  style={{ background: swatch }}
                  aria-label={t('Use {color}', { color: swatch })}
                  aria-pressed={swatch === color}
                  onClick={() => onUpdateParty({ color: swatch })}
                />
              ))}
            </div>
            <button
              className="btn primary"
              data-shot="create-room"
              onClick={() => startRoom(newRoomId())}
              disabled={!isElectron}
            >
              <Icon name="users" size={15} />
              {t('Create a room')}
            </button>
            {!isElectron ? (
              <p className="shield-note">{t('Rooms run in the desktop app.')}</p>
            ) : null}
          </section>

          <section className="settings-block panel room-card">
            <h2>{t('Join a room')}</h2>
            <p className="settings-copy">
              {t('Paste a room code or a kryvex://room link from whoever invited you.')}
            </p>
            <div className="room-join-row">
              <input
                value={joinText}
                spellCheck={false}
                placeholder="kryvex://room/…"
                aria-label={t('Room code or invite link')}
                onChange={event => setJoinText(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') joinByCode();
                }}
              />
              <button className="btn secondary" onClick={joinByCode} disabled={!isElectron}>
                {t('Join')}
              </button>
            </div>

            {settings.recentRooms.length > 0 ? (
              <div className="room-recent">
                <span className="mono room-recent-label">{t('RECENT')}</span>
                {settings.recentRooms.map(id => (
                  <div className="room-recent-row" key={id}>
                    <button className="link mono" onClick={() => startRoom(id)}>
                      {id}
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={t('Forget {room}', { room: id })}
                      onClick={() =>
                        onUpdateParty({
                          recentRooms: settings.recentRooms.filter(room => room !== id),
                        })
                      }
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <p className="rooms-note mono">
              {t('Signaling: public WebTorrent trackers · Media: direct WebRTC')}
            </p>
          </section>
        </div>
      ) : (
        <div className="room-shell">
          <header className="room-head">
            <div className="room-identity">
              <span className="room-live" aria-hidden="true" />
              <div>
                <strong>{t('Room')}</strong>
                <span className="mono room-code">{state.roomId}</span>
              </div>
            </div>
            <div className="room-head-actions">
              <span className="mono room-count">
                {peerCount === 1 ? t('1 HERE') : t('{count} HERE', { count: peerCount })}
              </span>
              {/* A room is often left open while the reader works elsewhere, so
                  the pop-out is offered from inside it too, not only in the
                  lobby where it is less useful. */}
              {onPopOut && !embedded ? (
                <button
                  className="btn ghost small"
                  onClick={onPopOut}
                  title={t('Pop out')}
                  aria-label={t('Pop out')}
                >
                  <Icon name="monitor" size={13} />
                  {t('Pop out')}
                </button>
              ) : null}
              <button className="btn ghost small" onClick={() => void copyInvite()}>
                <Icon name="check" size={13} />
                {copied ? t('Copied') : t('Copy invite')}
              </button>
              <button
                className="btn danger-outline small"
                onClick={() => {
                  session.leave();
                  onToast(t('You left the room.'), 'info');
                }}
              >
                {t('Leave')}
              </button>
            </div>
          </header>

          {/* Virtual LAN sits between the room header and the stage, as asked:
              the room stays chat and sharing, and the network is an optional
              extra a member opts into. */}
          <VirtualLanPanel
            isElectron={isElectron}
            peers={state.peers}
            shared={state.vlan}
            mine={state.myVlan}
            onShare={(ip, engine) => session.shareVlan(ip, engine)}
            onStop={() => session.stopVlan()}
            onToast={onToast}
          />

          <div className={`room-body ${theatre ? 'is-theatre' : ''}`}>
            <div className={`room-stage size-${tileSize}`} ref={stageRef}>
              {state.local || share ? (
                <div className="room-tiles">
                  {state.local ? (
                    <VideoTile
                      stream={state.local.stream}
                      label={state.selfName || t('You')}
                      color={state.selfColor}
                      muted
                      badge={t('YOU · SHARING')}
                    />
                  ) : null}
                  {share ? (
                    <VideoTile
                      stream={share.stream}
                      label={share.name}
                      color={state.peers.find(peer => peer.id === share.peerId)?.color ?? color}
                      muted={remoteMuted}
                      volume={remoteVolume}
                      badge={grantedToMe ? t('REMOTE CONTROL') : t('SHARING')}
                      interactive={grantedToMe}
                      onInput={event => session.forwardInput(event)}
                    />
                  ) : null}
                </div>
              ) : (
                <div className="room-empty">
                  <Icon name="users" size={30} />
                  <h2>{t('Nobody is sharing yet')}</h2>
                  <p>
                    {t(
                      'Share a screen, a window or one of your open apps. Viewers see it live and keep their own chat.',
                    )}
                  </p>
                  {peerCount > 1 ? (
                    <p className="mono room-waiting">{t('Waiting for a share…')}</p>
                  ) : null}
                </div>
              )}

              {theatre && overlayShown ? (
                <div
                  className="room-overlay"
                  style={
                    {
                      left: overlay.x,
                      top: overlay.y,
                      width: overlay.width,
                      '--overlay-alpha': overlay.alpha,
                    } as React.CSSProperties
                  }
                >
                  <header
                    className="room-overlay-head"
                    onPointerDown={event => {
                      const startX = event.clientX;
                      const startY = event.clientY;
                      const origin = { x: overlay.x, y: overlay.y };
                      const move = (moveEvent: PointerEvent) => {
                        setOverlay(current => ({
                          ...current,
                          x: Math.max(0, origin.x + moveEvent.clientX - startX),
                          y: Math.max(0, origin.y + moveEvent.clientY - startY),
                        }));
                      };
                      const up = () => {
                        window.removeEventListener('pointermove', move);
                        window.removeEventListener('pointerup', up);
                      };
                      window.addEventListener('pointermove', move);
                      window.addEventListener('pointerup', up);
                    }}
                  >
                    <span className="mono">{t('CHAT OVERLAY')}</span>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={Math.round(overlay.alpha * 100)}
                      aria-label={t('Overlay opacity')}
                      onChange={event =>
                        setOverlay(current => ({
                          ...current,
                          alpha: Number(event.target.value) / 100,
                        }))
                      }
                    />
                    <button
                      className="icon-btn"
                      aria-label={t('Hide the overlay')}
                      onClick={() => setOverlayShown(false)}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </header>
                  <div className="room-overlay-log">
                    {state.messages.slice(-8).map(message => (
                      <p key={message.id}>
                        <strong style={{ color: message.color }}>{message.name}</strong>{' '}
                        {message.text}
                      </p>
                    ))}
                  </div>
                  <div
                    className="room-overlay-resize"
                    onPointerDown={event => {
                      const startX = event.clientX;
                      const startWidth = overlay.width;
                      const move = (moveEvent: PointerEvent) => {
                        setOverlay(current => ({
                          ...current,
                          width: Math.max(220, Math.min(620, startWidth + moveEvent.clientX - startX)),
                        }));
                      };
                      const up = () => {
                        window.removeEventListener('pointermove', move);
                        window.removeEventListener('pointerup', up);
                      };
                      window.addEventListener('pointermove', move);
                      window.addEventListener('pointerup', up);
                    }}
                    aria-hidden="true"
                  />
                </div>
              ) : null}

              {theatre && !overlayShown ? (
                <button
                  className="room-overlay-show"
                  onClick={() => setOverlayShown(true)}
                >
                  <Icon name="note" size={13} />
                  {t('Show chat')}
                </button>
              ) : null}

              {popout ? (
                <div className="room-popout" role="dialog" aria-label={t('Shared stream')}>
                  <header>
                    <span className="mono">{t('POPPED OUT')}</span>
                    <button className="icon-btn" aria-label={t('Close')} onClick={() => setPopout(false)}>
                      <Icon name="close" size={13} />
                    </button>
                  </header>
                  <span className="room-popout-body">
                    {t('This build keeps the stream docked; fullscreen gives it the whole window.')}
                  </span>
                </div>
              ) : null}

              <div className="room-stage-bar">
                {state.local ? (
                  <>
                    <button className="btn danger-outline small" onClick={stopShare}>
                      <Icon name="close" size={13} />
                      {t('Stop sharing')}
                    </button>
                    {session.hasShareAudio() ? (
                      <button
                        className={`btn ghost small ${shareMuted ? 'is-on' : ''}`}
                        onClick={toggleShareAudio}
                      >
                        <Icon name={shareMuted ? 'mute' : 'volume'} size={13} />
                        {shareMuted ? t('Unmute shared audio') : t('Mute shared audio')}
                      </button>
                    ) : null}
                    {session.hasShareAudio() ? (
                      <label className="room-monitor">
                        <input
                          type="checkbox"
                          checked={monitor}
                          onChange={event => setMonitor(event.target.checked)}
                        />
                        {t('Play it here')}
                      </label>
                    ) : null}
                  </>
                ) : (
                  <button className="btn primary small" data-shot="share" onClick={() => void openPicker()}>
                    <Icon name="monitor" size={14} />
                    {t('Share something')}
                  </button>
                )}

                {share ? (
                  <>
                    <button
                      className="icon-btn"
                      aria-label={remoteMuted ? t('Unmute') : t('Mute')}
                      onClick={() => setRemoteMuted(value => !value)}
                    >
                      <Icon name={remoteMuted ? 'mute' : 'volume'} size={14} />
                    </button>
                    <input
                      className="room-volume"
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(remoteVolume * 100)}
                      aria-label={t('Shared stream volume')}
                      onChange={event => {
                        setRemoteVolume(Number(event.target.value) / 100);
                        if (Number(event.target.value) > 0) setRemoteMuted(false);
                      }}
                    />
                  </>
                ) : null}

                <div className="segmented" role="group" aria-label={t('Stream size')}>
                  {(['s', 'm', 'l'] as const).map(size => (
                    <button
                      key={size}
                      type="button"
                      className={tileSize === size ? 'is-active' : ''}
                      aria-pressed={tileSize === size}
                      onClick={() => setTileSize(size)}
                    >
                      {size.toUpperCase()}
                    </button>
                  ))}
                </div>
                <button className="icon-btn" aria-label={t('Fullscreen')} onClick={() => void toggleFullscreen()}>
                  <Icon name="monitor" size={14} />
                </button>
                <button
                  className="icon-btn"
                  aria-label={t('Pop out')}
                  onClick={openPopout}
                  disabled={!state.local && !share}
                >
                  <Icon name="external" size={14} />
                </button>
                <span className="mono room-hint">
                  {state.local
                    ? t('{label} is live', { label: state.local.label })
                    : peerCount > 1
                      ? t('Waiting for a share…')
                      : t('Send the invite to bring someone in.')}
                </span>
              </div>
            </div>

            <aside className="room-chat" aria-label={t('Room chat')}>
              <div className="room-chat-head">
                <span className="mono">{t('PEOPLE')}</span>
                <div className="room-people">
                  {state.peers.map(peer => (
                    <span className="room-person" key={peer.id}>
                      <span
                        className="room-avatar"
                        style={{ background: peer.color }}
                        aria-hidden="true"
                      >
                        {initials(peer.name)}
                      </span>
                      <span className="room-person-name">
                        {peer.name}
                        {peer.self ? ` (${t('you')})` : ''}
                      </span>
                      {peer.sharing ? <span className="mono room-person-tag">{t('LIVE')}</span> : null}
                    </span>
                  ))}
                </div>
              </div>

              {share || state.local ? (
                <div className="room-control">
                  <span className="mono room-control-title">{t('REMOTE CONTROL')}</span>
                  {state.local ? (
                    control ? (
                      <>
                        <p>
                          {control.state === 'granted'
                            ? t('{name} can control this share.', { name: control.name })
                            : t('{name} is asking to control this share.', { name: control.name })}
                        </p>
                        {control.state === 'requested' ? (
                          <button className="btn primary tiny" onClick={() => session.grantControl()}>
                            {t('Allow')}
                          </button>
                        ) : (
                          <button className="btn ghost tiny" onClick={() => session.revokeControl()}>
                            {t('Take control back')}
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="room-control-note">
                        {sharedIsApp
                          ? t('A viewer can ask to control this app. Nothing is granted until you allow it.')
                          : t('Control is only offered for a Kryvex app. A screen or window capture needs a native helper, which this build does not ship.')}
                      </p>
                    )
                  ) : control?.state === 'granted' ? (
                    <>
                      <p>{t('You have control. Click the stream, then use the mouse and keyboard.')}</p>
                      <button className="btn ghost tiny" onClick={() => session.revokeControl()}>
                        {t('Give control back')}
                      </button>
                    </>
                  ) : control?.state === 'requested' ? (
                    <p>{t('Waiting for the host to allow control…')}</p>
                  ) : (
                    <>
                      <p className="room-control-note">
                        {t('Viewing is not controlling. Ask the host before your input is sent.')}
                      </p>
                      <button className="btn ghost tiny" onClick={() => session.requestControl()}>
                        {t('Ask to control')}
                      </button>
                    </>
                  )}
                </div>
              ) : null}

              <div className="room-log" aria-live="polite">
                {state.messages.length === 0 ? (
                  <p className="room-log-empty">{t('No messages yet. Say hello.')}</p>
                ) : (
                  state.messages.map((message, position) => {
                    const day = dayLabel(message.at, locale);
                    const previous = state.messages[position - 1];
                    const previousDay = previous ? dayLabel(previous.at, locale) : 'first';
                    return (
                      <div key={message.id}>
                        {day !== previousDay ? (
                          <div className="room-day mono">
                            {day === '' ? t('TODAY') : day === 'yesterday' ? t('YESTERDAY') : day}
                          </div>
                        ) : null}
                        <div
                          className={`room-msg ${message.peerId === state.selfId ? 'is-self' : ''}`}
                        >
                          <div className="room-msg-head">
                            <span className="room-dot" style={{ background: message.color }} />
                            <strong>{message.name}</strong>
                            <span className="mono room-time">
                              {new Date(message.at).toLocaleTimeString(locale, {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p>{message.text}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEnd} />
              </div>

              <div className="room-compose">
                <textarea
                  value={draft}
                  rows={2}
                  maxLength={2000}
                  placeholder={t('Message the room…')}
                  aria-label={t('Message the room')}
                  onChange={event => setDraft(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      sendDraft();
                    }
                  }}
                />
                <button className="btn primary small" onClick={sendDraft} disabled={!draft.trim()}>
                  {t('Send')}
                </button>
              </div>
              <p className="room-note mono">{t('Ephemeral · no account · Enter sends')}</p>
            </aside>
          </div>
        </div>
      )}

      {pickerOpen ? (
        <div
          className="modal-layer"
          role="presentation"
          onClick={event => {
            if (event.target === event.currentTarget) setPickerOpen(false);
          }}
        >
          <div className="modal room-picker" role="dialog" aria-modal="true" aria-label={t('Share something')}>
            <header className="modal-head">
              <div>
                <p className="eyebrow mono">{t('CAPTURE')}</p>
                <h2>{t('Share something')}</h2>
              </div>
              <button className="icon-btn" aria-label={t('Close')} onClick={() => setPickerOpen(false)}>
                <Icon name="close" size={16} />
              </button>
            </header>

            <div className="modal-body">
              {sources === null ? (
                <p className="shield-note">{t('Looking for screens and windows…')}</p>
              ) : sources.length === 0 ? (
                <p className="shield-note">{t('Nothing can be shared right now.')}</p>
              ) : (
                <div className="room-source-groups">
                  {(['app', 'screen', 'window'] as const).map(kind => {
                    const items = sources.filter(source => source.kind === kind);
                    if (items.length === 0) return null;
                    return (
                      <section key={kind} className="room-source-group">
                        <span className="mono room-source-label">
                          {kind === 'app'
                            ? t('KRYVEX APPS')
                            : kind === 'screen'
                              ? t('SCREENS')
                              : t('WINDOWS')}
                        </span>
                        <div className="room-source-grid">
                          {items.map(source => (
                            <button
                              key={source.id}
                              className={`room-source ${selected === source.id ? 'is-active' : ''}`}
                              aria-pressed={selected === source.id}
                              onClick={() => setSelected(source.id)}
                              onDoubleClick={() => {
                                setSelected(source.id);
                                void beginShare();
                              }}
                            >
                              {source.thumbnail ? (
                                <img src={source.thumbnail} alt="" />
                              ) : (
                                <span className="room-source-mark">
                                  <Icon name="monitor" size={20} />
                                </span>
                              )}
                              <span className="room-source-name">{source.name}</span>
                              {source.detail ? (
                                <span className="mono room-source-detail">
                                  {source.detail.replace(/^https?:\/\//, '').slice(0, 40)}
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
            <footer className="modal-foot room-picker-foot">
              <label className="room-audio">
                <input
                  type="checkbox"
                  checked={withAudio}
                  onChange={event => setWithAudio(event.target.checked)}
                />
                {t('Share system audio')}
              </label>
              <div className="modal-actions">
                <button className="btn ghost" onClick={() => setPickerOpen(false)}>
                  {t('Cancel')}
                </button>
                <button className="btn primary" onClick={() => void beginShare()} disabled={!selected || starting}>
                  {starting ? t('Starting…') : t('Start sharing')}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}

      {state.status === 'error' ? (
        <p className="shield-note is-error room-error">
          {t('The default room relays are unreachable. Check your connection or the tracker list in Settings.')}
          {state.roomId ? (
            <button className="link" onClick={() => session.reconnect()}>
              {t('Reconnect')}
            </button>
          ) : null}
        </p>
      ) : null}

      <p className="rooms-foot mono">
        {t('Trackers')}: {(settings.trackers.length > 0 ? settings.trackers : DEFAULT_TRACKERS).length} ·{' '}
        {t('Encrypted signaling · no Kryvex server in the media path')}
      </p>
    </section>
  );
}
