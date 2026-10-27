import { useCallback, useEffect, useState } from 'react';
import type { PartyPeer } from '../lib/party';
import { useI18n } from '../lib/i18n';
import { vlanEngineLabel } from '../lib/vlan-rules';
import type { VlanAdapterView, VlanEngine } from '../types';
import { Icon } from './ui';

/**
 * The Virtual LAN strip inside a room.
 *
 * Kryvex runs no tunnel: the adapter, its routes and its admission belong to
 * the ZeroTier, EasyTier, Tailscale, WireGuard, Hamachi or OpenVPN install the
 * user already has. This panel reads the address that engine gave this machine
 * (in the main process, from the adapter itself), lets the member publish it to
 * the room by hand, and lists what the other members published. Nothing here
 * connects anywhere; a member copies an address into a game or a service.
 */

interface VirtualLanPanelProps {
  isElectron: boolean;
  peers: PartyPeer[];
  /** Addresses members published, by peer id (this client included). */
  shared: Record<string, { ip: string; engine: VlanEngine }>;
  /** The address this client published, if any. */
  mine: { ip: string; engine: VlanEngine } | null;
  onShare: (ip: string, engine: VlanEngine) => boolean;
  onStop: () => boolean;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
}

export function VirtualLanPanel({
  isElectron,
  peers,
  shared,
  mine,
  onShare,
  onStop,
  onToast,
}: VirtualLanPanelProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [adapters, setAdapters] = useState<VlanAdapterView[]>([]);
  const [selected, setSelected] = useState('');
  const [read, setRead] = useState(false);

  const refresh = useCallback(async () => {
    if (!isElectron || !window.kryvex?.vlanStatus) {
      setAdapters([]);
      setRead(true);
      return;
    }
    try {
      const status = await window.kryvex.vlanStatus();
      setAdapters(Array.isArray(status?.adapters) ? status.adapters : []);
    } catch {
      setAdapters([]);
    }
    setRead(true);
  }, [isElectron]);

  // Read once so the strip can report a state before it is ever opened, and
  // again on every open, because the engine behind it may have started since.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const chosen = adapters.find(adapter => adapter.address === selected) ?? adapters[0] ?? null;
  // This device's own address lives in `mine` rather than looping back through
  // the room, so the list is the peers that published plus this machine.
  const rows = peers
    .map(peer => ({
      peer,
      published: shared[peer.id] ?? (peer.self ? mine : null),
    }))
    .filter((row): row is { peer: PartyPeer; published: { ip: string; engine: VlanEngine } } =>
      Boolean(row.published),
    )
    .sort((left, right) => Number(right.peer.self) - Number(left.peer.self));

  async function copy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      onToast(t('Copied to the clipboard.'), 'success');
    } catch {
      onToast(t('The clipboard refused the address.'), 'warning');
    }
  }

  const state = mine
    ? t('Sharing {ip}', { ip: mine.ip })
    : rows.length > 1
      ? t('{count} devices', { count: rows.length })
      : t('Off');

  return (
    <section className={`vlan-strip ${mine ? 'is-sharing' : ''}`} data-shot="vlan-strip">
      <div className="vlan-strip-main">
        <span className="vlan-strip-icon" aria-hidden="true">
          <Icon name="globe" size={14} />
        </span>
        <strong>{t('Virtual LAN')}</strong>
        <span className="vlan-strip-state mono" data-vlan-state={mine ? 'sharing' : 'idle'}>
          {state}
        </span>
      </div>
      <button
        className="btn ghost small"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        {open ? t('Hide') : t('Expand')}
      </button>

      {open ? (
        <div className="vlan-panel" data-shot="vlan-panel">
          {!isElectron ? (
            <p className="vlan-note">
              {t(
                'Virtual LAN needs the desktop app. The desktop reads the tunnel an engine on your machine has already created.',
              )}
            </p>
          ) : !read ? (
            <p className="vlan-note mono">{t('Looking…')}</p>
          ) : adapters.length === 0 ? (
            <p className="vlan-note">
              {t(
                'No tunnel adapter is running. Start your own ZeroTier, EasyTier, Tailscale, WireGuard, Hamachi or OpenVPN network, then reopen this panel.',
              )}
            </p>
          ) : (
            <>
              <p className="vlan-caption mono">{t('MY VIRTUAL IP')}</p>
              <div className="vlan-addresses" role="radiogroup" aria-label={t('Detected network')}>
                {adapters.map(adapter => (
                  <label
                    className={`vlan-address ${chosen?.address === adapter.address ? 'is-active' : ''}`}
                    key={`${adapter.name}-${adapter.address}`}
                    data-vlan-engine={adapter.engine}
                  >
                    <input
                      type="radio"
                      name="vlan-adapter"
                      checked={chosen?.address === adapter.address}
                      onChange={() => setSelected(adapter.address)}
                    />
                    <span className="mono vlan-ip">{adapter.address}</span>
                    <span className="vlan-adapter-name">
                      {vlanEngineLabel(adapter.engine)} · {adapter.name}
                    </span>
                  </label>
                ))}
              </div>
              <div className="vlan-actions">
                <button className="btn ghost small" onClick={() => void copy(chosen!.address)}>
                  <Icon name="check" size={13} />
                  {t('Copy {value}', { value: chosen!.address })}
                </button>
                {mine ? (
                  <button
                    className="btn secondary small"
                    data-shot="vlan-stop"
                    onClick={() => {
                      if (onStop()) onToast(t('The address is no longer shared.'), 'info');
                    }}
                  >
                    {t('Stop sharing my address')}
                  </button>
                ) : (
                  <button
                    className="btn primary small"
                    data-shot="vlan-share"
                    onClick={() => {
                      const address = chosen!.address;
                      if (onShare(address, chosen!.engine)) {
                        onToast(t('The address was shared with the room.'), 'success');
                        return;
                      }
                      onToast(t('The address could not be shared. Rejoin the room and try again.'), 'warning');
                    }}
                  >
                    {t('Share this address with the room')}
                  </button>
                )}
              </div>
            </>
          )}

          <p className="vlan-caption mono">{t('DEVICES ON THIS NETWORK')}</p>
          {rows.length === 0 ? (
            <p className="vlan-note">
              {t('Nothing is shared yet. Members appear here when they publish an address.')}
            </p>
          ) : (
            <ul className="vlan-list">
              {rows.map(({ peer, published }) => (
                <li className="vlan-row" key={peer.id} data-vlan-row={peer.id}>
                  <span className="vlan-dot" style={{ background: peer.color }} aria-hidden="true" />
                  <span className="vlan-name">
                    {peer.name}
                    {peer.self ? <em className="vlan-self"> · {t('This device')}</em> : null}
                  </span>
                  <span className="vlan-engine">{vlanEngineLabel(published.engine)}</span>
                  <span className="mono vlan-ip">{published.ip}</span>
                  <button
                    className="icon-btn"
                    aria-label={t('Copy {value}', { value: published.ip })}
                    onClick={() => void copy(published.ip)}
                  >
                    <Icon name="check" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="vlan-note">
            {t(
              'Use a member’s virtual IP in a compatible game or service’s direct-connect field. The host must have that game or service running. Kryvex shows the address; it does not create the network, route it or admit anyone.',
            )}
          </p>
        </div>
      ) : null}
    </section>
  );
}
