import { useRef, useState } from 'react';
import {
  formatTransferEta,
  formatTransferRate,
  formatTransferSize,
  isFinishedTransfer,
  transferErrorText,
  transferPercent,
  type TransferRow,
} from '../lib/transfer-rules';
import { useI18n } from '../lib/i18n';
import { Icon } from './ui';

/**
 * Files in a room.
 *
 * The bytes never pass through a Kryvex service: the sender picks files here,
 * the receiver picks a folder with a native dialog, and the chunks travel over
 * the room's own WebRTC data channels. There is no upload and no size limit,
 * which is the whole point of the panel, so the copy says it plainly.
 */

interface RoomFilesPanelProps {
  transfers: TransferRow[];
  peerCount: number;
  onSend: (files: File[]) => void;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onCancel: (id: string) => void;
  onClear: () => void;
  onReveal: (path: string) => void;
}

function TransferItem({
  row,
  onAccept,
  onDecline,
  onCancel,
  onReveal,
}: {
  row: TransferRow;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onCancel: (id: string) => void;
  onReveal: (path: string) => void;
}) {
  const { t } = useI18n();
  const percent = transferPercent(row.done, row.size);
  const remaining = row.rate > 0 ? (row.size - row.done) / row.rate : 0;
  const eta = row.state === 'active' ? formatTransferEta(remaining) : '';
  const rate = formatTransferRate(row.rate);
  const finished = isFinishedTransfer(row);
  const incoming = row.direction === 'receive';

  return (
    <li className={`room-file is-${row.state}`}>
      <div className="room-file-head">
        <span className="room-file-name" title={row.name}>
          {row.name}
        </span>
        <span className="mono room-file-size">{formatTransferSize(row.size)}</span>
      </div>

      {row.state === 'offered' && incoming ? (
        <p className="room-file-note">
          {t('{name} wants to send {size}.', {
            name: row.name,
            size: formatTransferSize(row.size),
          })}
        </p>
      ) : null}

      {row.state === 'offered' && !incoming ? (
        <p className="room-file-note">{t('Waiting for the other side…')}</p>
      ) : null}

      {row.state === 'active' || row.state === 'waiting' || row.state === 'paused' ? (
        <>
          <div
            className="room-file-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={row.name}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <div className="mono room-file-meta">
            <span>{`${incoming ? t('RECEIVING') : t('SENDING')} ${percent}%`}</span>
            <span>
              {row.state === 'waiting'
                ? t('Waiting for a destination…')
                : row.state === 'paused'
                  ? t('Paused until the other side comes back.')
                  : [eta ? `${eta}` : '', rate].filter(Boolean).join(' · ')}
            </span>
          </div>
        </>
      ) : null}

      {row.state === 'saved' ? (
        <p className="room-file-path">{t('Saved to {path}', { path: row.path ?? '' })}</p>
      ) : null}

      {row.state === 'done' ? <p className="room-file-note">{t('Sent.')}</p> : null}

      {row.state === 'declined' ? (
        <p className="room-file-note is-error">
          {row.error ? t(transferErrorText(row.error)) : t('Declined.')}
        </p>
      ) : null}

      {row.state === 'cancelled' ? (
        <p className="room-file-note is-error">
          {row.error ? t(transferErrorText(row.error)) : t('Cancelled.')}
        </p>
      ) : null}

      {row.state === 'failed' ? (
        <p className="room-file-note is-error">{t(transferErrorText(row.error))}</p>
      ) : null}

      {!finished || row.state === 'saved' ? (
        <div className="room-file-actions">
          {row.state === 'offered' && incoming ? (
            <>
              <button className="btn primary tiny" onClick={() => onAccept(row.id)}>
                {t('Save as…')}
              </button>
              <button className="btn ghost tiny" onClick={() => onDecline(row.id)}>
                {t('Decline')}
              </button>
            </>
          ) : null}
          {!finished ? (
            <button className="btn ghost tiny" onClick={() => onCancel(row.id)}>
              <Icon name="close" size={12} />
              {t('Cancel')}
            </button>
          ) : null}
          {row.state === 'saved' && row.path ? (
            <button className="btn ghost tiny" onClick={() => onReveal(row.path ?? '')}>
              <Icon name="external" size={12} />
              {t('Show in folder')}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function RoomFilesPanel({
  transfers,
  peerCount,
  onSend,
  onAccept,
  onDecline,
  onCancel,
  onClear,
  onReveal,
}: RoomFilesPanelProps) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);

  const take = (files: FileList | null): void => {
    if (!files || files.length === 0) return;
    onSend(Array.from(files));
  };

  const finished = transfers.some(row => isFinishedTransfer(row));

  return (
    <section
      className={`room-files ${over ? 'is-over' : ''}`}
      aria-label={t('File transfer')}
      onDragOver={event => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={event => {
        event.preventDefault();
        setOver(false);
        take(event.dataTransfer.files);
      }}
    >
      <header className="room-files-head">
        <span className="mono">{t('SEND FILES')}</span>
        <div className="room-files-actions">
          {finished ? (
            <button className="link mono room-files-clear" onClick={onClear}>
              {t('Clear finished')}
            </button>
          ) : null}
          <button className="btn ghost small" onClick={() => input.current?.click()}>
            <Icon name="note" size={13} />
            {t('Send files')}
          </button>
        </div>
      </header>

      <p className="room-files-note">
        {peerCount < 2
          ? t('Send the invite first: the files start when the other person is here.')
          : t(
              'Files go straight to the other person over the room. Nothing is uploaded, there is no size limit, and the receiver chooses where it lands.',
            )}
      </p>

      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={event => {
          take(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />

      {transfers.length > 0 ? (
        <ul className="room-files-list">
          {transfers.map(row => (
            <TransferItem
              key={row.id}
              row={row}
              onAccept={onAccept}
              onDecline={onDecline}
              onCancel={onCancel}
              onReveal={onReveal}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
