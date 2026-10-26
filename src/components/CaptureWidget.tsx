import { useState, type FormEvent } from 'react';
import type { CaptureKind, HomeSettings } from '../types';
import { useT } from '../lib/i18n';
import { makeId } from '../lib/services';
import { openExternalUrl } from '../lib/external';
import {
  CAPTURE_KINDS,
  MAX_CAPTURES,
  MAX_CAPTURE_TEXT,
  kindFor,
  prependCapture,
  removeCapture,
} from '../lib/capture';
import { Icon } from './ui';

const KIND_LABEL: Record<CaptureKind, string> = {
  task: 'Task',
  link: 'Link',
  idea: 'Idea',
};

/**
 * Quick capture: one field, Enter, done.
 *
 * The point is to not interrupt what the user is doing, so there is no dialog,
 * no category tree and no required follow-up. A link is recognised from its
 * shape; the chips only exist for when the guess is wrong. Sorting is a later
 * job, which is why the list is a plain queue with a delete on every row.
 */
export function CaptureWidget({
  home,
  onUpdate,
}: {
  home: HomeSettings;
  onUpdate: (patch: Partial<HomeSettings>) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [choice, setChoice] = useState<CaptureKind | null>(null);
  const kind = choice ?? kindFor(draft);
  const full = home.captures.length >= MAX_CAPTURES;

  function capture(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || full) return;
    onUpdate({
      captures: prependCapture(home.captures, {
        id: makeId('cap'),
        text: text.slice(0, MAX_CAPTURE_TEXT),
        kind,
        createdAt: Date.now(),
      }),
    });
    setDraft('');
    setChoice(null);
  }

  return (
    <div className="home-capture">
      <div className="home-card-head">
        <span className="mono">{t('QUICK CAPTURE')}</span>
        <span className="mono">{t('{count} QUEUED', { count: home.captures.length })}</span>
      </div>
      <form className="home-capture-form" onSubmit={capture}>
        <input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder={full ? t('Inbox full. Clear a few first.') : t('A task, a link, an idea…')}
          aria-label={t('Capture something')}
          maxLength={MAX_CAPTURE_TEXT}
          disabled={full}
        />
        <button
          type="submit"
          className="icon-btn"
          disabled={!draft.trim() || full}
          aria-label={t('Capture it')}
          title={t('Capture it')}
        >
          <Icon name="plus" size={14} />
        </button>
      </form>
      <div className="home-capture-kinds" role="group" aria-label={t('Capture kind')}>
        {CAPTURE_KINDS.map(item => (
          <button
            key={item}
            type="button"
            className={`chip-btn ${kind === item ? 'is-active' : ''}`}
            aria-pressed={kind === item}
            onClick={() => setChoice(item)}
          >
            {t(KIND_LABEL[item])}
          </button>
        ))}
      </div>
      {home.captures.length === 0 ? (
        <p className="home-tasks-empty">
          {t('Nothing waiting. Whatever you drop here stays on this machine.')}
        </p>
      ) : (
        <ul className="home-capture-list">
          {home.captures.map(item => (
            <li key={item.id}>
              <span className="mono home-capture-kind">{t(KIND_LABEL[item.kind])}</span>
              {item.kind === 'link' && /^https?:\/\//i.test(item.text) ? (
                <button className="home-capture-text is-link" onClick={() => openExternalUrl(item.text)}>
                  {item.text}
                </button>
              ) : (
                <span className="home-capture-text">{item.text}</span>
              )}
              <button
                className="home-task-remove"
                aria-label={t('Forget “{text}”', { text: item.text })}
                onClick={() => onUpdate({ captures: removeCapture(home.captures, item.id) })}
              >
                <Icon name="close" size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
