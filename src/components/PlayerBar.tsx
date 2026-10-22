import { useEffect } from 'react';
import { useT } from '../lib/i18n';
import { formatClock } from '../lib/clock';
import { usePlayer } from './PlayerProvider';
import { ElementMark } from './ElementMark';
import { Icon } from './ui';

/**
 * The transport bar that docks above the status bar (above the phone
 * navigation on a narrow window) whenever the player holds a track. It talks to
 * the same engine as the player page, so the two can never disagree.
 */
export function PlayerBar({ onExpand }: { onExpand: () => void }) {
  const t = useT();
  const player = usePlayer();
  const current = player.current;

  useEffect(() => {
    if (current) document.body.dataset.playerBar = '1';
    else delete document.body.dataset.playerBar;
    return () => {
      delete document.body.dataset.playerBar;
    };
  }, [current]);

  if (!current) return null;

  const progress = player.duration > 0 ? (player.time / player.duration) * 100 : 0;

  return (
    <section className="player-bar" aria-label={t('Media player')}>
      <div className="player-bar-track">
        <ElementMark tool="player" size={34} compact />
        <div className="player-bar-copy">
          <strong title={current.title}>{current.title}</strong>
          <span className="mono player-bar-meta">
            {player.error
              ? t('That track could not be played.')
              : `${current.origin === 'file' ? t('LOCAL') : current.subtitle || t('STREAM')} · ${
                  player.index + 1
                }/${player.tracks.length}`}
          </span>
        </div>
      </div>

      <div className="player-bar-transport">
        <button
          className="player-bar-btn"
          onClick={player.previous}
          aria-label={t('Previous track')}
          title={t('Previous')}
        >
          <Icon name="prev" size={16} />
        </button>
        <button
          className="player-bar-btn is-primary"
          onClick={player.toggle}
          aria-label={player.playing ? t('Pause') : t('Play')}
          title={player.playing ? t('Pause') : t('Play')}
        >
          <Icon name={player.playing ? 'pause' : 'play'} size={17} />
        </button>
        <button
          className="player-bar-btn"
          onClick={player.next}
          aria-label={t('Next track')}
          title={t('Next')}
        >
          <Icon name="next" size={16} />
        </button>
      </div>

      <div className="player-bar-seek">
        <span className="mono">{formatClock(player.time)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.round(player.duration))}
          step={1}
          value={Math.min(Math.round(player.time), Math.round(player.duration) || 0)}
          onChange={event => player.seek(Number(event.target.value))}
          aria-label={t('Seek')}
          style={{ '--player-progress': `${progress}%` } as React.CSSProperties}
        />
        <span className="mono">{formatClock(player.duration)}</span>
      </div>

      <div className="player-bar-tools">
        <button
          className={`player-bar-btn ${player.shuffle ? 'is-on' : ''}`}
          onClick={player.toggleShuffle}
          aria-pressed={player.shuffle}
          aria-label={t('Shuffle')}
          title={t('Shuffle')}
        >
          <Icon name="shuffle" size={15} />
        </button>
        <button
          className={`player-bar-btn ${player.repeat !== 'off' ? 'is-on' : ''}`}
          onClick={player.cycleRepeat}
          aria-label={t('Repeat')}
          title={`${t('Repeat')}: ${t(player.repeat === 'off' ? 'Off' : player.repeat === 'all' ? 'All' : 'One')}`}
        >
          <Icon name={player.repeat === 'one' ? 'repeat-one' : 'repeat'} size={15} />
        </button>
        <button
          className="player-bar-btn"
          onClick={player.toggleMute}
          aria-label={player.muted ? t('Unmute') : t('Mute')}
          title={player.muted ? t('Unmute') : t('Mute')}
        >
          <Icon name={player.muted || player.volume === 0 ? 'mute' : 'volume'} size={15} />
        </button>
        <input
          className="player-bar-volume"
          type="range"
          min={0}
          max={100}
          value={Math.round((player.muted ? 0 : player.volume) * 100)}
          onChange={event => player.setVolume(Number(event.target.value) / 100)}
          aria-label={t('Volume')}
        />
        <button
          className="player-bar-btn"
          onClick={onExpand}
          aria-label={t('Open the player')}
          title={t('Open the player')}
        >
          <Icon name="external" size={15} />
        </button>
        <button
          className="player-bar-btn is-quiet"
          onClick={player.clear}
          aria-label={t('Close the player')}
          title={t('Close the player')}
        >
          <Icon name="close" size={15} />
        </button>
      </div>
    </section>
  );
}
