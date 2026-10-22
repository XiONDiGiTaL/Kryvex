import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useT } from '../lib/i18n';
import { formatClock } from '../lib/clock';
import { MEDIA_ACCEPT } from '../lib/player';
import { formatBytes } from '../lib/lexium';
import { usePlayer } from '../components/PlayerProvider';
import { ElementMark } from '../components/ElementMark';
import { EmptyState, Icon } from '../components/ui';

export function Player({
  onBack,
  onOpenLink,
  onToast,
}: {
  onBack: () => void;
  /** Platform pages open in the browser module; they are not media files. */
  onOpenLink: (url: string) => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
}) {
  const t = useT();
  const player = usePlayer();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<{ name: string; url: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Borrow the engine while this page is open; it returns to its off-screen
  // host on unmount so playback never stops for a route change.
  const attach = player.attach;
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    attach(node);
    return () => attach(null);
  }, [attach]);

  const current = player.current;

  function acceptFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    const result = player.addFiles(files);
    if (result.errors.length > 0) {
      onToast(t(result.errors[0]!), 'danger');
      return;
    }
    if (result.added > 0) {
      onToast(t('{count} track(s) added to the queue.', { count: result.added }), 'success');
    }
  }

  function submitLink(event: React.FormEvent) {
    event.preventDefault();
    setPlatform(null);
    setLinkError(null);
    const result = player.addLink(link);
    if (result.ok) {
      setLink('');
      onToast(t('Link added to the queue.'), 'success');
      return;
    }
    if (result.reason === 'platform' && result.platform) {
      setPlatform({ name: result.platform.name, url: result.platform.url });
      return;
    }
    setLinkError(
      result.reason === 'invalid'
        ? t('That does not look like a link.')
        : t('Point the player at an audio or video file, for example .mp3 or .mp4.'),
    );
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    acceptFiles(event.dataTransfer?.files ?? null);
  }

  return (
    <section className="view player-view">
      <header className="view-head">
        <div className="tool-head">
          <ElementMark tool="player" size={62} />
          <div>
            <p className="eyebrow mono">{t('SECRET SERVICE / IN-HOUSE · x531')}</p>
            <h1>{t('Media player')}</h1>
            <p className="lede">
              {t(
                'Local files and direct links, one queue. The transport dock stays with you while you work in other views.',
              )}
            </p>
          </div>
        </div>
        <button className="btn secondary" onClick={onBack}>
          <Icon name="back" size={15} />
          {t('All services')}
        </button>
      </header>

      <div
        className={`player-stage ${dragOver ? 'is-drag' : ''}`}
        onDragOver={event => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div
          className={`player-screen ${current?.kind === 'video' ? 'is-video' : 'is-audio'}`}
          ref={stageRef}
        />

        {current ? (
          <div className="player-now">
            <div className="player-now-copy">
              <span className="mono player-now-kicker">
                {t('NOW PLAYING')} · {player.index + 1}/{player.tracks.length}
              </span>
              <strong title={current.title}>{current.title}</strong>
              <span className="mono player-now-meta">
                {current.origin === 'file'
                  ? `${t('LOCAL FILE')}${current.size ? ` · ${formatBytes(current.size)}` : ''}`
                  : current.subtitle || t('DIRECT LINK')}
                {' · '}
                {current.kind === 'video' ? t('VIDEO') : t('AUDIO')}
              </span>
            </div>

            <div className="player-controls">
              <button
                className={`player-btn ${player.shuffle ? 'is-on' : ''}`}
                onClick={player.toggleShuffle}
                aria-pressed={player.shuffle}
                title={t('Shuffle')}
                aria-label={t('Shuffle')}
              >
                <Icon name="shuffle" size={16} />
              </button>
              <button
                className="player-btn"
                onClick={player.previous}
                aria-label={t('Previous track')}
                title={t('Previous')}
              >
                <Icon name="prev" size={18} />
              </button>
              <button
                className="player-btn is-primary"
                onClick={player.toggle}
                aria-label={player.playing ? t('Pause') : t('Play')}
                title={player.playing ? t('Pause') : t('Play')}
              >
                <Icon name={player.playing ? 'pause' : 'play'} size={21} />
              </button>
              <button
                className="player-btn"
                onClick={player.next}
                aria-label={t('Next track')}
                title={t('Next')}
              >
                <Icon name="next" size={18} />
              </button>
              <button
                className={`player-btn ${player.repeat !== 'off' ? 'is-on' : ''}`}
                onClick={player.cycleRepeat}
                aria-label={t('Repeat')}
                title={`${t('Repeat')}: ${t(
                  player.repeat === 'off' ? 'Off' : player.repeat === 'all' ? 'All' : 'One',
                )}`}
              >
                <Icon name={player.repeat === 'one' ? 'repeat-one' : 'repeat'} size={16} />
              </button>
            </div>

            <div className="player-scrub">
              <span className="mono">{formatClock(player.time)}</span>
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.round(player.duration))}
                value={Math.min(Math.round(player.time), Math.round(player.duration) || 0)}
                onChange={event => player.seek(Number(event.target.value))}
                aria-label={t('Seek')}
              />
              <span className="mono">-{formatClock(Math.max(0, player.duration - player.time))}</span>
              <button
                className="player-btn is-quiet"
                onClick={player.toggleMute}
                aria-label={player.muted ? t('Unmute') : t('Mute')}
                title={player.muted ? t('Unmute') : t('Mute')}
              >
                <Icon name={player.muted || player.volume === 0 ? 'mute' : 'volume'} size={16} />
              </button>
              <input
                className="player-volume"
                type="range"
                min={0}
                max={100}
                value={Math.round((player.muted ? 0 : player.volume) * 100)}
                onChange={event => player.setVolume(Number(event.target.value) / 100)}
                aria-label={t('Volume')}
              />
            </div>

            {player.error ? (
              <p className="player-error">
                <Icon name="warning" size={14} />
                {t(
                  'This source refused to play. Direct links must point at the media file itself and allow cross-origin playback.',
                )}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="player-now is-empty">
            <span className="player-drop-hint">
              <Icon name="music" size={26} />
              <strong>{t('Drop audio or video here')}</strong>
              <span>{t('or open a file, or paste a direct link below.')}</span>
            </span>
          </div>
        )}

        {dragOver ? (
          <div className="player-drop-veil">
            <Icon name="upload" size={28} />
            <span className="mono">{t('DROP TO QUEUE')}</span>
          </div>
        ) : null}
      </div>

      <div className="player-add">
        <button className="btn primary" onClick={() => fileInput.current?.click()}>
          <Icon name="folder" size={15} />
          {t('Open files')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={MEDIA_ACCEPT}
          multiple
          hidden
          onChange={event => {
            acceptFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <form className="player-link" onSubmit={submitLink}>
          <Icon name="globe" size={15} />
          <input
            value={link}
            onChange={event => {
              setLink(event.target.value);
              setLinkError(null);
              setPlatform(null);
            }}
            placeholder={t('https://host/track.mp3')}
            aria-label={t('Direct media link')}
            spellCheck={false}
          />
          <button className="btn secondary" type="submit" disabled={!link.trim()}>
            {t('Queue link')}
          </button>
        </form>
      </div>

      {linkError ? <p className="player-inline-error">{linkError}</p> : null}
      {platform ? (
        <div className="player-platform">
          <Icon name="globe" size={16} />
          <p>
            {t(
              '{name} is a web page, not a media file, so it cannot feed this player. Open it in its own tab — the audio keeps playing there.',
              { name: platform.name },
            )}
          </p>
          <button className="btn secondary" onClick={() => onOpenLink(platform.url)}>
            <Icon name="external" size={14} />
            {t('Open {name}', { name: platform.name })}
          </button>
        </div>
      ) : null}

      <div className="player-queue-head">
        <span className="mono">{t('QUEUE')}</span>
        <span className="mono">
          {player.tracks.length === 1
            ? t('1 TRACK')
            : t('{count} TRACKS', { count: player.tracks.length })}
        </span>
        {player.tracks.length > 0 ? (
          <button className="btn ghost tiny" onClick={player.clear}>
            <Icon name="trash" size={13} />
            {t('Clear')}
          </button>
        ) : null}
      </div>

      {player.tracks.length === 0 ? (
        <EmptyState
          title={t('The queue is empty')}
          body={t(
            'Import audio or video you already own, or paste a direct stream URL. YouTube, Spotify and Twitch pages open in their own modules instead.',
          )}
          action={
            <button className="btn primary" onClick={() => fileInput.current?.click()}>
              {t('Choose files')}
            </button>
          }
        />
      ) : (
        <ul className="player-list">
          {player.tracks.map((track, position) => (
            <li
              key={track.id}
              className={`player-row ${position === player.index ? 'is-current' : ''}`}
            >
              <button
                className="player-row-play"
                onClick={() => player.playAt(position)}
                aria-label={t('Play {name}', { name: track.title })}
                title={t('Play')}
              >
                {position === player.index && player.playing ? (
                  <span className="player-bars" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                ) : (
                  <Icon name="play" size={14} />
                )}
              </button>
              <span className="player-row-index mono">
                {String(position + 1).padStart(2, '0')}
              </span>
              <span className="player-row-copy">
                <strong title={track.title}>{track.title}</strong>
                <span className="mono">
                  {track.kind === 'video' ? t('VIDEO') : t('AUDIO')} ·{' '}
                  {track.origin === 'file' ? t('LOCAL') : track.subtitle || t('LINK')}
                  {track.size ? ` · ${formatBytes(track.size)}` : ''}
                </span>
              </span>
              <button
                className="icon-btn danger"
                onClick={() => player.remove(track.id)}
                aria-label={t('Remove {name}', { name: track.title })}
                title={t('Remove')}
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="footnote mono">
        {t('LOCAL DECODE · QUEUE IN MEMORY · NOTHING IS UPLOADED')}
      </p>
    </section>
  );
}
