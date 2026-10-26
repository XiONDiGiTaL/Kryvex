import { useMemo, useState } from 'react';
import type { Service, ServiceCategory } from '../types';
import {
  CATEGORIES,
  SERVICE_COLORS,
  letterFor,
  resolveServicePlacement,
  validateServiceInput,
} from '../lib/services';
import { useT } from '../lib/i18n';
import { SERVICE_PRESETS } from '../lib/catalog';
import { Modal, ServiceIcon } from './ui';

export function ServiceDialog({
  initial,
  installed = [],
  onPlace,
  onSave,
  onClose,
}: {
  initial?: Service;
  /** The services this profile already has, offered first when placing on the canvas. */
  installed?: readonly Service[];
  /** Opens an installed service in a window instead of adding a record. */
  onPlace?: (service: Service) => void;
  onSave: (service: Service) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [category, setCategory] = useState<ServiceCategory>(initial?.category ?? 'communication');
  const [color, setColor] = useState(initial?.color ?? SERVICE_COLORS[0]);
  const [pinned, setPinned] = useState(initial?.pinned ?? true);
  const [icon, setIcon] = useState<string | undefined>(initial?.icon);
  const [muted, setMuted] = useState(initial?.muted === true);
  const [multipleInstances, setMultipleInstances] = useState(
    initial?.multipleInstances === true,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const previewLetter = useMemo(() => letterFor(name || initial?.name || 'K'), [name, initial?.name]);
  const isEditing = Boolean(initial);
  // The same rule the shell saves by, so the note below the form cannot promise
  // something different from what pressing the button does.
  const placement = useMemo(
    () =>
      isEditing
        ? ({ action: 'add' } as const)
        : resolveServicePlacement(installed, { url, multipleInstances }),
    [installed, isEditing, multipleInstances, url],
  );
  const preview = {
    url: url.trim() || 'https://example.com',
    icon: icon as Service['icon'],
    letter: previewLetter,
    color,
  };

  function applyPreset(preset: (typeof SERVICE_PRESETS)[number]) {
    setName(preset.name);
    setUrl(preset.url);
    setCategory(preset.category);
    setColor(preset.color);
    setIcon(preset.icon);
    setPinned(true);
    setMuted(preset.muted === true);
    setMultipleInstances(false);
    setErrors({});
  }

  function changeUrl(next: string) {
    setUrl(next);
    // A brand mark only stays honest while the URL still points at that brand.
    if (icon) {
      const preset = SERVICE_PRESETS.find(item => item.icon === icon);
      const matches = preset && next.trim().toLowerCase().includes(new URL(preset.url).host);
      if (!matches) setIcon(undefined);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = validateServiceInput({
      name,
      url,
      category,
      color,
      pinned,
      icon,
      muted,
      multipleInstances,
    });
    if (!result.ok || !result.service) {
      setErrors(result.errors);
      return;
    }
    onSave(
      initial
        ? { ...result.service, id: initial.id, createdAt: initial.createdAt, lastOpened: initial.lastOpened }
        : result.service,
    );
  }

  /** An installed service placed straight onto the canvas, with no new record. */
  function place(service: Service) {
    onPlace?.(service);
    onClose();
  }

  const canPlace = !isEditing && installed.length > 0 && Boolean(onPlace);

  return (
    <Modal
      title={isEditing ? t('Edit service') : t('Add a service')}
      subtitle={
        isEditing
          ? t('Update the module manifest for this service.')
          : t('Pick a preset or point Kryvex at any web app. Each one gets its own isolated session.')
      }
      width={640}
      onClose={onClose}
      footer={
        <>
          <span className="modal-hint mono">{t('SESSIONS ARE ISOLATED')}</span>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              {t('Cancel')}
            </button>
            <button type="submit" form="service-form" className="btn primary">
              {isEditing ? t('Save changes') : t('Add service')}
            </button>
          </div>
        </>
      }
    >
      <form id="service-form" className="service-form" onSubmit={submit} noValidate>
        <div className="service-preview">
          <ServiceIcon service={preview} size={46} />
          <div>
            <strong>{name.trim() || t('New service')}</strong>
            <span className="mono">{url.trim() || 'https://example.com'}</span>
          </div>
        </div>

        {/* Placing a window on the canvas usually means framing something that is
            already installed, so those come first and add no record at all. */}
        {canPlace ? (
          <div className="preset-block">
            <div className="preset-head">
              <span className="mono">{t('INSTALLED SERVICES')}</span>
              <span className="mono preset-credit">
                {t('{count} READY', { count: installed.length })}
              </span>
            </div>
            <div className="preset-grid">
              {installed.map(service => (
                <button
                  key={service.id}
                  type="button"
                  className="preset-chip"
                  onClick={() => place(service)}
                  title={service.url}
                  aria-label={t('Open {name}', { name: service.name })}
                >
                  <ServiceIcon service={service} size={26} />
                  <span>{service.name}</span>
                </button>
              ))}
            </div>
            <p className="preset-note">
              {t('Open one of these in a window, or add something new below.')}
            </p>
          </div>
        ) : null}

        {!isEditing ? (
          <div className="preset-block">
            <div className="preset-head">
              <span className="mono">{t('START FROM A PRESET')}</span>
              <span className="mono preset-credit">{t('ICONS: SIMPLE ICONS · CC0')}</span>
            </div>
            <div className="preset-grid">
              {SERVICE_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  className={`preset-chip ${icon === preset.icon ? 'is-selected' : ''}`}
                  onClick={() => applyPreset(preset)}
                  title={preset.note}
                >
                  <ServiceIcon
                    service={{
                      url: preset.url,
                      icon: preset.icon,
                      letter: letterFor(preset.name),
                      color: preset.color,
                    }}
                    size={26}
                  />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
            <p className="preset-note">
              {t(
                'Presets are links to the public web clients. Brand marks identify the linked service; trademarks belong to their owners. Sites can still block embedded sign-in or require the system browser.',
              )}
            </p>
          </div>
        ) : null}

        <div className="field-row">
          <label className="field">
            <span>{t('Name')}</span>
            <input
              autoFocus
              value={name}
              maxLength={48}
              onChange={event => setName(event.target.value)}
              placeholder="Linear"
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? <small className="field-error">{t(errors.name)}</small> : null}
          </label>

          <label className="field">
            <span>{t('Category')}</span>
            <select value={category} onChange={event => setCategory(event.target.value as ServiceCategory)}>
              {CATEGORIES.map(item => (
                <option key={item.id} value={item.id}>
                  {t(item.label)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>{t('URL')}</span>
          <input
            value={url}
            maxLength={2048}
            onChange={event => changeUrl(event.target.value)}
            placeholder="linear.app"
            spellCheck={false}
            aria-invalid={Boolean(errors.url)}
          />
          {errors.url ? (
            <small className="field-error">{t(errors.url)}</small>
          ) : (
            <small className="field-hint">
              {t('https:// is added automatically. Only http(s) is allowed.')}
            </small>
          )}
        </label>

        <div className="field">
          <span>{t('Color')}</span>
          <div className="swatch-row" role="radiogroup" aria-label={t('Service color')}>
            {SERVICE_COLORS.map(value => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={color === value}
                aria-label={t('Color {value}', { value })}
                className={`swatch ${color === value ? 'is-selected' : ''}`}
                style={{ '--swatch': value } as React.CSSProperties}
                onClick={() => setColor(value)}
              />
            ))}
          </div>
        </div>

        <label className="checkbox-row">
          <input type="checkbox" checked={pinned} onChange={event => setPinned(event.target.checked)} />
          <span>{t('Pin to the sidebar')}</span>
        </label>

        <label className="checkbox-row">
          <input type="checkbox" checked={muted} onChange={event => setMuted(event.target.checked)} />
          <span>{t('Start muted (no autoplay sound)')}</span>
        </label>

        {placement.action === 'reuse' ? (
          <p className="preset-note service-clash">
            {t('{name} is already installed. Saving opens the one you have instead of adding a second.', {
              name: placement.service.name,
            })}
          </p>
        ) : null}

        <label className="checkbox-row">
          <input
            type="checkbox"
            name="multipleInstances"
            checked={multipleInstances}
            onChange={event => setMultipleInstances(event.target.checked)}
          />
          <span>{t('Allow more than one instance of this site')}</span>
        </label>
        <p className="preset-note">
          {t(
            'A second instance keeps its own session, so two copies can be signed in to different accounts.',
          )}
        </p>

        <p className="permission-note">
          <strong>{t('Permissions')}:</strong>{' '}
          {t(
            "cookies, storage and sign-in stay inside this service's own persistent session. Kryvex never reads page content. Unknown services get their own favicon, requested directly from the site, falling back to the letter tile.",
          )}
        </p>
      </form>
    </Modal>
  );
}
