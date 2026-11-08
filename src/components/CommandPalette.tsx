import { useEffect, useMemo, useRef, useState } from 'react';
import type { PersistedState, Service, ViewId } from '../types';
import { getTheme, THEMES } from '../lib/themes';
import { useT } from '../lib/i18n';
import {
  matchScore,
  sanitizeSearchHits,
  searchTerms,
  type SearchHit,
} from '../../electron/search-rules';
import { Icon, ServiceIcon } from './ui';

interface Command {
  id: string;
  label: string;
  hint: string;
  group: 'Navigate' | 'Actions' | 'Services' | 'Themes';
  icon?: React.ReactNode;
  run: () => void;
}

/** One drawable row, whether it came from a command or from the local index. */
interface Row {
  key: string;
  label: string;
  hint: string;
  group: string;
  /** What Enter does with this row, in a word or two. */
  opens: string;
  icon?: React.ReactNode;
  /** A row that stays in the palette: re-running a saved query, not leaving. */
  keepOpen?: boolean;
  run: () => void;
}

export function CommandPalette({
  state,
  recentSearches,
  onClose,
  onNavigate,
  onOpenService,
  onOpenUrl,
  onAdd,
  onSetTheme,
  onRememberSearch,
}: {
  state: PersistedState;
  /**
   * The queries already run, newest first. The palette only offers them when
   * the field is empty, so they can never crowd out an answer to typing.
   */
  recentSearches?: string[];
  onClose: () => void;
  onNavigate: (view: ViewId) => void;
  onOpenService: (service: Service) => void;
  onOpenUrl: (url: string) => void;
  onAdd: () => void;
  onSetTheme: (id: string) => void;
  /** Called with the query when a row is run, so the list stays a memory. */
  onRememberSearch?: (query: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<SearchHit[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const currentTheme = getTheme(state.settings.themeId);
  const terms = useMemo(() => searchTerms(query), [query]);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      { id: 'nav-home', label: t('Go to Home'), hint: t('Workspace'), group: 'Navigate', icon: <Icon name="home" size={15} />, run: () => onNavigate('home') },
      { id: 'nav-services', label: t('Go to Services'), hint: t('Module registry'), group: 'Navigate', icon: <Icon name="layers" size={15} />, run: () => onNavigate('services') },
      { id: 'nav-browser', label: t('Go to Browser'), hint: t('Tabs and bookmarks'), group: 'Navigate', icon: <Icon name="globe" size={15} />, run: () => onNavigate('browser') },
      { id: 'nav-assistant', label: t('Go to Vexium'), hint: t('Local assistant'), group: 'Navigate', icon: <Icon name="spark" size={15} />, run: () => onNavigate('assistant') },
      { id: 'nav-rooms', label: t('Go to Rooms'), hint: t('Share a screen and chat'), group: 'Navigate', icon: <Icon name="users" size={15} />, run: () => onNavigate('rooms') },
      { id: 'nav-settings', label: t('Go to Settings'), hint: t('Appearance and data'), group: 'Navigate', icon: <Icon name="sliders" size={15} />, run: () => onNavigate('settings') },
    ];
    const actions: Command[] = [
      { id: 'action-add', label: t('Add a service'), hint: t('Create a module'), group: 'Actions', icon: <Icon name="plus" size={15} />, run: onAdd },
      {
        // The Browser owns the live page; this only asks it to capture. With
        // no browser tab in front there is nothing to read, so the command
        // stays out of the way instead of opening an empty Vexium.
        id: 'action-send-vexium',
        label: t('Send the current page to Vexium'),
        hint: t('Browser'),
        group: 'Actions',
        icon: <Icon name="spark" size={15} />,
        run: () => window.dispatchEvent(new CustomEvent('kryvex:vexium-capture')),
      },
    ];
    const services: Command[] = state.services.map(service => ({
      id: `service-${service.id}`,
      label: service.name,
      hint: service.url.replace(/^https?:\/\//, ''),
      group: 'Services',
      icon: <ServiceIcon service={service} size={18} />,
      run: () => onOpenService(service),
    }));
    const themes: Command[] = THEMES.filter(theme => theme.id !== currentTheme.id).map(theme => ({
      id: `theme-${theme.id}`,
      label: t('Switch to {name}', { name: t(theme.name) }),
      hint: t(theme.mode === 'dark' ? 'Dark' : 'Light'),
      group: 'Themes',
      icon: <span className="theme-dot" style={{ background: theme.tokens.accent as string }} />,
      run: () => onSetTheme(theme.id),
    }));
    return [...nav, ...actions, ...services, ...themes];
  }, [state.services, state.settings.sidebarCollapsed, currentTheme.id, onNavigate, onOpenService, onAdd, onSetTheme, t]);

  /**
   * The main process answers with history, bookmarks, downloads and services.
   * It is asked for a query, never for a source: the index is local, and the
   * answer is already ranked by the rules this palette scores its commands with.
   */
  useEffect(() => {
    const raw = query.trim();
    if (!raw || !window.kryvex?.searchQuery) {
      setRemote([]);
      return;
    }
    let live = true;
    // One request per pause in typing, not one per keystroke.
    const timer = window.setTimeout(() => {
      void window.kryvex
        ?.searchQuery(raw)
        .then(hits => {
          if (live) setRemote(sanitizeSearchHits(hits));
        })
        .catch(() => {
          if (live) setRemote([]);
        });
    }, 90);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  /** What a command's group means for Enter, so every row can say it. */
  const opensFor = (group: Command['group']): string => {
    if (group === 'Navigate') return t('Opens the view');
    if (group === 'Actions') return t('Runs the action');
    if (group === 'Services') return t('Opens the module');
    return t('Switches the theme');
  };

  const rows = useMemo<Row[]>(() => {
    const local = commands.map(command => ({
      key: command.id,
      label: command.label,
      hint: command.hint,
      group: command.group as string,
      opens: opensFor(command.group),
      icon: command.icon,
      run: command.run,
    }));
    if (!terms) {
      // An empty field is the one place past queries are useful: they replace
      // the typing they were typed from, and Enter runs the search again.
      const remembered: Row[] = (recentSearches ?? []).map(term => ({
        key: `recent-${term.toLowerCase()}`,
        label: term,
        hint: t('Recent search'),
        group: t('Recent searches'),
        opens: t('Searches again'),
        keepOpen: true,
        icon: <Icon name="search" size={15} />,
        run: () => setQuery(term),
      }));
      return [...remembered, ...local];
    }

    const sourceLabel = (source: SearchHit['source']): string =>
      source === 'service'
        ? t('Services')
        : source === 'history'
          ? t('History')
          : source === 'bookmark'
            ? t('Bookmarks')
            : t('Downloads');

    const sourceIcon = (source: SearchHit['source']): React.ReactNode => {
      if (source === 'service') return <Icon name="layers" size={15} />;
      if (source === 'bookmark') return <Icon name="globe" size={15} />;
      if (source === 'download') return <Icon name="sliders" size={15} />;
      return <Icon name="search" size={15} />;
    };

    const sourceOpens = (source: SearchHit['source']): string => {
      if (source === 'service') return t('Opens the module');
      if (source === 'download') return t('Shows the file');
      return t('Opens in Browser');
    };

    const fromIndex = (hit: SearchHit): Row => {
      const id = hit.id.replace(/^[a-z]+:/, '');
      return {
        key: hit.id,
        label: hit.title,
        hint: hit.subtitle ?? hit.url ?? '',
        group: sourceLabel(hit.source),
        opens: sourceOpens(hit.source),
        icon: sourceIcon(hit.source),
        run: () => {
          if (hit.source === 'service') {
            const service =
              state.services.find(entry => entry.id === id) ??
              state.services.find(entry => entry.url === hit.url);
            if (service) {
              onOpenService(service);
              return;
            }
          }
          if (hit.source === 'download') {
            void window.kryvex?.downloadsOpen(id);
            return;
          }
          if (hit.url) onOpenUrl(hit.url);
        },
      };
    };

    const ranked: Array<Row & { score: number }> = [];
    for (const row of local) {
      // The index answers for services, so the palette's own copies are left
      // out of a query: one site must not appear twice in one list.
      if (row.group === 'Services') continue;
      const score = matchScore({ title: row.label, subtitle: row.hint }, terms);
      if (score !== null) ranked.push({ ...row, score });
    }
    for (const hit of remote) ranked.push({ ...fromIndex(hit), score: hit.score });
    ranked.sort(
      (a, b) =>
        b.score - a.score ||
        a.label.localeCompare(b.label) ||
        a.key.localeCompare(b.key),
    );
    return ranked;
  }, [commands, terms, remote, state.services, recentSearches, onOpenService, onOpenUrl, t]);

  // Groups keep the ranking's shape: the group holding the best row leads.
  const groups = useMemo(() => {
    const order: string[] = [];
    for (const row of rows) if (!order.includes(row.group)) order.push(row.group);
    return order;
  }, [rows]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function run(row: Row | undefined) {
    if (!row) return;
    // A row that was picked out of a search teaches the palette the query that
    // led there; the remembered list is therefore about real searches only.
    const asked = terms ? query.trim() : '';
    if (asked && onRememberSearch) onRememberSearch(asked);
    row.run();
    if (!row.keepOpen) onClose();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(value => Math.min(value + 1, rows.length - 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(value => Math.max(value - 1, 0));
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      run(rows[active]);
    }
  }

  return (
    <div className="palette-layer" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('Command palette')} onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Icon name="search" size={16} />
          <input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('Type a service, view or action…')}
            aria-label={t('Command palette search')}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="palette-list" ref={listRef}>
          {rows.length === 0 ? (
            <p className="palette-empty">{t('No matches. Try a service name, or add one.')}</p>
          ) : (
            groups.map(group => {
              const items = rows.filter(row => row.group === group);
              if (items.length === 0) return null;
              return (
                <section key={group}>
                  <h3>{group}</h3>
                  {items.map(row => {
                    const index = rows.indexOf(row);
                    return (
                      <button
                        key={row.key}
                        data-index={index}
                        className={`palette-item ${index === active ? 'is-active' : ''}`}
                        onMouseMove={() => setActive(index)}
                        onClick={() => run(row)}
                      >
                        <span className="palette-icon">{row.icon}</span>
                        <span className="palette-label">{row.label}</span>
                        <span className="palette-opens mono">{row.opens}</span>
                        <span className="palette-hint mono">{row.hint}</span>
                      </button>
                    );
                  })}
                </section>
              );
            })
          )}
        </div>
        <div className="palette-foot mono">
          <span>{t('↑↓ NAVIGATE')}</span>
          <span>{t('↵ OPEN')}</span>
          <span>{t('ESC CLOSE')}</span>
        </div>
      </div>
    </div>
  );
}
