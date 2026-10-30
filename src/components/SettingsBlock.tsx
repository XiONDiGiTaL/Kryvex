import { useEffect, useId, useState, type ReactNode, type Ref } from 'react';
import { Icon } from './ui';

type SettingsIcon =
  | 'home'
  | 'layers'
  | 'shield'
  | 'globe'
  | 'sliders'
  | 'spark'
  | 'users'
  | 'monitor'
  | 'volume'
  | 'script'
  | 'lock';

/**
 * A settings section that folds away by default.
 *
 * The body stays mounted while collapsed: capture harnesses, anchors and the
 * focus effects all query the real controls, so a closed section must still
 * exist in the DOM. `forceOpen` lets a deep link (Updates, Vexium) reveal the
 * right section without turning every block into a controlled component.
 */
export function SettingsBlock({
  id,
  title,
  meta,
  icon,
  className = '',
  variant = 'block',
  defaultOpen = false,
  forceOpen = false,
  children,
  sectionRef,
}: {
  id?: string;
  title: ReactNode;
  meta?: ReactNode;
  icon?: SettingsIcon;
  className?: string;
  /** `sub` is a lighter, nested fold inside a top-level block. */
  variant?: 'block' | 'sub';
  defaultOpen?: boolean;
  forceOpen?: boolean;
  children: ReactNode;
  sectionRef?: Ref<HTMLElement>;
}) {
  const [open, setOpen] = useState(defaultOpen || forceOpen);
  const generated = useId();
  const bodyId = `${id ?? generated}-body`;

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <section
      id={id}
      ref={sectionRef}
      className={`settings-block ${variant === 'sub' ? 'settings-subblock' : ''} ${className} ${
        open ? 'is-open' : 'is-collapsed'
      }`}
      data-open={open}
    >
      <div className="settings-block-head">
        <button
          type="button"
          className="settings-block-toggle"
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          aria-controls={bodyId}
        >
          {icon ? <Icon name={icon} size={16} /> : null}
          <span className="settings-block-title">{title}</span>
          {meta ? <span className="mono settings-block-meta">{meta}</span> : null}
          <span className={`settings-block-chevron ${open ? 'is-open' : ''}`} aria-hidden="true">
            <Icon name="chevron" size={15} />
          </span>
        </button>
      </div>
      <div className="settings-block-body" id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
