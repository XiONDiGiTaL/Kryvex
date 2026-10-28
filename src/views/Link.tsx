import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LinkSettings, LinkStatusView } from '../types';
import { ElementMark } from '../components/ElementMark';
import { Icon } from '../components/ui';
import { useT } from '../lib/i18n';

/**
 * Kryvex Link: the phone companion, controlled from the desktop.
 *
 * The page a phone opens is served by the main process; this view is where the
 * user starts the link, reads the address and the six-digit code to the phone,
 * sees which phones are paired, and handles the files that cross. Nothing here
 * can mint a token: the shell asks the main process, and the main process only
 * mints one against a live code.
 *
 * The web build has no main process, so the view says so instead of showing a
 * switch that cannot do anything.
 */

type LinkStatus = LinkStatusView;

function bytes(value: number): string {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? size : Math.round(size * 10) / 10} ${units[unit]}`;
}

function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export function Link({
  settings,
  onToggle,
  onBack,
  onToast,
  embedded = false,
}: {
  settings: LinkSettings;
  onToggle: (enabled: boolean) => void;
  onBack: () => void;
  onToast: (message: string, tone: 'info' | 'success' | 'warning' | 'danger') => void;
  /** Rendered inside a Workspace window: the window owns the title bar. */
  embedded?: boolean;
}) {
  const t = useT();
  const bridge = typeof window === 'undefined' ? undefined : window.kryvex;
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!bridge?.linkStatus) return;
    const next = await bridge.linkStatus();
    if (next) setStatus(next);
  }, [bridge]);

  // The address list and the code can change under the view, so it polls while
  // it is open rather than trusting one reading.
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // The switch in the state file is the intent; the socket follows it.
  useEffect(() => {
    if (!bridge?.linkConfigure) return;
    void bridge.linkConfigure({ enabled: settings.enabled }).then(next => {
      if (next) setStatus(next);
    });
  }, [bridge, settings.enabled]);

  const remaining = useMemo(() => {
    if (!status?.codeExpiresAt) return 0;
    return Math.max(0, Math.round((status.codeExpiresAt - now) / 1000));
  }, [now, status?.codeExpiresAt]);

  /**
   * `links` carries the adapter each address belongs to. An older main process
   * only sends `urls`, so those are shown without the adapter hint rather than
   * hidden.
   */
  const addresses = useMemo(() => {
    if (!status) return [];
    if (status.links?.length) return status.links;
    return (status.urls ?? []).map(url => ({ url, address: url, name: '', likely: true }));
  }, [status]);

  const act = useCallback(
    async (run: () => Promise<unknown>, message: string) => {
      setBusy(true);
      try {
        const answer = await run();
        if (answer && typeof answer === 'object' && 'code' in answer) {
          setStatus(answer as LinkStatus);
        } else {
          await refresh();
        }
        if (message) onToast(message, 'success');
      } finally {
        setBusy(false);
      }
    },
    [onToast, refresh],
  );

  if (!bridge?.linkStatus) {
    return (
      <section className={`view link-view ${embedded ? 'is-embedded' : ''}`}>
        <header className="view-head">
          <div>
            <p className="eyebrow mono">{t('x534 / LINK')}</p>
            <h1>Kryvex Link</h1>
          </div>
          <button className="btn ghost" onClick={onBack}>
            <Icon name="back" size={15} />
            {t('Services')}
          </button>
        </header>
        <div className="link-card">
          <p className="hint">
            {t(
              'The phone companion is served by the desktop app. Open Kryvex on this computer to pair a phone.',
            )}
          </p>
        </div>
      </section>
    );
  }

  const devices = status?.devices ?? [];
  const received = status?.received ?? [];
  const offered = status?.offered ?? [];

  return (
    <section className="view link-view">
      <header className="view-head">
        <div>
          <p className="eyebrow mono">{t('x534 / LINK')}</p>
          <h1>Kryvex Link</h1>
          <p className="lede">
            {t(
              'Pair a phone with this computer over your own network: clipboard both ways, files both ways, and a remote for the player. Nothing is uploaded to a service.',
            )}
          </p>
        </div>
        <div className="view-head-actions">
          <button className="btn ghost" onClick={onBack}>
            <Icon name="back" size={15} />
            {t('Services')}
          </button>
          <button
            className={`btn ${settings.enabled ? 'secondary' : 'primary'}`}
            disabled={busy}
            onClick={() => onToggle(!settings.enabled)}
          >
            <Icon name={settings.enabled ? 'power' : 'link'} size={15} />
            {settings.enabled ? t('Stop the link') : t('Start the link')}
          </button>
        </div>
      </header>

      {status?.error ? (
        <p className="link-error" role="alert">
          {status.error}
        </p>
      ) : null}

      <div className="link-grid">
        <article className="link-card is-code">
          <ElementMark tool="link" size={72} />
          <div className="link-card-body">
            <p className="mono link-kicker">{t('PAIRING CODE')}</p>
            <p className="link-code mono">{settings.enabled && status?.code ? status.code : '······'}</p>
            <p className="hint">
              {settings.enabled
                ? t('Type this on the phone when the page asks. It lasts {seconds} seconds.', {
                    seconds: remaining,
                  })
                : t('Start the link to get a code.')}
            </p>
            <div className="link-row">
              <button
                className="btn small"
                disabled={busy || !settings.enabled}
                onClick={() => void act(() => bridge.linkNewCode(), t('New code issued.'))}
              >
                <Icon name="reload" size={14} />
                {t('New code')}
              </button>
              <span className={`pill ${status?.running ? 'is-on' : ''}`}>
                {status?.running ? t('Listening on port {port}', { port: status.port }) : t('Off')}
              </span>
            </div>
          </div>
        </article>

        <article className="link-card">
          <p className="mono link-kicker">{t('OPEN THIS ON THE PHONE')}</p>
          {addresses.length ? (
            <ul className="link-urls">
              {addresses.map(link => (
                <li key={link.url} className={link.likely ? '' : 'is-virtual'}>
                  <div className="link-url-main">
                    <code className="mono">{link.url}</code>
                    {link.name ? (
                      <span className="link-url-meta">
                        <span className="mono link-adapter">{link.name}</span>
                        <span className={`link-tag ${link.likely ? 'is-primary' : ''}`}>
                          {link.likely
                            ? t('Likely your network')
                            : t('Virtual adapter: a phone usually cannot reach this one')}
                        </span>
                      </span>
                    ) : null}
                  </div>
                  <button
                    className="icon-btn"
                    title={t('Copy')}
                    aria-label={t('Copy {value}', { value: link.url })}
                    onClick={() => {
                      void navigator.clipboard
                        ?.writeText(link.url)
                        .then(() => onToast(t('Copied.'), 'info'));
                    }}
                  >
                    <Icon name="copy" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">{t('Start the link to see this machine’s addresses.')}</p>
          )}
          <ol className="link-steps">
            <li>{t('Open the address above in the phone’s browser.')}</li>
            <li>{t('Type the pairing code.')}</li>
            <li>{t('Add the page to the home screen for an icon.')}</li>
          </ol>
          <details className="link-help">
            <summary>{t('Can’t connect from the phone?')}</summary>
            <p className="hint">
              {t(
                'Both devices must be on the same Wi-Fi or Ethernet network, and Kryvex must be allowed through the firewall on private networks. VPN and virtual adapters cannot reach the phone, so use the address marked as your network.',
              )}
            </p>
          </details>
        </article>

        <article className="link-card">
          <div className="link-card-head">
            <p className="mono link-kicker">{t('PAIRED PHONES')}</p>
            <span className="mono muted-label">{devices.length}</span>
          </div>
          {devices.length === 0 ? (
            <p className="hint">{t('No phone is paired yet.')}</p>
          ) : (
            <ul className="link-list">
              {devices.map(device => (
                <li key={device.id}>
                  <span className="link-name">{device.label}</span>
                  <span className="mono link-meta">
                    {device.address} · {t('seen {ago} ago', { ago: ago(device.lastSeenAt, now) })}
                  </span>
                  <button
                    className="btn small ghost"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => bridge.linkRevoke(device.id),
                        t('{name} was unpaired.', { name: device.label }),
                      )
                    }
                  >
                    {t('Unpair')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="link-row">
            <button
              className="btn small ghost"
              disabled={busy || devices.length === 0}
              onClick={() => void act(() => bridge.linkRevokeAll(), t('Every phone was unpaired.'))}
            >
              {t('Unpair all')}
            </button>
            <button
              className="btn small"
              disabled={busy}
              onClick={() =>
                void act(
                  () => bridge.linkNotify(t('Kryvex Link is live'), t('The phone relay works.')),
                  t('Sent.'),
                )
              }
            >
              <Icon name="bell" size={14} />
              {t('Test the phone relay')}
            </button>
          </div>
        </article>

        <article className="link-card">
          <div className="link-card-head">
            <p className="mono link-kicker">{t('FILES FROM THE PHONE')}</p>
            <span className="mono muted-label">{received.length}</span>
          </div>
          <p className="hint">{t('Received files land in {folder}.', { folder: status?.folder ?? '' })}</p>
          {received.length === 0 ? (
            <p className="hint">{t('Nothing has arrived yet.')}</p>
          ) : (
            <ul className="link-list">
              {received.map(file => (
                <li key={file.id}>
                  <span className="link-name" title={file.name}>
                    {file.name}
                  </span>
                  <span className="mono link-meta">{bytes(file.size)}</span>
                  <span className="link-row">
                    <button
                      className="icon-btn"
                      title={t('Open')}
                      aria-label={t('Open {name}', { name: file.name })}
                      onClick={() => void bridge.linkOpen(file.id)}
                    >
                      <Icon name="forward" size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      title={t('Show in folder')}
                      aria-label={t('Show {name} in its folder', { name: file.name })}
                      onClick={() => void bridge.linkReveal(file.id)}
                    >
                      <Icon name="folder" size={14} />
                    </button>
                    <button
                      className="icon-btn danger"
                      title={t('Delete')}
                      aria-label={t('Delete {name}', { name: file.name })}
                      disabled={busy}
                      onClick={() =>
                        void act(() => bridge.linkRemove(file.id, false), t('{name} was removed.', { name: file.name }))
                      }
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            className="btn small ghost"
            disabled={busy || received.length === 0}
            onClick={() => void act(() => bridge.linkClear(false), t('The received list was cleared.'))}
          >
            {t('Clear the list')}
          </button>
        </article>

        <article className="link-card">
          <div className="link-card-head">
            <p className="mono link-kicker">{t('FILES FOR THE PHONE')}</p>
            <span className="mono muted-label">{offered.length}</span>
          </div>
          <p className="hint">
            {t('Offer a file here, then download it from the phone’s Files tab. It is served on this network only.')}
          </p>
          {offered.length === 0 ? (
            <p className="hint">{t('Nothing is offered yet.')}</p>
          ) : (
            <ul className="link-list">
              {offered.map(file => (
                <li key={file.id}>
                  <span className="link-name" title={file.name}>
                    {file.name}
                  </span>
                  <span className="mono link-meta">{bytes(file.size)}</span>
                  <button
                    className="icon-btn danger"
                    title={t('Delete')}
                    aria-label={t('Delete {name}', { name: file.name })}
                    disabled={busy}
                    onClick={() =>
                      void act(() => bridge.linkRemove(file.id, false), t('{name} was removed.', { name: file.name }))
                    }
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="btn small" disabled={busy} onClick={() => void act(() => bridge.linkOffer(), '')}>
            <Icon name="plus" size={14} />
            {t('Offer a file')}
          </button>
        </article>
      </div>

      <p className="link-foot hint">
        {t(
          'The page is only served on this machine’s private addresses and every request from outside them is refused. A phone gets access by entering the six-digit code once; you can unpair it here at any time.',
        )}
      </p>
    </section>
  );
}
