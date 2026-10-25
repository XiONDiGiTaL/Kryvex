import { useCallback, useEffect, useRef, useState } from 'react';
import type { Service } from '../types';
import {
  cascadeFloat,
  clampFloatRect,
  defaultFloatRect,
  dragFloat,
  floatWindowStyle,
  resizeFloat,
  type FloatRect,
} from '../lib/floating';
import { CATEGORIES, partitionFor } from '../lib/services';
import { useT } from '../lib/i18n';
import { hostOf } from '../lib/url';
import { openExternalUrl } from '../lib/external';
import { isGoogleHost, isGoogleSignInBlock } from '../lib/signin';
import {
  isValidOneTimeCode,
  matchOneTimeCodeProfile,
  normalizeOneTimeCode,
  oneTimeCodeFocusScript,
  oneTimeCodeProfileById,
  oneTimeCodeProbeScript,
  oneTimeCodeSubmitScript,
  parseOneTimeCodePrompt,
  sameOneTimeCodePrompt,
  type OneTimeCodePrompt,
} from '../lib/one-time-code';
import { Icon, ServiceIcon, ThemeMark, type ThemeMarkKind } from '../components/ui';
import { ServiceQuickMenu } from '../components/ServiceQuickMenu';
import { Webview, type WebviewElement, type WebviewStatus } from '../components/Webview';

interface StageProps {
  services: Service[];
  openIds: string[];
  activeId: string | null;
  reloadTokens: Record<string, number>;
  /** Changes when engine preferences change, so guests are rebuilt. */
  engineRevision: number;
  isElectron: boolean;
  unread: Record<string, number>;
  notifications: boolean;
  mark?: ThemeMarkKind;
  onBack: () => void;
  onEdit: (service: Service) => void;
  onDelete: (service: Service) => void;
  onClearSession: (service: Service) => void;
  onTitle: (service: Service, title: string) => void;
  onUpdateService: (service: Service, patch: Partial<Service>) => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
  /** Bring a floated module back into the stage as the open view. */
  onActivate: (id: string) => void;
}

/**
 * Keeps every opened service mounted for the whole app session.
 *
 * A webview that is unmounted reloads from scratch next time it is shown: a
 * chat client reconnects its gateway, re-runs bootstrap and, in Discord's
 * case, can decide the stored token is stale. Keeping the guest alive keeps
 * the connection, the scroll position, an in-progress call and the session
 * itself intact while the user works somewhere else in Kryvex. Inactive frames
 * are hidden, never destroyed; only closing the app or clearing a session
 * ends them.
 */
export function ServiceStage({
  services,
  openIds,
  activeId,
  reloadTokens,
  engineRevision,
  isElectron,
  unread,
  notifications,
  mark = 'kx',
  onBack,
  onEdit,
  onDelete,
  onClearSession,
  onTitle,
  onUpdateService,
  onToast,
  onActivate,
}: StageProps) {
  const active = services.find(service => service.id === activeId) ?? null;
  const open = openIds
    .map(id => services.find(service => service.id === id))
    .filter((service): service is Service => Boolean(service));

  /**
   * A floated module keeps its place over the whole workspace while the user
   * works somewhere else. The geometry is session state, not a setting: a
   * window that reappears at a stale coordinate after a restart would be worse
   * than one that opens where the stage puts it.
   */
  const [floats, setFloats] = useState<Record<string, { rect: FloatRect; z: number }>>({});
  const zTop = useRef(40);

  const viewport = useCallback(
    () => ({ width: window.innerWidth, height: window.innerHeight }),
    [],
  );

  const raise = useCallback((id: string) => {
    setFloats(current => {
      const entry = current[id];
      if (!entry) return current;
      const top = Math.max(0, ...Object.values(current).map(item => item.z));
      if (entry.z >= top) return current;
      zTop.current += 1;
      return { ...current, [id]: { rect: entry.rect, z: zTop.current } };
    });
  }, []);

  const floatService = useCallback(
    (service: Service) => {
      setFloats(current => {
        if (current[service.id]) return current;
        const bounds = viewport();
        const index = Object.keys(current).length;
        const rect = cascadeFloat(defaultFloatRect(bounds), index, bounds);
        zTop.current += 1;
        return { ...current, [service.id]: { rect, z: zTop.current } };
      });
      // The stage behind a floated module should not keep the module docked.
      onBack();
    },
    [onBack, viewport],
  );

  const dockService = useCallback(
    (service: Service) => {
      setFloats(current => {
        if (!current[service.id]) return current;
        const next = { ...current };
        delete next[service.id];
        return next;
      });
      onActivate(service.id);
    },
    [onActivate],
  );

  const moveFloat = useCallback(
    (id: string, dx: number, dy: number) => {
      setFloats(current => {
        const entry = current[id];
        if (!entry) return current;
        return { ...current, [id]: { ...entry, rect: dragFloat(entry.rect, dx, dy, viewport()) } };
      });
    },
    [viewport],
  );

  const resizeFloatWindow = useCallback(
    (id: string, dx: number, dy: number) => {
      setFloats(current => {
        const entry = current[id];
        if (!entry) return current;
        return { ...current, [id]: { ...entry, rect: resizeFloat(entry.rect, dx, dy, viewport()) } };
      });
    },
    [viewport],
  );

  // A closed module cannot leave a window behind, and a resized app window must
  // not push a float out of reach.
  useEffect(() => {
    setFloats(current => {
      const next: typeof current = {};
      let changed = false;
      for (const [id, entry] of Object.entries(current)) {
        if (!openIds.includes(id)) {
          changed = true;
          continue;
        }
        const rect = clampFloatRect(entry.rect, viewport());
        if (
          rect.x !== entry.rect.x ||
          rect.y !== entry.rect.y ||
          rect.width !== entry.rect.width ||
          rect.height !== entry.rect.height
        ) {
          changed = true;
          next[id] = { ...entry, rect };
        } else {
          next[id] = entry;
        }
      }
      return changed ? next : current;
    });
  }, [openIds, viewport]);

  if (open.length === 0) return null;

  const floatingCount = Object.keys(floats).length;

  return (
    <section
      className={`service-stage ${active ? 'has-active' : 'is-idle'} ${
        floatingCount > 0 ? 'has-float' : ''
      }`}
      aria-hidden={!active && floatingCount === 0}
    >
      {open.map(service => {
        const float = service.id === activeId ? undefined : floats[service.id];
        return (
          <ServiceFrame
            key={`${service.id}-${reloadTokens[service.id] ?? 0}-${engineRevision}`}
            service={service}
            active={service.id === activeId}
            floating={float ? float.rect : null}
            floatZ={float ? float.z : 0}
            isElectron={isElectron}
            unread={unread[service.id] ?? 0}
            notifications={notifications}
            mark={mark}
            onBack={onBack}
            onEdit={onEdit}
            onDelete={onDelete}
            onClearSession={onClearSession}
            onTitle={title => onTitle(service, title)}
            onUpdateService={patch => onUpdateService(service, patch)}
            onToast={onToast}
            onFloat={() => floatService(service)}
            onDock={() => dockService(service)}
            onFloatFocus={() => raise(service.id)}
            onFloatDrag={(dx, dy) => moveFloat(service.id, dx, dy)}
            onFloatResize={(dx, dy) => resizeFloatWindow(service.id, dx, dy)}
          />
        );
      })}
    </section>
  );
}

function ServiceFrame({
  service,
  active,
  floating,
  floatZ,
  isElectron,
  unread,
  notifications,
  mark = 'kx',
  onBack,
  onEdit,
  onDelete,
  onClearSession,
  onTitle,
  onUpdateService,
  onToast,
  onFloat,
  onDock,
  onFloatFocus,
  onFloatDrag,
  onFloatResize,
}: {
  service: Service;
  active: boolean;
  /** A floated box, or null when the module fills the stage. */
  floating: FloatRect | null;
  floatZ: number;
  isElectron: boolean;
  unread: number;
  notifications: boolean;
  mark?: ThemeMarkKind;
  onBack: () => void;
  onEdit: (service: Service) => void;
  onDelete: (service: Service) => void;
  onClearSession: (service: Service) => void;
  onTitle: (title: string) => void;
  onUpdateService: (patch: Partial<Service>) => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
  onFloat: () => void;
  onDock: () => void;
  onFloatFocus: () => void;
  onFloatDrag: (dx: number, dy: number) => void;
  onFloatResize: (dx: number, dy: number) => void;
}) {
  const t = useT();
  const controller = useRef<WebviewElement | null>(null);
  const [status, setStatus] = useState<WebviewStatus>({
    loading: true,
    canGoBack: false,
    canGoForward: false,
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);
  /**
   * Google refuses its own sign-in page inside any app-controlled browser, and
   * says so on a page that looks like an ordinary error. Detecting it here lets
   * Kryvex explain the refusal instead of leaving the user to guess whether the
   * shield or their password is at fault.
   */
  const [googleBlocked, setGoogleBlocked] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(service.url);
  const [codePrompt, setCodePrompt] = useState<OneTimeCodePrompt | null>(null);
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const codeProfile = matchOneTimeCodeProfile(currentUrl);

  useEffect(() => {
    setCurrentUrl(service.url);
  }, [service.url]);

  // A parked frame is transparent, not display:none, so the browser no longer
  // removes focus for us. Drop it explicitly or keystrokes could keep landing
  // in a service that is no longer in front.
  useEffect(() => {
    if (active) return;
    try {
      controller.current?.blur();
    } catch {
      /* the guest may not be attached yet */
    }
  }, [active]);

  useEffect(() => {
    if (!isElectron || status.loading) return;
    const element = controller.current;
    if (!element) return;
    let alive = true;
    let url = '';
    try {
      url = element.getURL();
    } catch {
      return;
    }
    if (!isGoogleHost(url)) {
      setGoogleBlocked(false);
      return;
    }
    try {
      void element
        .executeJavaScript(
          `document.body ? document.body.innerText.slice(0, 8000) : ''`,
        )
        .then(text => {
          if (alive) setGoogleBlocked(isGoogleSignInBlock(String(text)));
        })
        .catch(() => undefined);
    } catch {
      // The guest can detach between the status update and this probe; the
      // next dom-ready status retries it.
    }
    return () => {
      alive = false;
    };
  }, [isElectron, status.loading, status.error]);

  /**
   * The code prompt belongs to the site, not to Kryvex, so watch the guest's
   * fields instead of guessing from the URL. The strip stays hidden until an
   * enabled code field is actually visible, and disappears when the site moves
   * on. Only the active frame is probed; hidden services keep their session but
   * do not run DOM work in the background.
   */
  useEffect(() => {
    if (!isElectron || !codeProfile || !active || status.loading || status.error) {
      setCodePrompt(null);
      return;
    }
    const element = controller.current;
    if (!element) return;
    const probeScript = oneTimeCodeProbeScript(codeProfile);
    let alive = true;
    let inFlight = false;
    const probe = () => {
      if (inFlight) return;
      inFlight = true;
      let result: Promise<unknown>;
      try {
        result = element.executeJavaScript(probeScript);
      } catch {
        inFlight = false;
        return;
      }
      void result
        .then(value => {
          if (!alive) return;
          const next = parseOneTimeCodePrompt(value);
          setCodePrompt(current => (sameOneTimeCodePrompt(current, next) ? current : next));
        })
        .catch(() => {
          if (alive) setCodePrompt(null);
        })
        .finally(() => {
          inFlight = false;
        });
    };
    probe();
    const timer = window.setInterval(probe, 1800);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [isElectron, codeProfile, active, status.loading, status.error]);

  useEffect(() => {
    setCode('');
    setCodeState('idle');
  }, [codePrompt]);

  async function submitOneTimeCode(event: React.FormEvent) {
    event.preventDefault();
    const prompt = codePrompt;
    if (!prompt || !isValidOneTimeCode(code, prompt)) return;
    const profile = oneTimeCodeProfileById(prompt.profileId);
    const element = controller.current;
    if (!profile || !element) return;
    setCodeState('sending');
    try {
      const result = await element.executeJavaScript(
        oneTimeCodeSubmitScript(profile, prompt, code),
      );
      if (result === 'ok') {
        setCode('');
        setCodeState('sent');
        onToast(t('Code sent to {service}.', { service: service.name }), 'info');
      } else {
        setCodeState('error');
      }
    } catch {
      setCodeState('error');
    }
  }

  async function focusOneTimeCode() {
    const element = controller.current;
    if (!element || !codePrompt) return;
    const profile = oneTimeCodeProfileById(codePrompt.profileId);
    if (!profile) return;
    try {
      await element.executeJavaScript(oneTimeCodeFocusScript(profile));
    } catch {
      /* the page may have moved on between the probe and the click */
    }
  }

  const category = t(CATEGORIES.find(item => item.id === service.category)?.label ?? 'Other');
  const badge = unread > 99 ? '99+' : String(unread);
  const notificationsOn = notifications && service.notifications !== false;
  const pauseWhenInactive = service.persistence === 'pause';

  // Pointer capture keeps a drag alive over the guest: the webview would
  // otherwise swallow every move once the pointer crossed into it.
  function beginDrag(event: React.PointerEvent<HTMLElement>) {
    if (!floating) return;
    event.preventDefault();
    let lastX = event.clientX;
    let lastY = event.clientY;
    const move = (next: PointerEvent) => {
      onFloatDrag(next.clientX - lastX, next.clientY - lastY);
      lastX = next.clientX;
      lastY = next.clientY;
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  function beginResize(event: React.PointerEvent<HTMLElement>) {
    if (!floating) return;
    event.preventDefault();
    event.stopPropagation();
    let lastX = event.clientX;
    let lastY = event.clientY;
    const move = (next: PointerEvent) => {
      onFloatResize(next.clientX - lastX, next.clientY - lastY);
      lastX = next.clientX;
      lastY = next.clientY;
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  return (
    <div
      className={`service-frame ${active ? 'is-active' : ''} ${
        !active && pauseWhenInactive ? 'is-parked' : ''
      } ${floating ? 'is-floating' : ''}`}
      style={floating ? floatWindowStyle(floating, floatZ) : undefined}
      data-service={service.id}
      aria-hidden={!active && !floating}
      inert={!active && !floating}
      onPointerDown={() => {
        if (floating) onFloatFocus();
      }}
    >
      <header className="service-toolbar">
        {floating ? (
          <span
            className="service-float-grip"
            role="separator"
            aria-label={t('Drag this window')}
            title={t('Drag to move · arrows to nudge')}
            tabIndex={0}
            onPointerDown={beginDrag}
            onKeyDown={event => {
              const step = event.shiftKey ? 32 : 8;
              const moves: Record<string, [number, number]> = {
                ArrowLeft: [-step, 0],
                ArrowRight: [step, 0],
                ArrowUp: [0, -step],
                ArrowDown: [0, step],
              };
              const move = moves[event.key];
              if (!move) return;
              event.preventDefault();
              onFloatDrag(move[0], move[1]);
            }}
          >
            <span />
            <span />
            <span />
          </span>
        ) : null}
        <button
          className="icon-btn"
          onClick={floating ? onDock : onBack}
          aria-label={t('Back to services')}
          title={t('Back')}
        >
          <Icon name="back" size={16} />
        </button>

        <ServiceIcon service={service} size={30} />

        <div className="service-id">
          <div className="service-title-line">
            <h1>{service.name}</h1>
            <span className="tag mono">{category}</span>
            {service.pinned ? <span className="tag mono accent">{t('PINNED')}</span> : null}
            {service.muted ? (
              <span className="tag mono" title={t('This service is muted.')}>
                {t('MUTED')}
              </span>
            ) : null}
            {pauseWhenInactive ? (
              <span className="tag mono" title={t('Audio and video pause while this view is hidden.')}>
                {t('PAUSE WHEN HIDDEN')}
              </span>
            ) : null}
            {unread > 0 ? (
              <span className="tag mono service-unread" aria-label={t('{count} unread', { count: unread })}>
                {badge}
              </span>
            ) : null}
          </div>
          <span className="mono service-url">{hostOf(service.url)}</span>
        </div>

        <div className="service-actions">
          <span
            className={`mono service-live ${notificationsOn ? 'is-on' : ''}`}
            title={
              notificationsOn
                ? t('Desktop notifications are on for this service.')
                : service.notifications === false
                  ? t('Notifications are hidden for this service.')
                  : t('Desktop notifications are off in Settings.')
            }
          >
            <span className="status-dot" />
            {notificationsOn ? t('LIVE') : t('QUIET')}
          </span>
          <ServiceQuickMenu
            service={service}
            variant="toolbar"
            notificationsGloballyOn={notifications}
            onChange={onUpdateService}
          />
          <button
            className="icon-btn"
            onClick={() => controller.current?.reload()}
            title={t('Reload')}
            aria-label={t('Reload service')}
          >
            <Icon name="reload" size={16} />
          </button>
          <button
            className="btn secondary small"
            onClick={() => {
              openExternalUrl(service.url);
              onToast(t('Opened in your default browser.'), 'info');
            }}
          >
            <Icon name="external" size={14} />
            {t('Open externally')}
          </button>
          <button
            className="icon-btn"
            onClick={floating ? onDock : onFloat}
            title={floating ? t('Dock this module') : t('Float this module over the workspace')}
            aria-label={floating ? t('Dock this module') : t('Float this module')}
            aria-pressed={Boolean(floating)}
          >
            <Icon name={floating ? 'monitor' : 'layers'} size={16} />
          </button>
          <button
            className="icon-btn"
            onClick={() => onClearSession(service)}
            title={t('Clear this session')}
            aria-label={t('Clear this session')}
          >
            <Icon name="lock" size={16} />
          </button>
          <button className="icon-btn" onClick={() => onEdit(service)} title={t('Edit')} aria-label={t('Edit service')}>
            <Icon name="edit" size={16} />
          </button>
          <button
            className="icon-btn danger"
            onClick={() => onDelete(service)}
            title={t('Remove')}
            aria-label={t('Remove service')}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      </header>

      {codePrompt ? (
        <div className="one-time-code" role="status">
          <span className="one-time-code-mark" aria-hidden="true">
            <Icon name="lock" size={15} />
          </span>
          <div className="one-time-code-copy">
            <strong>{t(codePrompt.label)}</strong>
            <span>
              {codePrompt.profileId === 'steam'
                ? t('Enter the 5-character code from the Steam app or email.')
                : t(
                    'Enter the {count}-character code from your authenticator app or email.',
                    { count: codePrompt.length },
                  )}
            </span>
          </div>
          <form className="one-time-code-form" onSubmit={submitOneTimeCode}>
            <input
              className="one-time-code-input mono"
              value={code}
              onChange={event => {
                setCode(normalizeOneTimeCode(event.target.value, codePrompt));
                if (codeState !== 'sending') setCodeState('idle');
              }}
              placeholder={t('CODE')}
              aria-label={t('Sign-in code')}
              autoComplete="one-time-code"
              inputMode={codePrompt.numeric ? 'numeric' : 'text'}
              spellCheck={false}
              autoFocus
            />
            <button
              type="submit"
              className="btn primary small"
              disabled={!isValidOneTimeCode(code, codePrompt) || codeState === 'sending'}
            >
              {codeState === 'sending'
                ? t('Sending…')
                : codePrompt.profileId === 'steam'
                  ? t('Submit to Steam')
                  : t('Submit code')}
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => void focusOneTimeCode()}
            >
              {t('Use page field')}
            </button>
          </form>
          {codeState === 'error' ? (
            <span className="one-time-code-note is-error">
              {t('The code could not be sent. Try again or use the page field.')}
            </span>
          ) : codeState === 'sent' ? (
            <span className="one-time-code-note">
              {t('Code sent to {service}.', { service: service.name })}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="service-canvas">
        {active && status.loading && !status.error ? (
          <div className="loading-bar" aria-hidden="true" />
        ) : null}

        {!isElectron ? (
          <div className="webview-fallback">
            <ThemeMark mark={mark} size={128} variant="tile" />
            <h2>{service.name}</h2>
            <p>
              {t(
                'The web build opens each service in its own browser tab. The desktop app embeds it with a persistent session, notifications and sign-in popups.',
              )}
            </p>
            <div className="fallback-meta mono">
              <span>{t('PARTITION {partition}', { partition: partitionFor(service.id) })}</span>
              <span>{service.url}</span>
            </div>
            <a
              className="btn secondary"
              href={service.url}
              target={`kryvex-${service.id}`}
              rel="noreferrer"
            >
              {t('Open in this browser')}
            </a>
          </div>
        ) : (
          <Webview
            key={`${service.id}-${reloadKey}`}
            src={service.url}
            partition={partitionFor(service.id)}
            allowPopups
            muted={service.muted}
            paused={!active && pauseWhenInactive}
            controller={controller}
            onStatus={setStatus}
            onTitle={onTitle}
            onNavigate={url => {
              setCurrentUrl(url);
              if (active && url !== service.url) {
                onToast(t('Navigated to {host}', { host: hostOf(url) }), 'info');
              }
            }}
          />
        )}

        {googleBlocked ? (
          <div className="signin-blocked" role="status">
            <Icon name="shield" size={17} />
            <div>
              <strong>{t('Google will not sign in inside an embedded browser.')}</strong>
              <p>
                {t(
                  'Google blocks sign-in in app-embedded browsers. Kryvex already reports one consistent Chrome identity, so if this card still appears the refusal is Google\u2019s policy, not a missing setting. A stale Google session makes it worse: clearing it and signing in fresh often gets further.',
                )}
              </p>
            </div>
            <div className="signin-blocked-actions">
              <button
                className="btn primary small"
                onClick={() => {
                  onClearSession(service);
                  setGoogleBlocked(false);
                  setReloadKey(value => value + 1);
                }}
              >
                {t('Reset session & retry')}
              </button>
              <button
                className="btn secondary small"
                onClick={() => openExternalUrl(service.url)}
              >
                <Icon name="external" size={12} /> {t('Open in my browser')}
              </button>
              <button className="btn ghost small" onClick={() => setGoogleBlocked(false)}>
                {t('Dismiss')}
              </button>
            </div>
          </div>
        ) : null}

        {active && status.error ? (
          <div className="webview-error" role="alert">
            <Icon name="shield" size={22} />
            <h3>{t('This module could not load')}</h3>
            <p>{status.error}</p>
            <div className="error-actions">
              <button
                className="btn primary"
                onClick={() => {
                  setStatus({ ...status, error: null, loading: true });
                  setReloadKey(value => value + 1);
                }}
              >
                {t('Try again')}
              </button>
              <button
                className="btn secondary"
                onClick={() => {
                  openExternalUrl(service.url);
                }}
              >
                {t('Open externally')}
              </button>
            </div>
            <p className="mono error-note">
              {t(
                'Some sites refuse embedding with frame or cookie policies. Kryvex never disables security to force them in.',
              )}
            </p>
          </div>
        ) : null}
      </div>

      {floating ? (
        <span
          className="service-float-resize"
          role="separator"
          aria-label={t('Resize this window')}
          title={t('Drag to resize')}
          tabIndex={0}
          onPointerDown={beginResize}
          onKeyDown={event => {
            const step = event.shiftKey ? 32 : 8;
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              event.preventDefault();
              onFloatResize(event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowDown' ? step : 0);
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              event.preventDefault();
              onFloatResize(event.key === 'ArrowLeft' ? -step : 0, event.key === 'ArrowUp' ? -step : 0);
            }
          }}
        />
      ) : null}
    </div>
  );
}
