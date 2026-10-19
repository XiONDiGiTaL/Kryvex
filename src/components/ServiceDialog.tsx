import { useMemo, useState } from 'react';
import type { Service, ServiceCategory } from '../types';
import { CATEGORIES, SERVICE_COLORS, letterFor, validateServiceInput } from '../lib/services';
import { Modal, ServiceGlyph } from './ui';

export function ServiceDialog({
  initial,
  onSave,
  onClose,
}: {
  initial?: Service;
  onSave: (service: Service) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [category, setCategory] = useState<ServiceCategory>(initial?.category ?? 'communication');
  const [color, setColor] = useState(initial?.color ?? SERVICE_COLORS[0]);
  const [pinned, setPinned] = useState(initial?.pinned ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const previewLetter = useMemo(() => letterFor(name || initial?.name || 'K'), [name, initial?.name]);
  const isEditing = Boolean(initial);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = validateServiceInput({ name, url, category, color, pinned });
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

  return (
    <Modal
      title={isEditing ? 'Edit service' : 'Add a service'}
      subtitle={
        isEditing
          ? 'Update the module manifest for this service.'
          : 'Any web app with a URL becomes a module with its own isolated session.'
      }
      onClose={onClose}
      footer={
        <>
          <span className="modal-hint mono">SESSIONS ARE ISOLATED</span>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" form="service-form" className="btn primary">
              {isEditing ? 'Save changes' : 'Add service'}
            </button>
          </div>
        </>
      }
    >
      <form id="service-form" className="service-form" onSubmit={submit} noValidate>
        <div className="service-preview">
          <ServiceGlyph letter={previewLetter} color={color} size={46} />
          <div>
            <strong>{name.trim() || 'New service'}</strong>
            <span className="mono">{url.trim() || 'https://example.com'}</span>
          </div>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Name</span>
            <input
              autoFocus
              value={name}
              maxLength={48}
              onChange={event => setName(event.target.value)}
              placeholder="Linear"
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? <small className="field-error">{errors.name}</small> : null}
          </label>

          <label className="field">
            <span>Category</span>
            <select value={category} onChange={event => setCategory(event.target.value as ServiceCategory)}>
              {CATEGORIES.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>URL</span>
          <input
            value={url}
            maxLength={2048}
            onChange={event => setUrl(event.target.value)}
            placeholder="linear.app"
            spellCheck={false}
            aria-invalid={Boolean(errors.url)}
          />
          {errors.url ? (
            <small className="field-error">{errors.url}</small>
          ) : (
            <small className="field-hint">https:// is added automatically. Only http(s) is allowed.</small>
          )}
        </label>

        <div className="field">
          <span>Color</span>
          <div className="swatch-row" role="radiogroup" aria-label="Service color">
            {SERVICE_COLORS.map(value => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={color === value}
                aria-label={`Color ${value}`}
                className={`swatch ${color === value ? 'is-selected' : ''}`}
                style={{ '--swatch': value } as React.CSSProperties}
                onClick={() => setColor(value)}
              />
            ))}
          </div>
        </div>

        <label className="checkbox-row">
          <input type="checkbox" checked={pinned} onChange={event => setPinned(event.target.checked)} />
          <span>Pin to the sidebar</span>
        </label>

        <p className="permission-note">
          <strong>Permissions:</strong> cookies, storage and sign-in stay inside this service&apos;s own
          persistent session. Kryvex never reads page content.
        </p>
      </form>
    </Modal>
  );
}
