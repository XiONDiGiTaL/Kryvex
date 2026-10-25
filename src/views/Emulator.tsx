import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { EmulatorSettings, EmulatorSystem } from '../types';
import { useT } from '../lib/i18n';
import { openExternalUrl } from '../lib/external';
import type { LifecycleVerdict } from '../lib/lifecycle';
import {
  ROM_ACCEPT,
  ROM_SYSTEMS,
  coreFor,
  emulatorGameId,
  emulatorGameKey,
  emulatorHostDocument,
  emulatorRequestId,
  identifyRomSystem,
  romValidation,
  systemLabel,
  systemNote,
  systemsForFile,
} from '../lib/emulator';
import {
  MAX_STATES_PER_GAME,
  type EmulatorStateRecord,
  canPickSaveFolder,
  downloadState,
  formatSaveSize,
  getSaveDirectory,
  listStates,
  pickSaveDirectory,
  readBattery,
  readState as readStateRecord,
  saveStamp,
  stateLabel,
  writeBattery,
  writeState,
  writeStateToDirectory,
  deleteState,
  type SaveDirectoryHandle,
} from '../lib/emulator-saves';
import { Icon } from '../components/ui';

interface LoadedRom {
  name: string;
  buffer: ArrayBuffer;
  system: EmulatorSystem;
  gameKey: string;
}

interface BiosFile {
  name: string;
  buffer: ArrayBuffer;
}

interface RomChoice {
  name: string;
  buffer: ArrayBuffer;
  candidates: EmulatorSystem[];
}

interface FrameMessage {
  type?: string;
  message?: string;
  requestId?: string;
  mode?: 'quick' | 'manual';
  state?: Uint8Array;
  thumb?: Blob | null;
  data?: Uint8Array;
}

/** Renders a stored frame without leaking an object URL per render. */
function SaveThumb({ thumb, label }: { thumb: Blob | null; label: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!thumb) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(thumb);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [thumb]);

  if (!url) {
    return (
      <span className="emulator-save-thumb is-empty" aria-hidden="true">
        <Icon name="monitor" size={16} />
      </span>
    );
  }
  return <img className="emulator-save-thumb" src={url} alt={label} loading="lazy" />;
}

export function Emulator({
  settings,
  lifecycle,
  onUpdate,
  onBack,
  onToast,
}: {
  settings: EmulatorSettings;
  /** What the shared service lifecycle wants this screen to do. */
  lifecycle: LifecycleVerdict;
  onUpdate: (patch: Partial<EmulatorSettings>) => void;
  onBack: () => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
}) {
  const t = useT();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const romInput = useRef<HTMLInputElement | null>(null);
  const biosInput = useRef<HTMLInputElement | null>(null);
  const stateInput = useRef<HTMLInputElement | null>(null);
  const [rom, setRom] = useState<LoadedRom | null>(null);
  const [bios, setBios] = useState<BiosFile | null>(null);
  const [hostReady, setHostReady] = useState(false);
  const [hostKey, setHostKey] = useState(0);
  const [running, setRunning] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [romChoice, setRomChoice] = useState<RomChoice | null>(null);
  const [states, setStates] = useState<EmulatorStateRecord[]>([]);
  const [saveFolder, setSaveFolder] = useState<SaveDirectoryHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(new Map<string, string>());
  // A frame captures its thumbnail asynchronously, so it can arrive before the
  // state itself has finished writing. Hold it until its record exists.
  const earlyThumbs = useRef(new Map<string, Blob>());

  const system = rom?.system ?? settings.system;
  const hostDocument = useRef(emulatorHostDocument());

  const refreshStates = useCallback(async (gameKey: string | null) => {
    if (!gameKey) {
      setStates([]);
      return;
    }
    try {
      setStates(await listStates(gameKey));
    } catch {
      setStates([]);
    }
  }, []);

  useEffect(() => {
    void refreshStates(rom?.gameKey ?? null);
  }, [refreshStates, rom?.gameKey]);

  useEffect(() => {
    void getSaveDirectory()
      .then(handle => setSaveFolder(handle))
      .catch(() => setSaveFolder(null));
  }, []);

  const post = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*');
  }, []);

  const remember = useCallback(
    async (requestId: string, mode: 'quick' | 'manual', bytes: Uint8Array, thumb: Blob | null) => {
      if (!rom) return;
      try {
        const record = await writeState({
          gameKey: rom.gameKey,
          gameName: rom.name,
          system: rom.system,
          kind: mode,
          label: stateLabel(mode, Date.now()),
          createdAt: Date.now(),
          bytes,
          thumb,
        });
        if (requestId) pending.current.set(requestId, record.id);
        const early = requestId ? earlyThumbs.current.get(requestId) : undefined;
        if (early && requestId) {
          earlyThumbs.current.delete(requestId);
          await writeState({ ...record, id: record.id, thumb: early });
        }
        await refreshStates(rom.gameKey);
        if (saveFolder) {
          try {
            const name = await writeStateToDirectory(saveFolder, record);
            onToast(t('Saved {name}.', { name }), 'success');
          } catch {
            onToast(
              t('Saved in Kryvex, but the save folder refused the file. Choose it again in the save panel.'),
              'warning',
            );
          }
        } else {
          onToast(t('Saved {name}.', { name: stateLabel(mode, record.createdAt) }), 'success');
        }
      } catch {
        onToast(t('That state could not be stored on this device.'), 'danger');
      }
    },
    [onToast, refreshStates, rom, saveFolder, t],
  );

  const applyState = useCallback(
    async (record: EmulatorStateRecord) => {
      if (!rom || !hostReady) {
        onToast(t('Load a cartridge before restoring a state.'), 'warning');
        return;
      }
      if (record.gameKey !== rom.gameKey) {
        onToast(t('That state belongs to a different cartridge.'), 'warning');
        return;
      }
      post({ type: 'kryvex-load-state', requestId: emulatorRequestId(), data: record.bytes });
    },
    [hostReady, post, rom, t, onToast],
  );

  const newest = useMemo(
    () => states.find(record => record.kind === 'quick') ?? states[0] ?? null,
    [states],
  );

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as FrameMessage | null;
      if (!data || typeof data.type !== 'string') return;
      switch (data.type) {
        case 'kryvex-emulator-ready':
          setHostReady(true);
          break;
        case 'kryvex-emulator-running':
        case 'kryvex-emulator-loaded':
          setRunning(true);
          setHostError(null);
          break;
        case 'kryvex-emulator-error':
          setHostError(data.message ?? 'The emulator could not start.');
          setRunning(false);
          break;
        case 'kryvex-state': {
          if (!data.state) return;
          await remember(
            data.requestId ?? '',
            data.mode === 'quick' ? 'quick' : 'manual',
            new Uint8Array(data.state),
            data.thumb ?? null,
          );
          break;
        }
        case 'kryvex-state-thumb': {
          if (!data.thumb) return;
          const id = data.requestId ? pending.current.get(data.requestId) : undefined;
          if (!id) {
            if (data.requestId) earlyThumbs.current.set(data.requestId, data.thumb);
            return;
          }
          pending.current.delete(data.requestId as string);
          const existing = await readStateRecord(id);
          if (!existing) return;
          await writeState({ ...existing, id, thumb: data.thumb });
          if (rom) await refreshStates(rom.gameKey);
          break;
        }
        case 'kryvex-load-request': {
          // The core's own Load State button: newest state for this cartridge.
          const latest = newest;
          if (!latest) {
            onToast(t('There is no saved state for this cartridge yet.'), 'info');
            return;
          }
          post({ type: 'kryvex-load-state', requestId: emulatorRequestId(), data: latest.bytes });
          break;
        }
        case 'kryvex-state-loaded':
          onToast(t('State restored.'), 'success');
          break;
        case 'kryvex-load-failed':
          onToast(t(data.message ?? 'That state could not be loaded.'), 'danger');
          break;
        case 'kryvex-save-failed':
          onToast(t(data.message ?? 'That state could not be saved.'), 'danger');
          break;
        case 'kryvex-battery': {
          if (!rom || !data.data) return;
          try {
            await writeBattery({
              gameKey: rom.gameKey,
              gameName: rom.name,
              bytes: new Uint8Array(data.data),
            });
            onToast(t('In-game save written.'), 'success');
          } catch {
            onToast(t('The in-game save could not be stored.'), 'danger');
          }
          break;
        }
        case 'kryvex-battery-request': {
          if (!rom) return;
          const bytes = await readBattery(rom.gameKey).catch(() => null);
          if (!bytes) {
            onToast(t('This cartridge has no in-game save stored yet.'), 'info');
            return;
          }
          post({ type: 'kryvex-battery-load', data: bytes });
          break;
        }
        case 'kryvex-battery-loaded':
          onToast(t('In-game save loaded.'), 'success');
          break;
        case 'kryvex-battery-failed':
          onToast(t('That in-game save could not be used.'), 'danger');
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [newest, onToast, post, refreshStates, remember, rom, t]);

  // A host reload resets the frame; the next ROM has to be sent again.
  useEffect(() => {
    if (!hostReady || !rom) return;
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'kryvex-rom',
        name: rom.name,
        data: rom.buffer,
        core: coreFor(rom.system),
        gamepad: settings.gamepad,
        bios: bios?.buffer ?? null,
        gameId: emulatorGameId(rom.name),
      },
      '*',
    );
  }, [bios, hostReady, rom, settings.gamepad]);

  // Lifecycle: a paused service suspends the core but keeps its memory, and a
  // muted one keeps emulating without sound.
  useEffect(() => {
    if (!hostReady) return;
    post({ type: lifecycle.pause ? 'kryvex-pause' : 'kryvex-resume' });
  }, [hostReady, lifecycle.pause, post]);

  useEffect(() => {
    if (!hostReady) return;
    post({ type: 'kryvex-mute', muted: lifecycle.mute });
  }, [hostReady, lifecycle.mute, post]);

  function loadRom(name: string, buffer: ArrayBuffer, nextSystem: EmulatorSystem) {
    setHostKey(value => value + 1);
    setHostReady(false);
    setRunning(false);
    setHostError(null);
    setBios(null);
    setRomChoice(null);
    setRom({
      name,
      buffer,
      system: nextSystem,
      gameKey: emulatorGameKey(name, nextSystem, buffer.byteLength),
    });
    onUpdate({ system: nextSystem });
    onToast(t('{name} loaded. The core starts on the canvas.', { name }), 'success');
  }

  async function acceptRom(file: File | undefined) {
    if (!file) return;
    const error = romValidation(file.name, file.size);
    if (error) {
      onToast(t(error), 'danger');
      return;
    }
    const candidates = systemsForFile(file.name);
    const buffer = await file.arrayBuffer();
    const identified = identifyRomSystem(buffer);
    if (identified && candidates.includes(identified)) {
      loadRom(file.name, buffer, identified);
      return;
    }
    // `.bin`, `.rom`, `.ws`, `.ngp` and `.pce` belong to more than one
    // console; headerless files get one explicit choice instead of a guess.
    if (candidates.length > 1) {
      setRomChoice({ name: file.name, buffer, candidates });
      return;
    }
    loadRom(file.name, buffer, candidates[0]!);
  }

  function selectSystem(nextSystem: EmulatorSystem) {
    onUpdate({ system: nextSystem });
    if (!rom) return;
    // A different core needs a fresh frame; the ROM buffer is reused.
    setHostKey(value => value + 1);
    setHostReady(false);
    setRunning(false);
    setHostError(null);
    setRom({
      ...rom,
      system: nextSystem,
      gameKey: emulatorGameKey(rom.name, nextSystem, rom.buffer.byteLength),
    });
  }

  async function acceptBios(file: File | undefined) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      onToast(t('That BIOS file is larger than 8 MB.'), 'danger');
      return;
    }
    setBios({ name: file.name, buffer: await file.arrayBuffer() });
    onToast(t('BIOS file ready. Reload the game to use it.'), 'info');
  }

  function pickRom(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    void acceptRom(file);
  }

  function requestSave(mode: 'quick' | 'manual') {
    if (!rom) {
      onToast(t('Load a cartridge before saving.'), 'warning');
      return;
    }
    if (!running) {
      onToast(t('Wait for the core to finish starting.'), 'info');
      return;
    }
    post({ type: 'kryvex-save-state', requestId: emulatorRequestId(), mode });
  }

  async function chooseSaveFolder() {
    if (!canPickSaveFolder()) {
      onToast(
        t(
          'This browser cannot open a save folder. Export a state file instead; it works everywhere.',
        ),
        'info',
      );
      return;
    }
    const picked = await pickSaveDirectory();
    if (!picked.ok) {
      if (picked.reason === 'unsupported') {
        onToast(t('This browser has no save folder picker.'), 'warning');
      }
      return;
    }
    setSaveFolder(picked.handle);
    onToast(t('New states are also written to {folder}.', { folder: picked.handle.name }), 'success');
  }

  async function importState(file: File | undefined) {
    if (!file || !rom) return;
    if (file.size <= 0 || file.size > 16 * 1024 * 1024) {
      onToast(t('That file does not look like a save state.'), 'danger');
      return;
    }
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const record = await writeState({
        gameKey: rom.gameKey,
        gameName: rom.name,
        system: rom.system,
        kind: 'manual',
        label: `${file.name} · ${stateLabel('manual', Date.now())}`,
        createdAt: Date.now(),
        bytes,
        thumb: null,
      });
      await refreshStates(rom.gameKey);
      await applyState(record);
    } catch {
      onToast(t('That state file could not be read.'), 'danger');
    } finally {
      setBusy(false);
    }
  }

  function closeCartridge() {
    setRom(null);
    setStates([]);
    setRunning(false);
    setHostError(null);
    setBios(null);
    setHostKey(value => value + 1);
    onToast(t('Cartridge closed. Saved states are kept for next time.'), 'info');
  }

  async function removeState(record: EmulatorStateRecord) {
    await deleteState(record.id).catch(() => undefined);
    if (rom) await refreshStates(rom.gameKey);
    onToast(t('State deleted.'), 'info');
  }

  const quick = states.find(record => record.kind === 'quick') ?? null;
  const folderLine = saveFolder
    ? t('Also writing to {folder}.', { folder: saveFolder.name })
    : t('Stored in this browser profile; it survives a reload.');

  return (
    <section className="view emulator-view">
      <header className="view-head emulator-head">
        <div>
          <p className="eyebrow mono">{t('SECRET SERVICE / 8-BIT MODE')}</p>
          <h1>{t('Secret emulator')}</h1>
          <p className="lede">
            {t(
              'A local cartridge slot for files you already own. Nothing is uploaded, indexed or streamed, and Kryvex does not provide ROMs.',
            )}
          </p>
        </div>
        <div className="emulator-head-actions">
          <button className="btn ghost small" onClick={onBack}>
            <Icon name="back" size={14} /> {t('Back to services')}
          </button>
          <button className="btn primary small" onClick={() => romInput.current?.click()}>
            <Icon name="folder" size={14} /> {t('Load ROM')}
          </button>
        </div>
      </header>

      <div className="emulator-disclaimer">
        <Icon name="warning" size={15} />
        <p>
          {t(
            'Kryvex does not host, provide or link to ROMs, and does not promote piracy. Use only ROMs and BIOS files you are legally entitled to use.',
          )}
        </p>
      </div>

      <div className="emulator-layout">
        <aside className="emulator-side">
          <span className="mono emulator-side-label">{t('CARTRIDGE')}</span>
          <button
            className={`emulator-slot ${dragOver ? 'is-over' : ''}`}
            onClick={() => romInput.current?.click()}
            onDragOver={event => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={event => {
              event.preventDefault();
              setDragOver(false);
              void acceptRom(event.dataTransfer.files[0]);
            }}
          >
            <span className="emulator-slot-mark" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </span>
            <strong>{rom ? rom.name : t('Drop a ROM here')}</strong>
            <span className="mono">
              {rom
                ? `${systemLabel(rom.system)} · ${(rom.buffer.byteLength / 1024 / 1024).toFixed(1)} MB`
                : t('or click to choose a file')}
            </span>
          </button>
          <input
            ref={romInput}
            type="file"
            accept={ROM_ACCEPT}
            hidden
            onChange={pickRom}
            aria-label={t('Choose a ROM')}
          />
          <p className="emulator-formats mono">
            {t('NES · SNES · GB/GBC · GBA · Sega · Atari · PC Engine · WonderSwan · Neo Geo Pocket · Virtual Boy')}
          </p>
          {rom ? (
            <button className="link" onClick={closeCartridge}>
              {t('Close cartridge')}
            </button>
          ) : null}

          <div className="emulator-system-list" role="group" aria-label={t('Console')}>
            {ROM_SYSTEMS.map(item => (
              <button
                key={item.id}
                className={system === item.id ? 'is-active' : ''}
                aria-pressed={system === item.id}
                onClick={() => selectSystem(item.id)}
                title={t('{name} core', { name: item.label })}
              >
                <span>{item.label}</span>
                {item.label.toUpperCase() !== item.id.toUpperCase() ? (
                  <span className="mono">{item.id.toUpperCase()}</span>
                ) : null}
              </button>
            ))}
          </div>
          {systemNote(system) ? (
            <p className="emulator-system-note mono">{t(systemNote(system)!)}</p>
          ) : null}
          <p className="emulator-system-note mono">
            {t('Atari 8-bit computers, Pokemon Mini and Arduboy have no EmulatorJS core here, so those formats are not offered.')}
          </p>

          <div className="emulator-bios">
            <span className="mono emulator-side-label">{t('BIOS (OPTIONAL)')}</span>
            <button className="btn ghost small" onClick={() => biosInput.current?.click()}>
              <Icon name="folder" size={13} />
              {bios ? bios.name : t('Choose BIOS')}
            </button>
            <p className="mono">
              {t('Some Game Boy Advance, Lynx and PC Engine titles need their own BIOS or firmware dump.')}
            </p>
            <input
              ref={biosInput}
              type="file"
              accept=".bin,.rom,.gba"
              hidden
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void acceptBios(file);
              }}
              aria-label={t('Choose a BIOS file')}
            />
          </div>
        </aside>

        <div className="emulator-screen-column">
          <div
            className={`emulator-screen ${settings.crt ? 'has-crt' : ''}`}
            style={{ '--emu-scale': settings.scale } as React.CSSProperties}
          >
            <div className="emulator-screen-frame">
              <iframe
                key={hostKey}
                ref={iframeRef}
                title={t('Emulator screen')}
                srcDoc={hostDocument.current}
                sandbox="allow-scripts allow-downloads allow-pointer-lock"
                allow="gamepad; fullscreen"
                className="emulator-frame"
              />
              {!rom ? (
                <div className="emulator-idle">
                  <span className="mono">{t('INSERT CARTRIDGE')}</span>
                  <strong>{t('No ROM loaded')}</strong>
                  <p>
                    {t(
                      'Choose a file from the cartridge slot. The emulator core is fetched from the official EmulatorJS CDN on first use.',
                    )}
                  </p>
                </div>
              ) : null}
              {hostError ? (
                <div className="emulator-idle is-error" role="alert">
                  <span className="mono">{t('CORE ERROR')}</span>
                  <strong>{t('The emulator could not start')}</strong>
                  <p>{t(hostError)}</p>
                  <button className="btn secondary small" onClick={() => setHostKey(value => value + 1)}>
                    {t('Reload the core')}
                  </button>
                </div>
              ) : null}
              {romChoice ? (
                <div className="emulator-chooser" role="dialog" aria-label={t('Choose a console')}>
                  <span className="mono">{t('SHARED CARTRIDGE FORMAT')}</span>
                  <strong>{romChoice.name}</strong>
                  <p>
                    {t(
                      'Kryvex could not read a console header from this file, and the extension is used by more than one system. Pick the console this ROM belongs to and it will start that core.',
                    )}
                  </p>
                  <div className="emulator-chooser-options">
                    {romChoice.candidates.map(id => (
                      <button
                        key={id}
                        className="btn secondary small"
                        onClick={() => loadRom(romChoice.name, romChoice.buffer, id)}
                      >
                        {systemLabel(id)}
                      </button>
                    ))}
                  </div>
                  <button className="link" onClick={() => setRomChoice(null)}>
                    {t('Cancel')}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="emulator-screen-foot">
              <span className="mono">
                {rom
                  ? running
                    ? lifecycle.pause
                      ? t('PAUSED · {system}', { system: systemLabel(system) })
                      : t('RUNNING · {system}', { system: systemLabel(system) })
                    : t('LOADING CORE…')
                  : t('STANDBY')}
              </span>
              <div className="emulator-screen-actions">
                <button
                  className="link"
                  onClick={() => iframeRef.current?.requestFullscreen?.().catch(() => undefined)}
                >
                  {t('Fullscreen')}
                </button>
                {rom ? (
                  <button
                    className="link"
                    onClick={() => {
                      setHostKey(value => value + 1);
                      setHostReady(false);
                      setRunning(false);
                      setHostError(null);
                    }}
                  >
                    {t('Restart core')}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <section className="emulator-saves-panel" aria-label={t('Save states')}>
            <div className="emulator-saves-head">
              <div>
                <span className="mono emulator-side-label">{t('SAVE STATES')}</span>
                <p className="emulator-saves-where mono">{folderLine}</p>
              </div>
              <div className="emulator-saves-actions">
                <button
                  className="btn primary small"
                  disabled={!rom || !running}
                  onClick={() => requestSave('quick')}
                  title={t('Overwrites the quick save slot for this cartridge.')}
                >
                  <Icon name="download" size={13} /> {t('Quick save')}
                </button>
                <button
                  className="btn secondary small"
                  disabled={!quick || !hostReady}
                  onClick={() => quick && void applyState(quick)}
                >
                  <Icon name="play" size={13} /> {t('Quick load')}
                </button>
                <button
                  className="btn ghost small"
                  disabled={!rom || !running}
                  onClick={() => requestSave('manual')}
                >
                  <Icon name="plus" size={13} /> {t('Save state')}
                </button>
                <button
                  className="btn ghost small"
                  disabled={!rom || busy}
                  onClick={() => stateInput.current?.click()}
                >
                  <Icon name="folder" size={13} /> {t('Import state')}
                </button>
                <input
                  ref={stateInput}
                  type="file"
                  accept=".state"
                  hidden
                  onChange={event => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    void importState(file);
                  }}
                  aria-label={t('Import a state file')}
                />
              </div>
            </div>

            <div className="emulator-saves-grid">
              {states.map(record => (
                <article className="emulator-save-card" key={record.id}>
                  <SaveThumb thumb={record.thumb} label={record.label} />
                  <div className="emulator-save-copy">
                    <strong>
                      {record.kind === 'quick' ? t('Quick save') : t('Save state')}
                    </strong>
                    <span className="mono">
                      {formatSaveSize(record.size)} · {saveStamp(record.createdAt)}
                    </span>
                  </div>
                  <div className="emulator-save-actions">
                    <button className="link" onClick={() => void applyState(record)}>
                      {t('Load')}
                    </button>
                    <button
                      className="link"
                      onClick={() => {
                        const name = downloadState(record);
                        onToast(t('Exported {name}.', { name }), 'info');
                      }}
                    >
                      {t('Export')}
                    </button>
                    <button className="link" onClick={() => void removeState(record)}>
                      {t('Delete')}
                    </button>
                  </div>
                </article>
              ))}
              {states.length === 0 ? (
                <p className="emulator-saves-empty mono">
                  {t(
                    'No states for this cartridge yet. Quick save writes one under a second; save state keeps up to {count} per game.',
                    { count: MAX_STATES_PER_GAME },
                  )}
                </p>
              ) : null}
            </div>

            <div className="emulator-saves-foot">
              <button className="link" onClick={() => void chooseSaveFolder()}>
                {saveFolder ? t('Choose another save folder') : t('Choose save folder…')}
              </button>
              <span className="mono">
                {t(
                  'A state is the core’s memory; in-game saves written by the game itself are kept separately, and both live outside Downloads.',
                )}
              </span>
            </div>
          </section>
        </div>

        <aside className="emulator-settings">
          <span className="mono emulator-side-label">{t('EMULATION SETTINGS')}</span>
          <label className="setting-row compact">
            <span>
              <strong>{t('Gamepad')}</strong>
              <em>{t('Use a connected controller. Remap buttons in the core’s own menu.')}</em>
            </span>
            <button
              className={`switch ${settings.gamepad ? 'is-on' : ''}`}
              role="switch"
              aria-checked={settings.gamepad}
              onClick={() => onUpdate({ gamepad: !settings.gamepad })}
              aria-label={t('Gamepad')}
            >
              <span />
            </button>
          </label>
          <label className="setting-row compact">
            <span>
              <strong>{t('CRT scanlines')}</strong>
              <em>{t('A transparent overlay only; it never touches the game output.')}</em>
            </span>
            <button
              className={`switch ${settings.crt ? 'is-on' : ''}`}
              role="switch"
              aria-checked={settings.crt}
              onClick={() => onUpdate({ crt: !settings.crt })}
              aria-label={t('CRT scanlines')}
            >
              <span />
            </button>
          </label>
          <label className="emulator-range">
            <span>{t('Screen size')}</span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={settings.scale}
              onChange={event => onUpdate({ scale: Number(event.target.value) })}
            />
            <span className="mono">×{settings.scale}</span>
          </label>

          <div className="emulator-netplay">
            <span className="mono emulator-side-label">{t('NETPLAY')}</span>
            <p>
              {t(
                'Kryvex does not offer netplay yet: the core can share a game, but only through a relay server we do not ship. Two controllers on this machine already work, and the core’s own menu handles button mapping.',
              )}
            </p>
            <button
              className="link"
              onClick={() => openExternalUrl('https://emulatorjs.org/docs/faq/')}
            >
              {t('EmulatorJS support notes')} <Icon name="external" size={11} />
            </button>
          </div>

          <p className="emulator-note">
            {t(
              'The page is sandboxed: the emulator cannot reach Kryvex’s bridge, files or settings. Save states and in-game saves are handed to Kryvex and stored by it, not by the core.',
            )}
          </p>
        </aside>
      </div>
    </section>
  );
}
