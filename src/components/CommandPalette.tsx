import { useEffect, useMemo, useRef, useState } from 'react';
import type { PersistedState, Service, ViewId } from '../types';
import { getTheme, THEMES } from '../lib/themes';
import { useT } from '../lib/i18n';
import { Icon, ServiceIcon } from './ui';

interface Command {
  id: string;
  label: string;
  hint: string;
  group: 'Navigate' | 'Actions' | 'Services' | 'Themes';
  icon?: React.ReactNode;
  run: () => void;
}

export function CommandPalette({
  state,
  onClose,
  onNavigate,
  onOpenService,
  onAdd,
  onSetTheme,
}: {
  state: PersistedState;
  onClose: () => void;
  onNavigate: (view: ViewId) => void;
  onOpenService: (service: Service) => void;
  onAdd: () => void;
  onSetTheme: (id: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const currentTheme = getTheme(state.settings.themeId);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(command =>
      `${command.label} ${command.hint} ${command.group}`.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function run(command: Command | undefined) {
    if (!command) return;
    command.run();
    onClose();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(value => Math.min(value + 1, filtered.length - 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(value => Math.max(value - 1, 0));
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      run(filtered[active]);
    }
  }

  const groups = ['Navigate', 'Actions', 'Services', 'Themes'] as const;

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
          {filtered.length === 0 ? (
            <p className="palette-empty">{t('No matches. Try a service name, or add one.')}</p>
          ) : (
            groups.map(group => {
              const items = filtered.filter(command => command.group === group);
              if (items.length === 0) return null;
              return (
                <section key={group}>
                  <h3>{t(group)}</h3>
                  {items.map(command => {
                    const index = filtered.indexOf(command);
                    return (
                      <button
                        key={command.id}
                        data-index={index}
                        className={`palette-item ${index === active ? 'is-active' : ''}`}
                        onMouseMove={() => setActive(index)}
                        onClick={() => run(command)}
                      >
                        <span className="palette-icon">{command.icon}</span>
                        <span className="palette-label">{command.label}</span>
                        <span className="palette-hint mono">{command.hint}</span>
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
