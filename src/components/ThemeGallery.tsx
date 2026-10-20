import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Theme, ThemeFamily } from '../lib/themes';
import { FAMILY_LABELS, THEMES } from '../lib/themes';
import { galleryFamilyFor, galleryGroups } from '../lib/theme-gallery';
import { useT } from '../lib/i18n';
import { Icon } from './ui';

/**
 * A miniature Kryvex workspace painted with one theme's tokens. Nothing here
 * touches the document theme: the mock is a self-contained box of CSS
 * variables, so a whole gallery can show twelve looks at once.
 */
export function ThemePreview({ theme, large = false }: { theme: Theme; large?: boolean }) {
  const tokens = theme.tokens;
  const surface = tokens.surface ?? tokens.bg;
  const raised = tokens.raised ?? surface;
  const line = tokens.line ?? tokens.muted;
  const style = {
    '--m-bg': tokens.bg,
    '--m-surface': surface,
    '--m-raised': raised,
    '--m-line': line,
    '--m-ink': tokens.ink,
    '--m-muted': tokens.muted,
    '--m-accent': tokens.accent,
    '--m-soft': tokens.accentSoft,
    '--m-on-accent': tokens.onAccent ?? (theme.mode === 'light' ? '#FFFFFF' : '#06121B'),
    '--m-font': theme.mono ? 'var(--font-mono)' : 'var(--font-ui)',
    '--m-fill': theme.gradient
      ? `linear-gradient(135deg, ${tokens.accent}, ${tokens.accentSoft})`
      : tokens.accent,
  } as CSSProperties;

  return (
    <div
      className={`theme-mock ${large ? 'is-large' : ''} ${theme.mono ? 'is-mono' : ''}`}
      style={style}
      aria-hidden="true"
    >
      <div className="theme-mock-rail">
        <span className="theme-mock-mark" />
        <span className="theme-mock-nav is-active" />
        <span className="theme-mock-nav" />
        <span className="theme-mock-nav" />
        <span className="theme-mock-nav is-short" />
      </div>
      <div className="theme-mock-main">
        <div className="theme-mock-bar">
          <span className="theme-mock-title" />
          <span className="theme-mock-pill" />
          <span className="theme-mock-dot" />
        </div>
        <div className="theme-mock-body">
          <div className="theme-mock-copy">
            <span className="theme-mock-heading" />
            <span className="theme-mock-line" />
            <span className="theme-mock-line is-short" />
            <span className="theme-mock-actions">
              <span className="theme-mock-btn is-primary" />
              <span className="theme-mock-btn" />
            </span>
          </div>
          <div className="theme-mock-cards">
            <span className="theme-mock-card">
              <span className="theme-mock-chip" />
              <span className="theme-mock-line" />
              <span className="theme-mock-line is-tiny" />
            </span>
            <span className="theme-mock-card">
              <span className="theme-mock-chip is-soft" />
              <span className="theme-mock-line" />
              <span className="theme-mock-line is-tiny" />
            </span>
          </div>
        </div>
        <div className="theme-mock-status">
          <span className="theme-mock-line is-tiny" />
          <span className="theme-mock-line is-tiny" />
        </div>
      </div>
    </div>
  );
}

interface ThemeGalleryProps {
  themeId: string;
  onPick: (id: string, name: string) => void;
  /** First-run sheet fills the window; the Settings section stays inline. */
  variant?: 'inline' | 'overlay';
  onClose?: () => void;
}

/**
 * Theme gallery: one mock workspace per family, then the themes inside the
 * chosen family. The periodic table picker stays where it was; this is the
 * preview-driven route to the same choice.
 */
export function ThemeGallery({ themeId, onPick, variant = 'inline', onClose }: ThemeGalleryProps) {
  const t = useT();
  const groups = useMemo(() => galleryGroups(THEMES), []);
  const [family, setFamily] = useState<ThemeFamily>(() => galleryFamilyFor(THEMES, themeId));
  const [previewId, setPreviewId] = useState(themeId);

  useEffect(() => {
    setPreviewId(themeId);
  }, [themeId]);

  useEffect(() => {
    if (variant !== 'overlay' || !onClose) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [variant, onClose]);

  const activeFamily = groups.find(item => item.themes.some(theme => theme.id === themeId));
  const group = groups.find(item => item.family === family) ?? groups[0];
  // The catalogue always has themes; this only keeps the component total.
  if (!group) return null;
  const preview = group.themes.find(theme => theme.id === previewId) ?? group.hero;

  function chooseFamily(next: ThemeFamily) {
    setFamily(next);
    const hero = groups.find(item => item.family === next)?.hero;
    if (hero) setPreviewId(hero.id);
  }

  function choose(theme: Theme) {
    setPreviewId(theme.id);
    onPick(theme.id, t(theme.name));
  }

  const body = (
    <div className={`theme-gallery ${variant === 'overlay' ? 'is-overlay' : ''}`}>
      <div className="theme-gallery-preview">
        <ThemePreview theme={preview} large />
        <div className="theme-gallery-preview-meta">
          <div>
            <strong>{t(preview.name)}</strong>
            <span className="mono theme-gallery-family">
              {t(FAMILY_LABELS[preview.family ?? 'core'])} ·{' '}
              {t(preview.mode === 'dark' ? 'DARK' : 'LIGHT')}
            </span>
          </div>
          <button
            className="btn primary small"
            data-shot="gallery-apply"
            onClick={() => choose(preview)}
            aria-pressed={themeId === preview.id}
          >
            <Icon name="check" size={13} />
            {themeId === preview.id ? t('Applied') : t('Use this theme')}
          </button>
        </div>
        <div className="theme-gallery-swatches" role="group" aria-label={t('Themes in this family')}>
          {group.themes.map(theme => (
            <button
              key={theme.id}
              className={`theme-gallery-swatch ${
                preview.id === theme.id ? 'is-preview' : ''
              } ${themeId === theme.id ? 'is-active' : ''}`}
              style={
                {
                  '--swatch-bg': theme.tokens.bg,
                  '--swatch-surface': theme.tokens.surface,
                  '--swatch-accent': theme.tokens.accent,
                  '--swatch-soft': theme.tokens.accentSoft,
                } as CSSProperties
              }
              onClick={() => choose(theme)}
              aria-pressed={themeId === theme.id}
              title={t(theme.name)}
            >
              {t(theme.name)}
            </button>
          ))}
        </div>
      </div>

      <div className="theme-gallery-families">
        <p className="theme-gallery-hint">
          {t('Pick a family to preview it on a mock workspace, then the theme you want.')}
        </p>
        {groups.map(item => (
          <button
            key={item.family}
            className={`theme-gallery-family-card ${
              family === item.family ? 'is-selected' : ''
            } ${activeFamily?.family === item.family ? 'is-active' : ''}`}
            onClick={() => chooseFamily(item.family)}
            onDoubleClick={() => choose(item.hero)}
            aria-pressed={family === item.family}
          >
            <ThemePreview theme={item.hero} />
            <span className="theme-gallery-family-row">
              <span className="mono">{t(FAMILY_LABELS[item.family])}</span>
              <span className="mono theme-gallery-count">
                {item.themes.length} {t('THEMES')}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  if (variant !== 'overlay') return body;

  return (
    <div className="theme-gallery-layer" role="presentation">
      <div
        className="theme-gallery-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-gallery-title"
      >
        <header className="theme-gallery-head">
          <div>
            <p className="eyebrow mono">{t('FIRST LOOK / THEMES')}</p>
            <h2 id="theme-gallery-title">{t('Choose your look')}</h2>
            <p className="theme-gallery-lede">
              {t(
                'Every family, previewed on a mock workspace. Pick one now and change it any time in Settings, where the periodic table keeps every theme.',
              )}
            </p>
          </div>
          <button
            className="icon-btn"
            aria-label={t('Close')}
            onClick={() => onClose?.()}
          >
            <Icon name="close" size={16} />
          </button>
        </header>
        {body}
        <footer className="theme-gallery-foot">
          <span className="mono">
            {themeId === preview.id
              ? t('Current theme')
              : t('Previewing {name}', { name: t(preview.name) })}
          </span>
          <button className="btn ghost" data-shot="gallery-skip" onClick={() => onClose?.()}>
            {t('Keep the current theme')}
          </button>
        </footer>
      </div>
    </div>
  );
}
