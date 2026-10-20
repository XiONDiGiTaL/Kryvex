import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PartySettings, PartySource } from '../types';
import { useI18n } from '../lib/i18n';
import { PartySession } from '../lib/party';
import {
  DEFAULT_TRACKERS,
  PEER_COLORS,
  formatInvite,
  initials,
  newRoomId,
  parseInvite,
  sanitizeDisplayName,
} from '../lib/party-rules';
import { Icon } from '../components/ui';

interface RoomsProps {
  settings: PartySettings;
  isElectron: boolean;
  initialRoom?: string | null;
  onUpdateParty: (patch: Partial<PartySettings>) => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
}

function VideoTile({
  stream,
  label,
  color,
  muted,
  badge,
}: {
  stream: MediaStream;
  label: string;
  color: string;
  muted: boolean;
  badge: string;
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

  return (
    <figure className="room-tile" style={{ '--tile-accent': color } as React.CSSProperties}>
      <video ref={ref} autoPlay playsInline muted={muted} />
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
}: RoomsProps) {
  const { t, locale } = useI18n();
  const sessionRef = useRef<PartySession | null>(null);
  if (!sessionRef.current) sessionRef.current = new PartySession();
  const session = sessionRef.current;
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);

  const [joinText, setJoinText] = useState('');
  const [draft, setDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sources, setSources] = useState<PartySource[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [withAudio, setWithAudio] = useState(false);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const chatEnd = useRef<HTMLDivElement | null>(null);
  const autoJoined = useRef(false);

  const displayName = settings.displayName;
  const color = settings.color || PEER_COLORS[0]!;

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

  useEffect(() => () => session.leave(), [session]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' });
  }, [state.messages.length, state.share?.peerId]);

  // The engine reports an error state without throwing; surface it once.
  useEffect(() => {
    if (state.status === 'error' && state.error) onToast(state.error, 'danger');
  }, [onToast, state.error, state.status]);

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
      await session.startShare(stream, source?.name ?? t('Screen'));
      setPickerOpen(false);
    } catch {
      onToast(t('The share could not start.'), 'danger');
    } finally {
      setStarting(false);
    }
  }

  function sendDraft() {
    if (!session.send(draft)) return;
    setDraft('');
  }

  const inRoom = state.status === 'joined' || state.status === 'joining';
  const peerCount = state.peers.length;
  const share = state.share;

  return (
    <section className="view rooms-view">
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
      </header>

      {!inRoom ? (
        <div className="rooms-lobby">
          <section className="settings-block panel room-card">
            <h2>{t('Start a room')}</h2>
            <p className="settings-copy">
              {t(
                'A room code is the invite. Anyone who has it can join; nothing is listed publicly.',
              )}
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

          <div className="room-body">
            <div className="room-stage">
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
                      muted={false}
                      badge={t('SHARING')}
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
                </div>
              )}

              <div className="room-stage-bar">
                {state.local ? (
                  <button
                    className="btn danger-outline small"
                    onClick={() => {
                      session.stopShare();
                      onToast(t('Share stopped.'), 'info');
                    }}
                  >
                    <Icon name="close" size={13} />
                    {t('Stop sharing')}
                  </button>
                ) : (
                  <button
                    className="btn primary small"
                    data-shot="share"
                    onClick={() => void openPicker()}
                  >
                    <Icon name="monitor" size={14} />
                    {t('Share something')}
                  </button>
                )}
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

              <div className="room-log" aria-live="polite">
                {state.messages.length === 0 ? (
                  <p className="room-log-empty">{t('No messages yet. Say hello.')}</p>
                ) : (
                  state.messages.map(message => (
                    <div
                      className={`room-msg ${message.peerId === state.selfId ? 'is-self' : ''}`}
                      key={message.id}
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
                  ))
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
                <button
                  className="btn primary small"
                  onClick={sendDraft}
                  disabled={!draft.trim()}
                >
                  {t('Send')}
                </button>
              </div>
              <p className="room-note mono">
                {t('Ephemeral · no account · Enter sends')}
              </p>
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
              <button
                className="icon-btn"
                aria-label={t('Close')}
                onClick={() => setPickerOpen(false)}
              >
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
                <button
                  className="btn primary"
                  onClick={() => void beginShare()}
                  disabled={!selected || starting}
                >
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
        </p>
      ) : null}

      <p className="rooms-foot mono">
        {t('Trackers')}: {(settings.trackers.length > 0 ? settings.trackers : DEFAULT_TRACKERS).length} ·{' '}
        {t('Encrypted signaling · no Kryvex server in the media path')}
      </p>
    </section>
  );
}
