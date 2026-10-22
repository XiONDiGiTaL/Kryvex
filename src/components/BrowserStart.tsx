import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DefaultBrowserStatus,
  PersistedState,
  RssFeed,
  RssItem,
  ShieldStatus,
} from '../types';
import { useI18n } from '../lib/i18n';
import { makeId } from '../lib/services';
import {
  MAX_FEEDS,
  feedLabel,
  mergeFeedItems,
  normalizeFeedUrl,
  parseFeed,
  parseOpml,
} from '../lib/rss';
import { hostOf } from '../lib/url';
import { Icon, ServiceIcon, ThemeMark, type ThemeMarkKind } from './ui';

interface LoadedFeed {
  loading: boolean;
  error: string | null;
  title: string;
  items: RssItem[];
}

/**
 * The default start page.
 *
 * A browser's new tab is the one surface a user sees dozens of times a day, so
 * this is built like the rest of Kryvex rather than as a blank page: the shield's
 * live counters, a short field guide, the workspace's own modules, and a local
 * RSS reader all sit on the same grid. Nothing here is fetched until a tab is
 * actually on the start page, and no feed markup is ever rendered as HTML.
 */
export function BrowserStart({
  state,
  isElectron,
  privateTab,
  mark = 'kx',
  startQuery,
  onStartQuery,
  onSearch,
  onOpen,
  feeds,
  onAddFeeds,
  onRemoveFeed,
  browserStatus,
  browserBusy,
  onMakeDefault,
  onOpenDefaultSettings,
  onToast,
}: {
  state: PersistedState;
  isElectron: boolean;
  privateTab: boolean;
  mark?: ThemeMarkKind;
  startQuery: string;
  onStartQuery: (value: string) => void;
  onSearch: (value: string) => void;
  onOpen: (url: string, title?: string) => void;
  feeds: RssFeed[];
  onAddFeeds: (feeds: RssFeed[]) => void;
  onRemoveFeed: (id: string) => void;
  browserStatus: DefaultBrowserStatus | null;
  browserBusy: boolean;
  onMakeDefault: () => void;
  onOpenDefaultSettings: () => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
}) {
  const { t, locale } = useI18n();
  const [shield, setShield] = useState<ShieldStatus | null>(null);
  const [feedInput, setFeedInput] = useState('');
  const [feedState, setFeedState] = useState<Record<string, LoadedFeed>>({});
  const [feedRevision, setFeedRevision] = useState(0);
  const [feedBusy, setFeedBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isElectron || !window.kryvex) return;
    let alive = true;
    const refresh = () => {
      void window.kryvex!
        .shieldStatus()
        .then(next => {
          if (alive) setShield(next);
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [isElectron]);

  useEffect(() => {
    if (feeds.length === 0) {
      setFeedState({});
      return;
    }
    let alive = true;
    setFeedState(current =>
      Object.fromEntries(
        feeds.map(feed => [
          feed.id,
          current[feed.id] ?? { loading: true, error: null, title: feed.title, items: [] },
        ]),
      ),
    );

    const load = async (feed: RssFeed): Promise<[string, LoadedFeed]> => {
      try {
        const result = window.kryvex
          ? await window.kryvex.rssFetch(feed.url)
          : await fetch(feed.url, {
              headers: { Accept: 'application/rss+xml, application/atom+xml, text/xml' },
            }).then(async response => ({
              ok: response.ok,
              text: response.ok ? await response.text() : '',
              url: feed.url,
              error: response.ok ? undefined : ('unavailable' as const),
            }));
        if (!result.ok) {
          return [
            feed.id,
            {
              loading: false,
              error: result.error ?? 'unavailable',
              title: feed.title,
              items: [],
            },
          ];
        }
        const parsed = parseFeed(result.text, feed.url);
        return [
          feed.id,
          {
            loading: false,
            error: parsed.items.length === 0 ? 'empty' : null,
            title: parsed.title || feed.title,
            items: parsed.items,
          },
        ];
      } catch {
        return [feed.id, { loading: false, error: 'unavailable', title: feed.title, items: [] }];
      }
    };

    void Promise.all(feeds.map(load)).then(entries => {
      if (alive) setFeedState(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
  }, [feeds, feedRevision]);

  const loaded = Object.values(feedState);
  const stories = useMemo(() => mergeFeedItems(loaded.flatMap(feed => feed.items), 9), [loaded]);
  const unreadErrors = loaded.filter(feed => feed.error).length;
  const loading = loaded.some(feed => feed.loading);
  const filteredBookmarks = state.bookmarks.slice(0, 4);
  const modules = state.services.slice(0, 6);

  const defaultText = !browserStatus
    ? t('Checking Windows Default Apps…')
    : browserStatus.isDefault
      ? t('Kryvex handles http and https links from Windows.')
      : (browserStatus.detail ?? t('Windows will ask you to confirm.'));

  function addFeed() {
    const url = normalizeFeedUrl(feedInput);
    if (!url) {
      onToast(t('Enter a feed address, for example example.com/rss.'), 'warning');
      return;
    }
    if (feeds.some(feed => feed.url === url)) {
      onToast(t('That feed is already on this page.'), 'info');
      return;
    }
    if (feeds.length >= MAX_FEEDS) {
      onToast(t('A start page can hold up to {count} feeds.', { count: MAX_FEEDS }), 'warning');
      return;
    }
    onAddFeeds([
      { id: makeId('f'), title: feedLabel(url), url, addedAt: Date.now() },
    ]);
    setFeedInput('');
    onToast(t('Feed added to the start page.'), 'success');
  }

  async function importOpml(file: File) {
    setFeedBusy(true);
    try {
      const entries = parseOpml(await file.text());
      if (entries.length === 0) {
        onToast(t('No feeds were found in that OPML file.'), 'warning');
        return;
      }
      const known = new Set(feeds.map(feed => feed.url));
      const room = Math.max(0, MAX_FEEDS - feeds.length);
      const fresh = entries
        .filter(entry => !known.has(entry.url))
        .slice(0, room)
        .map(entry => ({
          id: makeId('f'),
          title: entry.title || feedLabel(entry.url),
          url: entry.url,
          addedAt: Date.now(),
        }));
      if (fresh.length === 0) {
        onToast(t('Those feeds are already on this page.'), 'info');
        return;
      }
      onAddFeeds(fresh);
      onToast(
        t('{count} feeds imported from {name}.', {
          count: fresh.length,
          name: file.name,
        }),
        'success',
      );
    } catch {
      onToast(t('That OPML file could not be read.'), 'danger');
    } finally {
      setFeedBusy(false);
    }
  }

  function feedError(code: string): string {
    switch (code) {
      case 'invalid-url':
        return t('That feed address is not a web URL.');
      case 'too-large':
        return t('That feed is larger than 2 MB.');
      case 'not-feed':
        return t('That address answered, but not with a feed.');
      case 'empty':
        return t('The feed is readable but has no entries.');
      default:
        return t('The feed could not be reached.');
    }
  }

  return (
    <div className={`browser-start ${privateTab ? 'is-private' : ''}`}>
      <div className="start-wrap">
        <header className="start-hero">
          <div className="start-hero-mark">
            <ThemeMark mark={mark} size={58} variant="tile" />
          </div>
          <div className="start-hero-copy">
            <p className="eyebrow mono">
              {privateTab ? t('KRYVEX START / PRIVATE') : t('KRYVEX START / ELEMENT x529')}
            </p>
            <h1>{privateTab ? t('A tab that leaves no trace') : t('Where to?')}</h1>
            <p className="start-lede">
              {privateTab
                ? t(
                    'Cookies, site storage and history from this tab stay in memory and disappear when it closes. Downloads still reach your disk, and the Shield still filters.',
                  )
                : t(
                    'One address bar for the web, one place for your modules, and a start page that tells you what the browser is doing. Everything below is local.',
                  )}
            </p>
          </div>
          <div className="start-hero-index mono" aria-hidden="true">
            <span>01</span>
            <span className="start-hero-rule" />
            <span>{privateTab ? t('PRIVATE') : t('START')}</span>
          </div>
        </header>

        <form
          className="start-search"
          onSubmit={event => {
            event.preventDefault();
            if (!startQuery.trim()) return;
            onSearch(startQuery);
            onStartQuery('');
          }}
        >
          <Icon name={privateTab ? 'incognito' : 'search'} size={16} />
          <input
            autoFocus
            value={startQuery}
            onChange={event => onStartQuery(event.target.value)}
            placeholder={
              privateTab
                ? t('Search privately with {engine}', { engine: state.settings.searchEngine })
                : t('Search with {engine}', { engine: state.settings.searchEngine })
            }
            aria-label={t('Search the web')}
          />
          <button type="submit" className="btn secondary small">
            {t('Go')}
          </button>
        </form>

        <div className="start-statusline mono">
          <span className={`start-chip ${shield?.enabled ? 'is-on' : ''}`}>
            <Icon name="shield" size={11} />
            {!isElectron
              ? t('SHIELD / DESKTOP')
              : shield?.enabled
                ? t('SHIELD / ON')
                : t('SHIELD / OFF')}
          </span>
          <span>{t('{count} MODULES', { count: state.services.length })}</span>
          <span>{t('{count} BOOKMARKS', { count: state.bookmarks.length })}</span>
          <span>{t('{count} FEEDS', { count: feeds.length })}</span>
        </div>

        <div className="start-grid">
          <section className="start-card start-card-shield" aria-labelledby="start-shield-title">
            <div className="start-card-head">
              <span className="start-card-icon">
                <Icon name="shield" size={16} />
              </span>
              <div>
                <p className="mono start-card-kicker">{t('SHIELD / LIVE')}</p>
                <h2 id="start-shield-title">{t('What was blocked')}</h2>
              </div>
            </div>

            {!isElectron ? (
              <p className="start-note">
                {t('The Shield runs inside the desktop app. This web preview cannot filter traffic.')}
              </p>
            ) : shield ? (
              <>
                <div className="shield-figure">
                  <strong className="mono">{(shield.blocked ?? 0).toLocaleString(locale)}</strong>
                  <span>{t('requests blocked this session')}</span>
                </div>
                <dl className="shield-stat-list">
                  <div>
                    <dt>{t('Network filters')}</dt>
                    <dd className="mono">{shield.filters.toLocaleString(locale)}</dd>
                  </div>
                  <div>
                    <dt>{t('HTTPS upgrades')}</dt>
                    <dd className="mono">{shield.httpsUpgrades.toLocaleString(locale)}</dd>
                  </div>
                  <div>
                    <dt>{t('Tracking parameters stripped')}</dt>
                    <dd className="mono">{shield.paramsStripped.toLocaleString(locale)}</dd>
                  </div>
                </dl>
                <p className="start-note">
                  {shield.enabled
                    ? t('{lists} filter lists loaded{updated}.', {
                        lists: shield.lists.length,
                        updated: shield.updatedAt
                          ? ` · ${t('updated {time}', {
                              time: new Date(shield.updatedAt).toLocaleDateString(locale, {
                                month: 'short',
                                day: 'numeric',
                              }),
                            })}`
                          : '',
                      })
                    : t('The Shield is currently off. Turn it on in Settings to filter requests.')}
                </p>
              </>
            ) : (
              <p className="start-note">{t('Reading the Shield counters…')}</p>
            )}

            <a className="link start-card-link" href="#/settings">
              {t('Open Shield settings')}
              <Icon name="forward" size={11} />
            </a>
          </section>

          <section className="start-card start-card-guide" aria-labelledby="start-guide-title">
            <div className="start-card-head">
              <span className="start-card-icon">
                <Icon name="help" size={16} />
              </span>
              <div>
                <p className="mono start-card-kicker">{t('FIELD GUIDE / 05 STEPS')}</p>
                <h2 id="start-guide-title">{t('How this browser works')}</h2>
              </div>
            </div>
            <ol className="start-guide">
              <li>
                <span className="mono">01</span>
                <p>{t('Type an address or a question above. Kryvex searches when the text is not a URL.')}</p>
              </li>
              <li>
                <span className="mono">02</span>
                <p>{t('Ctrl T opens a tab, Ctrl Shift N opens a private one, Ctrl F finds inside a page.')}</p>
              </li>
              <li>
                <span className="mono">03</span>
                <p>{t('The ribbon in the tab strip bookmarks a page. Downloads, history and bookmarks sit in the right-hand library.')}</p>
              </li>
              <li>
                <span className="mono">04</span>
                <p>{t('Every tab has its own in-memory session, so a sign-in cannot leak into another tab.')}</p>
              </li>
              <li>
                <span className="mono">05</span>
                <p>{t('Add a feed below and it is waiting here the next time you open a tab.')}</p>
              </li>
            </ol>
          </section>

          <section className="start-card start-card-feeds" aria-labelledby="start-feeds-title">
            <div className="start-card-head">
              <span className="start-card-icon">
                <Icon name="rss" size={16} />
              </span>
              <div>
                <p className="mono start-card-kicker">{t('FEEDS / LOCAL READER')}</p>
                <h2 id="start-feeds-title">{t('Your reading list')}</h2>
              </div>
              <div className="start-card-actions">
                <button
                  className="link"
                  disabled={loading}
                  onClick={() => setFeedRevision(revision => revision + 1)}
                >
                  <Icon name="reload" size={11} />
                  {t('Refresh')}
                </button>
                <button
                  className="link"
                  disabled={feedBusy}
                  onClick={() => fileInput.current?.click()}
                >
                  <Icon name="upload" size={11} />
                  {t('Import OPML')}
                </button>
                <input
                  ref={fileInput}
                  className="start-file-input"
                  type="file"
                  accept=".opml,.xml,.rss,text/xml,application/xml"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void importOpml(file);
                  }}
                />
              </div>
            </div>

            <form
              className="feed-add"
              onSubmit={event => {
                event.preventDefault();
                addFeed();
              }}
            >
              <Icon name="rss" size={14} />
              <input
                value={feedInput}
                onChange={event => setFeedInput(event.target.value)}
                placeholder={t('Paste an RSS or Atom address')}
                spellCheck={false}
                aria-label={t('Feed address')}
              />
              <button className="btn secondary small" disabled={feedBusy || !feedInput.trim()}>
                {t('Add feed')}
              </button>
            </form>

            {stories.length === 0 ? (
              <div className="start-empty">
                <Icon name="rss" size={22} />
                <strong>
                  {loading
                    ? t('Reading your feeds…')
                    : feeds.length === 0
                      ? t('No feeds on this page yet')
                      : t('No entries to show')}
                </strong>
                <p>
                  {feeds.length === 0
                    ? t(
                        'Paste a feed address, or import the OPML file your current reader exports. Kryvex fetches only the feeds you add.',
                      )
                    : t('The feeds answered without entries. Refresh, or remove one below.')}
                </p>
              </div>
            ) : (
              <ul className="start-stories">
                {stories.map(story => (
                  <li key={story.id}>
                    <button
                      className="start-story"
                      onClick={() => onOpen(story.url, story.title)}
                      title={story.url}
                    >
                      <span className="start-story-main">
                        <strong>{story.title}</strong>
                        {story.summary ? <span>{story.summary}</span> : null}
                      </span>
                      <span className="start-story-meta mono">
                        <span>{hostOf(story.url)}</span>
                        {story.publishedAt ? (
                          <span>
                            {new Date(story.publishedAt).toLocaleDateString(locale, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {feeds.length > 0 ? (
              <div className="feed-manager">
                <span className="mono muted-label">
                  {t('{count} SOURCES{errors}', {
                    count: feeds.length,
                    errors: unreadErrors > 0 ? ` · ${t('{count} UNAVAILABLE', { count: unreadErrors })}` : '',
                  })}
                </span>
                <div className="feed-chips">
                  {feeds.map(feed => {
                    const status = feedState[feed.id];
                    return (
                      <span
                        key={feed.id}
                        className={`feed-chip ${status?.error ? 'has-error' : ''}`}
                        title={status?.error ? feedError(status.error) : feed.url}
                      >
                        <span className="feed-chip-dot" aria-hidden="true" />
                        <span>{status?.title || feed.title}</span>
                        <button
                          onClick={() => onRemoveFeed(feed.id)}
                          aria-label={t('Remove {name} feed', { name: feed.title })}
                        >
                          <Icon name="close" size={10} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>

          <section className="start-card start-card-launch" aria-labelledby="start-launch-title">
            <div className="start-card-head">
              <span className="start-card-icon">
                <Icon name="layers" size={16} />
              </span>
              <div>
                <p className="mono start-card-kicker">{t('WORKSPACE / QUICK LAUNCH')}</p>
                <h2 id="start-launch-title">{t('Your modules and bookmarks')}</h2>
              </div>
              <div className="start-card-actions">
                <a className="link" href="#/services">
                  {t('All services')}
                  <Icon name="forward" size={11} />
                </a>
              </div>
            </div>

            <div className="start-launch-groups">
              <div>
                <span className="mono muted-label">{t('MODULES')}</span>
                <div className="start-links">
                  {modules.map(service => (
                    <button
                      key={service.id}
                      className="start-link"
                      onClick={() => onOpen(service.url, service.name)}
                    >
                      <ServiceIcon service={service} size={22} />
                      <span>{service.name}</span>
                      <span className="mono">{hostOf(service.url)}</span>
                    </button>
                  ))}
                  {modules.length === 0 ? (
                    <p className="start-note">{t('No modules yet. Add one in Services.')}</p>
                  ) : null}
                </div>
              </div>
              <div>
                <span className="mono muted-label">{t('BOOKMARKS')}</span>
                <div className="start-links">
                  {filteredBookmarks.map(bookmark => (
                    <button
                      key={bookmark.id}
                      className="start-link"
                      onClick={() => onOpen(bookmark.url, bookmark.title)}
                    >
                      <Icon name="bookmark" size={16} />
                      <span>{bookmark.title}</span>
                      <span className="mono">{hostOf(bookmark.url)}</span>
                    </button>
                  ))}
                  {filteredBookmarks.length === 0 ? (
                    <p className="start-note">
                      {t('Save a page with the ribbon in the tab strip and it appears here.')}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </div>

        {isElectron ? (
          <div className="default-browser-card">
            <span className="default-browser-mark">
              <Icon name="globe" size={18} />
            </span>
            <div className="default-browser-copy">
              <strong>{t('Make Kryvex your default browser')}</strong>
              <p>{defaultText}</p>
            </div>
            <div className="default-browser-actions">
              <button
                className="btn secondary small"
                disabled={browserBusy || Boolean(browserStatus?.isDefault) || !browserStatus?.canRegister}
                onClick={() => void onMakeDefault()}
              >
                <Icon name={browserStatus?.isDefault ? 'check' : 'globe'} size={13} />
                {browserStatus?.isDefault
                  ? t('Default browser')
                  : browserBusy
                    ? t('Opening…')
                    : t('Set as default')}
              </button>
              {browserStatus && !browserStatus.isDefault && browserStatus.supported ? (
                <button className="link" onClick={() => void onOpenDefaultSettings()}>
                  {t('Windows settings')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
