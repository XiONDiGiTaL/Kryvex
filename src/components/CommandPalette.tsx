import { useEffect, useMemo, useRef, useState } from 'react';
import type { PersistedState, Service, ViewId } from '../types';
import { getTheme, THEMES } from '../lib/themes';
import { Icon, ServiceGlyph } from './ui';

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
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const currentTheme = getTheme(state.settings.themeId);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      { id: 'nav-home', label: 'Go to Home', hint: 'Workspace', group: 'Navigate', icon: <Icon name="home" size={15} />, run: () => onNavigate('home') },
      { id: 'nav-services', label: 'Go to Services', hint: 'Module registry', group: 'Navigate', icon: <Icon name="layers" size={15} />, run: () => onNavigate('services') },
      { id: 'nav-browser', label: 'Go to Browser', hint: 'Tabs and bookmarks', group: 'Navigate', icon: <Icon name="globe" size={15} />, run: () => onNavigate('browser') },
      { id: 'nav-settings', label: 'Go to Settings', hint: 'Appearance and data', group: 'Navigate', icon: <Icon name="sliders" size={15} />, run: () => onNavigate('settings') },
    ];
    const actions: Command[] = [
      { id: 'action-add', label: 'Add a service', hint: 'Create a module', group: 'Actions', icon: <Icon name="plus" size={15} />, run: onAdd },
    ];
    const services: Command[] = state.services.map(service => ({
      id: `service-${service.id}`,
      label: service.name,
      hint: service.url.replace(/^https?:\/\//, ''),
      group: 'Services',
      icon: <ServiceGlyph letter={service.letter} color={service.color} size={18} />,
      run: () => onOpenService(service),
    }));
    const themes: Command[] = THEMES.filter(theme => theme.id !== currentTheme.id).map(theme => ({
      id: `theme-${theme.id}`,
      label: `Switch to ${theme.name}`,
      hint: theme.mode,
      group: 'Themes',
      icon: <span className="theme-dot" style={{ background: theme.tokens.accent as string }} />,
      run: () => onSetTheme(theme.id),
    }));
    return [...nav, ...actions, ...services, ...themes];
  }, [state.services, state.settings.sidebarCollapsed, currentTheme.id, onNavigate, onOpenService, onAdd, onSetTheme]);

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
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Icon name="search" size={16} />
          <input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Type a service, view or action…"
            aria-label="Command palette search"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="palette-list" ref={listRef}>
          {filtered.length === 0 ? (
            <p className="palette-empty">No matches. Try a service name, or add one.</p>
          ) : (
            groups.map(group => {
              const items = filtered.filter(command => command.group === group);
              if (items.length === 0) return null;
              return (
                <section key={group}>
                  <h3>{group}</h3>
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
          <span>↑↓ NAVIGATE</span>
          <span>↵ OPEN</span>
          <span>ESC CLOSE</span>
        </div>
      </div>
    </div>
  );
}
