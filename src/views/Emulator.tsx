import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { EmulatorSettings, EmulatorSystem } from '../types';
import { useT } from '../lib/i18n';
import { openExternalUrl } from '../lib/external';
import {
  ROM_ACCEPT,
  ROM_SYSTEMS,
  coreFor,
  emulatorGameId,
  emulatorHostDocument,
  identifyRomSystem,
  romValidation,
  systemLabel,
  systemNote,
  systemsForFile,
} from '../lib/emulator';
import { Icon } from '../components/ui';

interface LoadedRom {
  name: string;
  buffer: ArrayBuffer;
  system: EmulatorSystem;
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

export function Emulator({
  settings,
  onUpdate,
  onBack,
  onToast,
}: {
  settings: EmulatorSettings;
  onUpdate: (patch: Partial<EmulatorSettings>) => void;
  onBack: () => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
}) {
  const t = useT();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const romInput = useRef<HTMLInputElement | null>(null);
  const biosInput = useRef<HTMLInputElement | null>(null);
  const [rom, setRom] = useState<LoadedRom | null>(null);
  const [bios, setBios] = useState<BiosFile | null>(null);
  const [hostReady, setHostReady] = useState(false);
  const [hostKey, setHostKey] = useState(0);
  const [running, setRunning] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [romChoice, setRomChoice] = useState<RomChoice | null>(null);

  const system = rom?.system ?? settings.system;
  const hostDocument = useRef(emulatorHostDocument());

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: string; message?: string } | null;
      if (!data || typeof data.type !== 'string') return;
      if (data.type === 'kryvex-emulator-ready') {
        setHostReady(true);
      } else if (data.type === 'kryvex-emulator-running') {
        setRunning(true);
      } else if (data.type === 'kryvex-emulator-loaded') {
        setRunning(true);
      } else if (data.type === 'kryvex-emulator-error') {
        setHostError(data.message ?? t('The emulator could not start.'));
        setRunning(false);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [t]);

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

  function loadRom(name: string, buffer: ArrayBuffer, nextSystem: EmulatorSystem) {
    setHostKey(value => value + 1);
    setHostReady(false);
    setRunning(false);
    setHostError(null);
    setBios(null);
    setRomChoice(null);
    setRom({ name, buffer, system: nextSystem });
    onUpdate({ system: nextSystem });
    setRunning(true);
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
    setRom({ ...rom, system: nextSystem });
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
              {rom ? `${systemLabel(rom.system)} · ${(rom.buffer.byteLength / 1024 / 1024).toFixed(1)} MB` : t('or click to choose a file')}
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

        <div className={`emulator-screen ${settings.crt ? 'has-crt' : ''}`} style={{ '--emu-scale': settings.scale } as React.CSSProperties}>
          <div className="emulator-screen-frame">
            <iframe
              key={hostKey}
              ref={iframeRef}
              title={t('Emulator screen')}
              srcDoc={hostDocument.current}
              sandbox="allow-scripts allow-downloads allow-pointer-lock"
              allow="gamepad; fullscreen"
              allowFullScreen
              className="emulator-frame"
            />
            {!rom ? (
              <div className="emulator-idle">
                <span className="mono">{t('INSERT CARTRIDGE')}</span>
                <strong>{t('No ROM loaded')}</strong>
                <p>{t('Choose a file from the cartridge slot. The emulator core is fetched from the official EmulatorJS CDN on first use.')}</p>
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
              {rom ? (running ? t('RUNNING · {system}', { system: systemLabel(system) }) : t('LOADING CORE…')) : t('STANDBY')}
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
                'EmulatorJS does not support netplay yet, so Kryvex does not offer a server field that would not connect. Two controllers on this machine still work, and the core’s own menu handles save states and button mapping.',
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
              'The page is sandboxed: the emulator cannot reach Kryvex’s bridge, files or settings. Save states download from the core’s menu; the sandboxed page cannot keep them.',
            )}
          </p>
        </aside>
      </div>
    </section>
  );
}
