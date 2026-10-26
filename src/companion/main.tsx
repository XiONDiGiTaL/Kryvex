import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './companion.css';
import {
  clearToken,
  downloadUrl,
  fetchState,
  hello,
  pair,
  readName,
  readToken,
  sendCommand,
  sendText,
  sendToDesktop,
  subscribe,
  unpair,
  upload,
  writeName,
  type CompanionFile,
  type CompanionState,
} from './api';
import { companionLanguage, makeCompanionStrings, type CompanionKey } from './strings';

/**
 * Kyvex Link on the phone.
 *
 * The page is served by the desktop over the local network, so it knows its own
 * address and needs no configuration: the only thing the user does is type the
 * six-digit code Kryvex is showing. After that the code is not needed again —
 * the token stays in this browser until it is unpaired here or revoked there.
 */

type Msg = (key: CompanionKey) => string;
type Tab = 'clipboard' | 'files' | 'send' | 'remote' | 'phone';
type Health = 'checking' | 'paired' | 'unpaired' | 'offline';

/**
 * x534 continues the Kx element series the built-in services use. The caption
 * is built here rather than written as page text: it is a brand mark, identical
 * in every language, exactly like the desktop tile it mirrors.
 */
function ElementTile() {
  const caption = '[ Link ]';
  return (
    <span className="mark" role="img" aria-label="Kyvex Link · element x534 · Lk">
      <span className="mark-top">
        <span className="mono">x534</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="2.5" y="5" width="11" height="8.5" rx="1.6" />
          <rect x="15.5" y="10.5" width="6" height="8.5" rx="1.6" />
          <path d="M13.5 9.2l2 .1" />
        </svg>
      </span>
      <span className="mark-symbol mono">Lk</span>
      <span className="mark-name mono">{caption}</span>
    </span>
  );
}

function bytes(value: number): string {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? size : Math.round(size * 10) / 10} ${units[unit]}`;
}

function fileKey(file: CompanionFile): string {
  return `${file.id}-${file.at}`;
}

function PairingScreen({ msg, onPaired }: { msg: Msg; onPaired: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState(() => {
    const guess = /android/i.test(navigator.userAgent)
      ? 'Android phone'
      : /iphone|ipad|ios/i.test(navigator.userAgent)
        ? 'iPhone'
        : 'Phone';
    return readName(guess);
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const result = await pair(code.replace(/\D/g, ''), name.trim() || 'Phone');
    setBusy(false);
    if (result.ok) {
      onPaired();
      return;
    }
    setError(
      result.error === 'too-many'
        ? msg('pairMany')
        : result.error === 'offline'
          ? msg('pairOffline')
          : msg('pairWrong'),
    );
  };

  return (
    <form className="card pair" onSubmit={submit}>
      <h1>{msg('pair')}</h1>
      <p className="hint">{msg('pairHint')}</p>
      <label>
        <span>{msg('pairingCode')}</span>
        <input
          className="code mono"
          value={code}
          onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="000000"
          aria-label={msg('pairingCode')}
          autoFocus
        />
      </label>
      <label>
        <span>{msg('phoneName')}</span>
        <input value={name} onChange={event => setName(event.target.value)} maxLength={40} />
      </label>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="btn primary" type="submit" disabled={busy || code.length !== 6}>
        {busy ? msg('sending') : msg('pairButton')}
      </button>
    </form>
  );
}

function ClipboardTab({ msg, text, onSend }: { msg: Msg; text: string; onSend: (value: string) => void }) {
  const [draft, setDraft] = useState('');
  const [done, setDone] = useState(false);
  return (
    <div className="card">
      <div className="section-head">
        <h2>{msg('clipboard')}</h2>
      </div>
      <div className="clipboard" aria-live="polite">
        {text ? <pre>{text}</pre> : <p className="hint">{msg('clipboardEmpty')}</p>}
      </div>
      {text ? (
        <button
          className="btn"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => {
              setDone(true);
              window.setTimeout(() => setDone(false), 1500);
            });
          }}
        >
          {done ? msg('copied') : msg('copy')}
        </button>
      ) : null}
      <label>
        <span>{msg('sendToDesktop')}</span>
        <textarea
          value={draft}
          onChange={event => setDraft(event.target.value)}
          rows={3}
          placeholder={msg('clipboardPlaceholder')}
          aria-label={msg('clipboardPlaceholder')}
        />
      </label>
      <button
        className="btn primary"
        disabled={!draft.trim()}
        onClick={() => {
          const value = draft.trim();
          if (!value) return;
          onSend(value);
          setDraft('');
        }}
      >
        {msg('sendToDesktop')}
      </button>
    </div>
  );
}

function FilesTab({
  msg,
  state,
  onUpload,
}: {
  msg: Msg;
  state: CompanionState;
  onUpload: (files: FileList) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="card">
        <div className="section-head">
          <h2>{msg('files')}</h2>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          className="sr-only"
          onChange={event => {
            if (event.target.files?.length) onUpload(event.target.files);
            if (input.current) input.current.value = '';
          }}
        />
        <button className="btn primary" onClick={() => input.current?.click()}>
          {msg('chooseFiles')}
        </button>
        <p className="hint">{msg('where')}</p>
      </div>
      <div className="card">
        <div className="section-head">
          <h2>{msg('fromDesktop')}</h2>
          <span className="mono count">{state.files.offered.length}</span>
        </div>
        {state.files.offered.length === 0 ? (
          <p className="hint">{msg('nothingYet')}</p>
        ) : (
          <ul className="list">
            {state.files.offered.map(file => (
              <li key={fileKey(file)}>
                <span className="name" title={file.name}>
                  {file.name}
                </span>
                <span className="mono size">{bytes(file.size)}</span>
                <a className="btn small" href={downloadUrl(file.id)} download={file.name}>
                  {msg('download')}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card">
        <div className="section-head">
          <h2>{msg('sentToDesktop')}</h2>
          <span className="mono count">{state.files.received.length}</span>
        </div>
        {state.files.received.length === 0 ? (
          <p className="hint">{msg('nothingYet')}</p>
        ) : (
          <ul className="list">
            {state.files.received.map(file => (
              <li key={fileKey(file)}>
                <span className="name" title={file.name}>
                  {file.name}
                </span>
                <span className="mono size">{bytes(file.size)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function SendTab({ msg, onSendUrl }: { msg: Msg; onSendUrl: (value: string) => void }) {
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  return (
    <div className="card">
      <div className="section-head">
        <h2>{msg('send')}</h2>
      </div>
      <label>
        <span>{msg('openOnDesktop')}</span>
        <textarea
          value={value}
          onChange={event => setValue(event.target.value)}
          rows={4}
          placeholder={msg('linkPlaceholder')}
          aria-label={msg('linkPlaceholder')}
        />
      </label>
      <div className="row">
        <button
          className="btn primary"
          disabled={!trimmed}
          onClick={() => {
            if (trimmed) onSendUrl(trimmed);
            setValue('');
          }}
        >
          {msg('openOnDesktop')}
        </button>
      </div>
    </div>
  );
}

function RemoteTab({
  msg,
  state,
  onCommand,
}: {
  msg: Msg;
  state: CompanionState;
  onCommand: (command: Parameters<typeof sendCommand>[0]) => void;
}) {
  const remote = state.remote;
  return (
    <>
      <div className="card">
        <div className="section-head">
          <h2>{msg('remote')}</h2>
        </div>
        <div className="now mono">
          {remote.title ? (
            <>
              <strong>{remote.title}</strong>
              {remote.artist ? <span>{remote.artist}</span> : null}
            </>
          ) : (
            <span className="hint">{msg('nothingYet')}</span>
          )}
        </div>
        <div className="transport">
          <button className="btn" onClick={() => onCommand('previous')} aria-label={msg('previous')} title={msg('previous')}>
            ⏮
          </button>
          <button
            className="btn primary big"
            onClick={() => onCommand(remote.playing ? 'pause' : 'play')}
            aria-label={remote.playing ? msg('pause') : msg('play')}
            title={remote.playing ? msg('pause') : msg('play')}
          >
            {remote.playing ? '⏸' : '▶'}
          </button>
          <button className="btn" onClick={() => onCommand('next')} aria-label={msg('next')} title={msg('next')}>
            ⏭
          </button>
        </div>
        <div className="volume">
          <button className="btn" onClick={() => onCommand('volume-down')} aria-label={msg('volumeDown')} title={msg('volumeDown')}>
            −
          </button>
          <span className="mono">{Math.round((remote.muted ? 0 : remote.volume) * 100)}%</span>
          <button className="btn" onClick={() => onCommand('volume-up')} aria-label={msg('volumeUp')} title={msg('volumeUp')}>
            +
          </button>
          <button className="btn" onClick={() => onCommand('mute')} aria-label={remote.muted ? msg('unmute') : msg('mute')}>
            {remote.muted ? msg('unmute') : msg('mute')}
          </button>
        </div>
      </div>
      <div className="card">
        <div className="row wrap">
          <button className="btn" onClick={() => onCommand('focus')}>
            {msg('bringFront')}
          </button>
          <button className="btn" onClick={() => onCommand('rooms')}>
            {msg('openRooms')}
          </button>
          <button className="btn" onClick={() => onCommand('home')}>
            {msg('goHome')}
          </button>
        </div>
      </div>
    </>
  );
}

function PhoneTab({
  msg,
  state,
  live,
  notifications,
  onEnableNotifications,
  onUnpair,
}: {
  msg: Msg;
  state: CompanionState | null;
  live: boolean;
  notifications: string;
  onEnableNotifications: () => void;
  onUnpair: () => void;
}) {
  const [name, setName] = useState(() => readName('Phone'));
  return (
    <>
      <div className="card">
        <div className="section-head">
          <h2>{msg('thisPhone')}</h2>
          <span className={`pill ${live ? 'on' : ''}`}>{live ? msg('live') : msg('offline')}</span>
        </div>
        <label>
          <span>{msg('phoneName')}</span>
          <input
            value={name}
            maxLength={40}
            onChange={event => {
              setName(event.target.value);
              writeName(event.target.value);
            }}
          />
        </label>
        <p className="hint">{msg('install')}</p>
        <p className="hint">{msg('where')}</p>
        <p className="row wrap">
          <button className="btn" onClick={onEnableNotifications}>
            {msg('enableNotifications')}
          </button>
          {notifications ? <span className="hint">{notifications}</span> : null}
        </p>
        <p className="hint">{msg('notifyHint')}</p>
      </div>
      <div className="card">
        <div className="section-head">
          <h2>{msg('paired')}</h2>
          <span className="mono count">{state?.devices.length ?? 0}</span>
        </div>
        <ul className="list">
          {(state?.devices ?? []).map(device => (
            <li key={`${device.label}-${device.pairedAt}`}>
              <span className="name">{device.label}</span>
              <span className="mono size">{device.address}</span>
            </li>
          ))}
        </ul>
        <button className="btn danger" onClick={onUnpair}>
          {msg('unpair')}
        </button>
      </div>
    </>
  );
}

export function Companion() {
  const msg = useMemo<Msg>(() => makeCompanionStrings(companionLanguage()), []);
  const [health, setHealth] = useState<Health>(readToken() ? 'checking' : 'unpaired');
  const [state, setState] = useState<CompanionState | null>(null);
  const [live, setLive] = useState(false);
  const [tab, setTab] = useState<Tab>('clipboard');
  const [toast, setToast] = useState('');
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [notifications, setNotifications] = useState('');

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(current => (current === message ? '' : current)), 2600);
  }, []);

  const notifyPhone = useCallback((title: string, body: string) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      new Notification(title || 'Kyvex Link', { body });
    } catch {
      /* a page without notification support keeps the in-page banner */
    }
  }, []);

  const connect = useCallback(async () => {
    const token = readToken();
    const status = await hello(token);
    if (!status.reachable) {
      setHealth('offline');
      return;
    }
    if (!token || !status.paired) {
      clearToken();
      setHealth('unpaired');
      return;
    }
    setHealth('paired');
    setState(await fetchState());
  }, []);

  useEffect(() => {
    void connect();
    const timer = window.setInterval(() => void connect(), 15_000);
    return () => window.clearInterval(timer);
  }, [connect]);

  // The live channel is only opened once the desktop says this phone is paired.
  useEffect(() => {
    if (health !== 'paired') return undefined;
    return subscribe(
      {
        hello: payload => setState(payload.state),
        clipboard: payload =>
          setState(current => (current ? { ...current, clipboard: payload.text } : current)),
        files: payload => setState(payload.state),
        devices: payload =>
          setState(current => (current ? { ...current, devices: payload.devices } : current)),
        remote: payload => setState(payload.state),
        notice: payload => {
          flash(payload.title ? `${payload.title}: ${payload.body}` : payload.body);
          notifyPhone(payload.title, payload.body);
        },
      },
      setLive,
    );
  }, [health, flash, notifyPhone]);

  const onUpload = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) {
        setProgress({ sent: 0, total: file.size });
        const ok = await upload(file.name, file, (sent, total) => setProgress({ sent, total }));
        setProgress(null);
        flash(ok ? `${file.name} → ${msg('sent')}` : `${file.name}: ${msg('pairWrong')}`);
      }
      setState(await fetchState());
    },
    [flash, msg],
  );

  if (health === 'offline') {
    return (
      <main className="shell">
        <header className="brand">
          <ElementTile />
          <span className="mono">Kyvex Link</span>
        </header>
        <div className="card">
          <p className="error" role="alert">{msg('pairOffline')}</p>
          <button className="btn" onClick={() => void connect()}>
            {msg('reconnecting')}
          </button>
        </div>
      </main>
    );
  }

  if (health !== 'paired' || !state) {
    return (
      <main className="shell">
        <header className="brand">
          <ElementTile />
          <span className="mono">Kyvex Link</span>
        </header>
        <PairingScreen msg={msg} onPaired={() => void connect()} />
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="brand">
        <ElementTile />
        <span className="mono">Kyvex Link</span>
        <span className={`pill ${live ? 'on' : ''}`}>{live ? msg('live') : msg('offline')}</span>
      </header>

      {progress ? (
        <div className="progress" role="status">
          <span className="mono">
            {msg('sending')} {bytes(progress.sent)} / {bytes(progress.total)}
          </span>
          <span
            className="bar"
            style={{ width: `${progress.total ? Math.round((progress.sent / progress.total) * 100) : 0}%` }}
          />
        </div>
      ) : null}

      {tab === 'clipboard' ? (
        <ClipboardTab
          msg={msg}
          text={state.clipboard}
          onSend={value => {
            void sendText(value).then(ok => flash(ok ? msg('sent') : msg('pairWrong')));
          }}
        />
      ) : null}
      {tab === 'files' ? <FilesTab msg={msg} state={state} onUpload={onUpload} /> : null}
      {tab === 'send' ? (
        <SendTab
          msg={msg}
          onSendUrl={value => {
            void sendToDesktop(value).then(ok => flash(ok ? msg('sent') : msg('pairWrong')));
          }}
        />
      ) : null}
      {tab === 'remote' ? (
        <RemoteTab
          msg={msg}
          state={state}
          onCommand={command => {
            void sendCommand(command).then(ok => {
              if (!ok) flash(msg('pairWrong'));
            });
          }}
        />
      ) : null}
      {tab === 'phone' ? (
        <PhoneTab
          msg={msg}
          state={state}
          live={live}
          notifications={notifications}
          onEnableNotifications={() => {
            if (typeof Notification === 'undefined') {
              setNotifications(msg('notifyHint'));
              return;
            }
            void Notification.requestPermission().then(permission => {
              setNotifications(permission === 'granted' ? msg('notificationsOn') : msg('notifyHint'));
            });
          }}
          onUnpair={() => {
            void unpair().then(() => {
              flash(msg('unpairedNow'));
              setHealth('unpaired');
              setState(null);
            });
          }}
        />
      ) : null}

      {toast ? <div className="toast" role="status">{toast}</div> : null}

      <nav className="tabs" aria-label="Kyvex Link">
        {(
          [
            ['clipboard', msg('clipboard')],
            ['files', msg('files')],
            ['send', msg('send')],
            ['remote', msg('remote')],
            ['phone', msg('thisPhone')],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            className={`tab ${tab === id ? 'is-active' : ''}`}
            aria-current={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
    </main>
  );
}

const host = document.getElementById('companion');
if (host) createRoot(host).render(<Companion />);
