import type { EmulatorSettings, PlayerSettings, SecretToolId } from '../types';
import { useT } from '../lib/i18n';
import { SECRET_TOOL_LABELS } from '../lib/secret-tools';
import { Icon } from './ui';
import { OptionsPopover } from './OptionsPopover';

/**
 * The same options button a service card carries, for Kryvex's own tools.
 *
 * The panel holds the switches these tools actually have. Lexium and Disk pulse
 * have no on/off options of their own — their settings live in their window —
 * so their panel opens the tool instead of inventing toggles for it.
 */
export function ToolQuickMenu({
  tool,
  emulator,
  player,
  onUpdateEmulator,
  onUpdatePlayer,
  onOpen,
}: {
  tool: SecretToolId;
  emulator: EmulatorSettings;
  player: PlayerSettings;
  onUpdateEmulator: (patch: Partial<EmulatorSettings>) => void;
  onUpdatePlayer: (patch: Partial<PlayerSettings>) => void;
  onOpen: (tool: SecretToolId) => void;
}) {
  const t = useT();
  const name = t(SECRET_TOOL_LABELS[tool]);

  return (
    <OptionsPopover name={name} triggerTitle={t('Settings for this tool')}>
      {tool === 'player' ? (
        <>
          <div className="service-quick-row">
            <div>
              <strong>{t('Shuffle')}</strong>
              <span>{t('Plays the queue out of order instead of top to bottom.')}</span>
            </div>
            <button
              className={`switch ${player.shuffle ? 'is-on' : ''}`}
              role="switch"
              aria-checked={player.shuffle}
              aria-label={t('Shuffle')}
              onClick={() => onUpdatePlayer({ shuffle: !player.shuffle })}
            >
              <span />
            </button>
          </div>
          <div className="service-quick-row">
            <div>
              <strong>{t('Spotify ad guard')}</strong>
              <span>{t('Mute the module while Spotify labels an ad.')}</span>
            </div>
            <button
              className={`switch ${player.spotifyAdGuard ? 'is-on' : ''}`}
              role="switch"
              aria-checked={player.spotifyAdGuard}
              aria-label={t('Spotify ad guard')}
              onClick={() => onUpdatePlayer({ spotifyAdGuard: !player.spotifyAdGuard })}
            >
              <span />
            </button>
          </div>
        </>
      ) : null}

      {tool === 'emulator' ? (
        <>
          <div className="service-quick-row">
            <div>
              <strong>{t('Gamepad')}</strong>
              <span>{t('Uses a connected controller for the game that is loaded.')}</span>
            </div>
            <button
              className={`switch ${emulator.gamepad ? 'is-on' : ''}`}
              role="switch"
              aria-checked={emulator.gamepad}
              aria-label={t('Gamepad')}
              onClick={() => onUpdateEmulator({ gamepad: !emulator.gamepad })}
            >
              <span />
            </button>
          </div>
          <div className="service-quick-row">
            <div>
              <strong>{t('CRT scanlines')}</strong>
              <span>{t('Draws the scanline treatment over the picture.')}</span>
            </div>
            <button
              className={`switch ${emulator.crt ? 'is-on' : ''}`}
              role="switch"
              aria-checked={emulator.crt}
              aria-label={t('CRT scanlines')}
              onClick={() => onUpdateEmulator({ crt: !emulator.crt })}
            >
              <span />
            </button>
          </div>
        </>
      ) : null}

      {tool === 'lexium' || tool === 'disk' ? (
        <div className="service-quick-row">
          <div>
            <strong>{t('{name} settings', { name })}</strong>
            <span>{t('Settings for this tool live in its own window.')}</span>
          </div>
          <button className="btn secondary small" onClick={() => onOpen(tool)}>
            <Icon name="forward" size={12} />
            {t('Open {name}', { name })}
          </button>
        </div>
      ) : null}
    </OptionsPopover>
  );
}
