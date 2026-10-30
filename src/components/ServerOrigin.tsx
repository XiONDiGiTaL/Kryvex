import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ServerOriginReply } from '../../electron/types';
import { useI18n } from '../lib/i18n';
import {
  ageLabel,
  clockAt,
  coordinateLabel,
  countryLabel,
  flagSrc,
  networkLabel,
  nodeLabel,
  originProblem,
  publicHost,
} from '../lib/origin';
import { Icon } from './ui';

type Phase = 'idle' | 'loading' | 'ready' | 'failed';

const CARD_WIDTH = 288;
const HOLD_MS = 160;

/**
 * The country the page in front is served from.
 *
 * A small flag sits where the address bar's globe used to be, and the card behind
 * it names the network: the address DNS returned, who owns it, where the machine
 * is and what its clock says. The look up happens in the main process, which is
 * also the only side that may resolve a host, so this component only decides
 * when to ask and how the answer reads.
 *
 * It stays quiet on pages with no country to name — the blank tab, `about:` and
 * anything served from this machine — rather than showing a placeholder for a
 * question nobody asked.
 */
export function ServerOrigin({ url }: { url: string }) {
  const { t, locale } = useI18n();
  const host = useMemo(() => publicHost(url), [url]);
  const bridge = typeof window === 'undefined' ? undefined : window.kryvex;
  const [reply, setReply] = useState<ServerOriginReply | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const [openedAt, setOpenedAt] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const bypass = useRef(false);
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const holdTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!bridge || !host) {
      setReply(null);
      setPhase('idle');
      return;
    }
    let cancelled = false;
    const refresh = bypass.current;
    bypass.current = false;
    setPhase('loading');
    void bridge
      .serverOrigin(host, refresh)
      .then(next => {
        if (cancelled) return;
        setReply(next);
        setPhase(next?.ok ? 'ready' : 'failed');
      })
      .catch(() => {
        if (cancelled) return;
        setReply(null);
        setPhase('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, host, attempt]);

  const place = () => {
    const rect = chipRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(CARD_WIDTH, window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.left - 4), window.innerWidth - width - 8);
    setAnchor({ top: Math.round(rect.bottom + 8), left: Math.round(left) });
  };

  useEffect(() => {
    if (!open) return;
    place();
    setOpenedAt(Date.now());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (chipRef.current?.contains(target) || cardRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onMove = () => place();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
    // `place` reads the chip's live position, so the effect re-runs with `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setCopied(false);
  }, [open, host]);

  const hold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setOpen(true);
  };

  const release = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => setOpen(false), HOLD_MS);
  };

  const origin = reply?.ok ? reply.origin : undefined;
  const local = reply && !reply.ok && (reply.error === 'local' || reply.error === 'invalid');
  if (!bridge || !host || local) return null;

  const code = origin?.countryCode ?? '';
  const flag = flagSrc(code);
  const country = origin ? countryLabel(code, locale) || origin.country : '';
  const label = country
    ? `${country}${code ? ` (${code})` : ''} · ${origin?.host ?? host}`
    : t('Server origin unavailable');

  const copyAddress = () => {
    if (!origin?.address) return;
    void navigator.clipboard
      ?.writeText(origin.address)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  const card = (
    <div
      ref={cardRef}
      className="origin-card"
      role="dialog"
      aria-label={t('Server origin')}
      style={{ top: anchor?.top ?? 0, left: anchor?.left ?? 0, width: CARD_WIDTH }}
      onMouseEnter={hold}
      onMouseLeave={release}
    >
      <header className="origin-head">
        <span className="origin-frame">
          {flag ? <img src={flag} alt="" draggable={false} /> : <Icon name="globe" size={16} />}
        </span>
        <div className="origin-title">
          <strong>{country || t('Origin unknown')}</strong>
          <span className="mono">{[code, origin?.host ?? host].filter(Boolean).join(' · ')}</span>
        </div>
        <button
          type="button"
          className="origin-refresh"
          onClick={() => {
            bypass.current = true;
            setAttempt(value => value + 1);
          }}
          disabled={phase === 'loading'}
          aria-label={t('Look up again')}
          title={t('Look up again')}
        >
          <Icon name="reload" size={12} />
        </button>
      </header>

      {origin ? (
        <>
          <dl className="origin-grid">
            <div>
              <dt>{t('Server IP')}</dt>
              <dd className="mono">{origin.address}</dd>
            </div>
            <div>
              <dt>{t('Network')}</dt>
              <dd>{networkLabel(origin) || t('Unknown')}</dd>
            </div>
            <div>
              <dt>{t('Node')}</dt>
              <dd>{nodeLabel(origin) || country || t('Unknown')}</dd>
            </div>
            <div>
              <dt>{t('Their time')}</dt>
              <dd className="mono">{clockAt(origin.timezone, locale, openedAt || Date.now()) || t('Unknown')}</dd>
            </div>
            <div className="origin-wide">
              <dt>{t('Coordinates')}</dt>
              <dd className="mono">{coordinateLabel(origin.latitude, origin.longitude) || t('Unknown')}</dd>
            </div>
          </dl>
          <footer className="origin-foot">
            <span>
              {/* The provider's hostname is a proper noun, not copy to translate. */}
              ipwho.is · {ageLabel(origin.lookedUpAt, openedAt || Date.now())}
            </span>
            <button type="button" className="origin-copy" onClick={copyAddress}>
              {copied ? t('Copied') : t('Copy IP')}
            </button>
          </footer>
        </>
      ) : (
        <p className="origin-note">
          {phase === 'loading'
            ? t('Resolving this site’s network…')
            : t(originProblem(reply?.error))}
        </p>
      )}
    </div>
  );

  return (
    <div className="origin" onMouseEnter={hold} onMouseLeave={release}>
      <button
        ref={chipRef}
        type="button"
        className={`origin-chip ${phase === 'loading' ? 'is-loading' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen(value => !value)}
        onFocus={hold}
        onBlur={release}
      >
        {flag ? (
          <img className="origin-flag" src={flag} alt="" width={16} height={12} draggable={false} />
        ) : (
          <Icon name="globe" size={11} />
        )}
        <span className="origin-code mono">{code || (phase === 'loading' ? '···' : '—')}</span>
      </button>
      {open && anchor ? createPortal(card, document.body) : null}
    </div>
  );
}
