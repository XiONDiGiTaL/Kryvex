import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from 'react';
import type { EmulatorSettings, EmulatorSystem } from '../types';
import { useT } from '../lib/i18n';
import { openExternalUrl } from '../lib/external';
import type { LifecycleVerdict } from '../lib/lifecycle';
import {
  emulatorGameKey,
  emulatorHostDocument,
  emulatorRequestId,
  emulatorStartMessage,
  engineFor,
  identifyRomSystem,
  isDiscSystem,
  isEmulatorSystem,
  offeredSystems,
  romAccept,
  romValidation,
  systemLabel,
  systemNote,
  systemsForFile,
} from '../lib/emulator';
import {
  FLYCAST_INSTALL_BYTES,
  FLYCAST_RELEASE,
  flycastCoreZip,
  flycastFailureKey,
} from '../lib/flycast';
import { biosFiles, gameFiles } from '../lib/emulator-folders';
import { discSetFromSelection, joinDiscFiles } from '../lib/psx-disc';
import type {
  EmulatorLibraryFile,
  EmulatorLibraryListing,
  FlycastStatus,
  RetroarchStatus,
} from '../types';
import { retroarchFailureKey } from '../lib/retroarch';

/** The desktop bridge, resolved once: the web build has no engine installer. */
const bridge = typeof window === 'undefined' ? undefined : window.kryvex;

/** Four neutral seat frames: one per player the core can see. */
function emptyPads(): NetplayPad[] {
  return Array.from({ length: COUCH_SEATS }, () => ({ ...NEUTRAL_PAD }));
}

/**
 * A keyset no seat is using yet.
 *
 * Handing a remote player a keyboard means picking one their neighbours are not
 * already holding; taking one that is in use would move the other player's
 * hands, which is worse than refusing.
 */
function freeLayout(seats: ReadonlyArray<CouchSeat>): KeyboardLayout | null {
  const used = new Set(
    seats.map(seat => (seat.device?.kind === 'keyboard' ? seat.device.layout : null)),
  );
  return keyboardLayouts().find(layout => !used.has(layout)) ?? null;
}
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
import { partySession, type NetplayMessage } from '../lib/party';
import {
  NEUTRAL_PAD,
  NETPLAY_ASK_ATTEMPTS,
  NETPLAY_ASK_INTERVAL_MS,
  NETPLAY_PAD_HEARTBEAT_MS,
  NETPLAY_STATE_INTERVAL_MS,
  joinRom,
  romFitsNetplay,
  samePad,
  shouldSendCartridge,
  splitRom,
  type NetplayPad,
} from '../lib/netplay';
import {
  COUCH_SEATS,
  applyControlKey,
  assignSeat,
  claimFromPads,
  claimSeat,
  codesOfLayouts,
  couchIsActive,
  emptySeats,
  firstFreeSeat,
  keyboardLayouts,
  layoutLabel,
  releaseSeat,
  seatDescriptor,
  seatFrames,
  seatOfOwner,
  type CouchSeat,
  type KeyboardLayout,
} from '../lib/couch';
import { setSeatInputSink } from '../lib/emulator-input';
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
  onOpenRooms,
  onToast,
  embedded = false,
}: {
  settings: EmulatorSettings;
  /** What the shared service lifecycle wants this screen to do. */
  lifecycle: LifecycleVerdict;
  onUpdate: (patch: Partial<EmulatorSettings>) => void;
  onBack: () => void;
  onOpenRooms: () => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
  /** Rendered inside a Workspace window: the window owns the title bar. */
  embedded?: boolean;
}) {
  const t = useT();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const romInput = useRef<HTMLInputElement | null>(null);
  const biosInput = useRef<HTMLInputElement | null>(null);
  const stateInput = useRef<HTMLInputElement | null>(null);
  const [rom, setRom] = useState<LoadedRom | null>(null);
  // The two folders the desktop app can list. A folder is remembered by the
  // main process, so this holds only what the panel shows.
  const [romFolder, setRomFolder] = useState<EmulatorLibraryListing | null>(null);
  const [biosFolder, setBiosFolder] = useState<EmulatorLibraryListing | null>(null);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
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

  // The second engine (Dreamcast). Switched off, nothing here is offered and
  // the cartridge engine behaves exactly as it did before the feature existed.
  const experimental = settings.experimentalEngine;
  const engineOptions = useMemo(() => ({ flycast: experimental }), [experimental]);
  const systems = useMemo(() => offeredSystems(engineOptions), [engineOptions]);
  // A picked folder is listed once and classified here, so scrolling the list
  // does not touch the disk again.
  const folderGames = useMemo(
    () => (romFolder?.ok ? gameFiles(romFolder.files, engineOptions) : []),
    [romFolder, engineOptions],
  );
  const folderBios = useMemo(
    () => (biosFolder?.ok ? biosFiles(biosFolder.files, settings.system) : []),
    [biosFolder, settings.system],
  );
  // The browser build has no bridge, and says so instead of a dead button.
  const pickableFolders = Boolean(bridge?.emulatorPickFolder);
  const [engine, setEngine] = useState<FlycastStatus | null>(null);
  const [engineBusy, setEngineBusy] = useState(false);
  // The packed core, once its files have been verified and read: 10.4 MB that
  // is only fetched when a Dreamcast game actually starts.
  const [coreZip, setCoreZip] = useState<Uint8Array | null>(null);
  const engineInstalled = engine?.installed === true;
  const desktopEngine = Boolean(bridge?.flycastCore);

  // Real netplay runs in RetroArch, a program the user installed. The session
  // is a separate process, so its state is read back from the main process
  // instead of guessed from what this panel did.
  const [retro, setRetro] = useState<RetroarchStatus | null>(null);
  const [retroBusy, setRetroBusy] = useState(false);
  const [joinAddress, setJoinAddress] = useState('');
  const [retroNote, setRetroNote] = useState<string | null>(null);
  const desktopNetplay = Boolean(bridge?.retroarchStart);

  useEffect(() => {
    if (!bridge?.retroarchStatus) return;
    let alive = true;
    const load = () => {
      void bridge
        .retroarchStatus?.()
        .then(status => {
          if (alive && status) setRetro(status);
        })
        .catch(() => undefined);
    };
    load();
    // RetroArch can be closed from its own window, and nothing tells Kryvex, so
    // the panel asks on a slow clock rather than claiming a session that ended.
    const timer = window.setInterval(load, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const retroSystem = rom?.system ?? null;
  const retroCore = retro?.cores.find(core => core.system === retroSystem) ?? null;

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

  // The engine's state lives in the main process, so a reopened panel reads it
  // instead of guessing from what this session downloaded.
  useEffect(() => {
    if (!bridge?.flycastStatus) return;
    let alive = true;
    void bridge
      .flycastStatus()
      .then(status => {
        if (alive && status) setEngine(status);
      })
      .catch(() => undefined);
    const stop = bridge.onFlycastProgress?.(progress =>
      setEngine(current => (current ? { ...current, phase: 'downloading', progress } : current)),
    );
    return () => {
      alive = false;
      stop?.();
    };
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

  /**
   * Link play.
   *
   * The room already in use is the session, so this never joins or leaves one:
   * chat, a share and a game can all run together. The host is authoritative —
   * it streams the cartridge once, then its pads and a periodic save state —
   * and the guest restores those checkpoints into its own core. Both sides see
   * a local picture, so a late packet costs a correction, not a freeze.
   */
  const party = useSyncExternalStore(partySession.subscribe, partySession.getSnapshot);
  const [netRole, setNetRole] = useState<'host' | 'guest' | null>(null);
  const [netNote, setNetNote] = useState<string | null>(null);
  /** True once the two ends are actually playing the same cartridge. */
  const [netLinked, setNetLinked] = useState(false);
  // Couch co-op: a seat owns a controller or a keyset, and seat 1 keeps its
  // keyboard corner until its player changes it.
  const [seats, setSeats] = useState<CouchSeat[]>(() =>
    claimSeat(emptySeats(), 1, { kind: 'keyboard', layout: 'wasd' }, 'Player 1'),
  );
  /** The seat whose owner just pressed "use this controller". */
  const [claiming, setClaiming] = useState<number | null>(null);
  const seatsRef = useRef(seats);
  seatsRef.current = seats;
  // The loop is a closure over refs: a claim is read from the same animation
  // frame that reads the pads, so it must not wait for a re-render.
  const claimingRef = useRef<number | null>(null);
  claimingRef.current = claiming;
  const heldKeys = useRef(new Set<string>());
  /** Keys a controlling peer is holding, per seat (room control, not a pad). */
  const remoteHeld = useRef(new Map<number, Set<string>>());
  /**
   * Seats other machines have announced.
   *
   * A claim is advisory: the machine that owns a device is the only one that can
   * read it, so the room is told which seat each player took and this host draws
   * that next to its own seats instead of trying to allocate them for everybody.
   */
  const [remoteSeats, setRemoteSeats] = useState<
    { peerId: string; name: string; seat: number; descriptor: string }[]
  >([]);

  const net = useRef({
    role: null as 'host' | 'guest' | null,
    peer: null as string | null,
    /** One frame per couch seat, merged from this machine and the room. */
    pads: emptyPads(),
    sent: emptyPads(),
    lastPadAt: 0,
    frame: 0,
    rom: null as (string | null)[] | null,
    state: null as (string | null)[] | null,
    /** The peer this host has already sent the cartridge to in this session. */
    romPeer: null as string | null,
    /** True once this end is playing the linked game rather than waiting. */
    linked: false,
    askTimer: 0 as number,
    asks: 0,
  });

  const postPads = useCallback(() => {
    post({ type: 'kryvex-netplay', active: true, pads: net.current.pads });
  }, [post]);

  /**
   * The one clock that turns four seats of input into pad frames.
   *
   * Only a seat this machine has bound is written and sent: an empty seat here
   * must not overwrite the same seat on another machine with neutral, which
   * would take a guest's controls away every frame. A seat that changed is
   * sent at once, and every bound seat is repeated on a slow heartbeat so a
   * lost frame does not leave a button held down.
   */
  const startPadLoop = useCallback(() => {
    cancelAnimationFrame(net.current.frame);
    let previous = Array.from(navigator.getGamepads?.() ?? []);
    const tick = () => {
      if (!net.current.role) return;
      const pads = Array.from(navigator.getGamepads?.() ?? []);
      // A player who presses a button while a seat is armed claims that pad.
      const armed = claimingRef.current;
      if (armed !== null) {
        const bound = seatsRef.current
          .map(seat => (seat.device?.kind === 'pad' ? seat.device.index : -1))
          .filter(index => index >= 0);
        const index = claimFromPads(previous, pads, bound);
        if (index !== null) {
          const claimed = pads[index];
          setSeats(current =>
            claimSeat(
              current,
              armed,
              { kind: 'pad', index, id: claimed?.id ?? `pad ${index}` },
              claimed?.id?.slice(0, 24) || `Controller ${index + 1}`,
            ),
          );
          setClaiming(null);
          claimingRef.current = null;
        }
      }
      previous = pads;
      const frames = seatFrames(seatsRef.current, {
        pads,
        held: heldKeys.current,
        remote: remoteHeld.current,
      });
      const now = performance.now();
      const heartbeat = now - net.current.lastPadAt >= NETPLAY_PAD_HEARTBEAT_MS;
      let changed = false;
      for (let index = 0; index < COUCH_SEATS; index += 1) {
        if (!seatsRef.current[index]?.device) continue;
        const frame = frames[index] ?? NEUTRAL_PAD;
        net.current.pads[index] = frame;
        if (!samePad(frame, net.current.sent[index] ?? NEUTRAL_PAD) || heartbeat) {
          net.current.sent[index] = frame;
          changed = true;
          void partySession.sendNetplay({ kind: 'pad', pad: frame, seat: index + 1 });
        }
      }
      if (changed) {
        net.current.lastPadAt = now;
        postPads();
      }
      net.current.frame = requestAnimationFrame(tick);
    };
    net.current.frame = requestAnimationFrame(tick);
  }, [postPads]);

  const sendChunked = useCallback(
    async (kind: 'rom' | 'state', buffer: ArrayBuffer, meta: Partial<NetplayMessage> = {}) => {
      const chunks = splitRom(buffer);
      for (let index = 0; index < chunks.length; index += 1) {
        if (net.current.role !== 'host') return;
        const sent = await partySession.sendNetplay({
          kind,
          role: 'host',
          seq: index,
          total: chunks.length,
          data: chunks[index],
          ...meta,
        });
        if (!sent) return;
      }
    },
    [],
  );

  const stopAsking = useCallback(() => {
    if (net.current.askTimer) {
      window.clearInterval(net.current.askTimer);
      net.current.askTimer = 0;
    }
  }, []);

  /**
   * A guest keeps announcing its seat until the cartridge arrives.
   *
   * The two machines open the link in either order and the room does not replay
   * a frame to a peer that had not opened one yet, so a single hello can be
   * lost. Repeating it is what makes "host presses Host after the guest pressed
   * Join" work; the host remembers the peer it already sent the game to, so a
   * repeat costs one small frame rather than a second transfer.
   */
  const startAsking = useCallback(() => {
    stopAsking();
    net.current.asks = 0;
    net.current.askTimer = window.setInterval(() => {
      if (net.current.role !== 'guest' || net.current.linked) return;
      net.current.asks += 1;
      if (net.current.asks > NETPLAY_ASK_ATTEMPTS) {
        stopAsking();
        setNetNote(
          t(
            'No host answered. The other machine has to open this cartridge in its own emulator and press Host this cartridge.',
          ),
        );
        return;
      }
      void partySession.sendNetplay({
        kind: 'hello',
        role: 'guest',
        name: partySession.getSnapshot().selfName || 'Player 2',
        gameKey: '',
        system: '',
      });
    }, NETPLAY_ASK_INTERVAL_MS);
  }, [stopAsking, t]);

  const stopNetplay = useCallback(
    (note?: string) => {
      if (net.current.role) {
        void partySession.sendNetplay({ kind: 'bye', role: net.current.role });
      }
      stopAsking();
      partySession.onNetplay = null;
      cancelAnimationFrame(net.current.frame);
      net.current.role = null;
      net.current.peer = null;
      net.current.pads = emptyPads();
      net.current.sent = emptyPads();
      net.current.rom = null;
      net.current.state = null;
      net.current.romPeer = null;
      net.current.linked = false;
      net.current.asks = 0;
      remoteHeld.current.clear();
      post({ type: 'kryvex-netplay', active: false });
      setNetRole(null);
      setNetLinked(false);
      setRemoteSeats([]);
      setNetNote(note ?? null);
    },
    [post],
  );

  const collectChunks = useCallback((slot: 'rom' | 'state', message: NetplayMessage) => {
    if (message.total <= 0) return null;
    if (message.seq === 0 || !net.current[slot] || net.current[slot]!.length !== message.total) {
      net.current[slot] = new Array<string | null>(message.total).fill(null);
    }
    const bucket = net.current[slot]!;
    bucket[message.seq] = message.data;
    if (bucket.some(item => item === null)) return null;
    net.current[slot] = null;
    return bucket as string[];
  }, []);

  const handleNetplay = useCallback(
    (message: NetplayMessage) => {
      /**
       * Seats are the one part of this channel that does not need a link.
       *
       * A host hands out seats from the couch panel before anybody has pressed
       * Host, and the member who receives one has to be able to adopt it then —
       * otherwise the assignment only lands if they happen to be linking already.
       */
      if (message.kind === 'seat') {
        if (message.target && message.target === party.selfId) {
          setSeats(current =>
            assignSeat(
              current,
              message.seat,
              message.descriptor,
              'local',
              message.name || `Player ${message.seat}`,
            ),
          );
          setNetNote(
            t('{name} put you in seat {number}.', {
              name: message.name || t('The host'),
              number: message.seat,
            }),
          );
          return;
        }
        if (!message.target && message.seat > 0) {
          const claim = {
            peerId: message.peerId,
            name: message.name || t('Player {number}', { number: message.seat }),
            seat: message.seat,
            descriptor: message.descriptor,
          };
          setRemoteSeats(current => [
            ...current.filter(item => item.peerId !== message.peerId),
            claim,
          ]);
        }
        return;
      }
      const role = net.current.role;
      if (!role) return;
      if (message.kind === 'hello' || message.kind === 'ask') {
        if (message.role === role) return;
        net.current.peer = message.peerId;
        if (role === 'host') {
          const label = message.name || t('Player 2');
          // An `ask` is the guest saying the transfer did not arrive; a repeat
          // hello is only an announcement. Sending a multi-megabyte cartridge
          // twice because both ends pressed their button is what the peer
          // check prevents.
          const send = shouldSendCartridge(
            message.kind === 'ask' ? 'ask' : 'hello',
            message.peerId,
            net.current.romPeer,
          );
          if (send) {
            net.current.romPeer = message.peerId;
            setNetNote(t('{name} joined as player 2. Sending the cartridge…', { name: label }));
          }
          if (rom) {
            if (!romFitsNetplay(rom.buffer.byteLength)) {
              setNetNote(
                t('{name} joined, but this cartridge is too large to send. Both players can load the same file instead.', {
                  name: label,
                }),
              );
            } else if (send) {
              void sendChunked('rom', rom.buffer, {
                gameName: rom.name,
                system: rom.system,
                gameKey: rom.gameKey,
              });
            }
          }
          net.current.linked = true;
          setNetLinked(true);
          postPads();
        } else {
          setNetNote(t('Connected to the host. Waiting for the cartridge…'));
        }
        return;
      }
      if (message.kind === 'bye') {
        net.current.peer = null;
        // The peer's own seats are released; this machine's stay where they are.
        const mine = new Set(
          seatsRef.current
            .filter(seat => seat.device !== null)
            .map(seat => seat.seat - 1),
        );
        net.current.pads = net.current.pads.map((pad, index) =>
          mine.has(index) ? pad : { ...NEUTRAL_PAD },
        );
        net.current.linked = false;
        setNetLinked(false);
        postPads();
        setNetNote(t('The other player left the link.'));
        return;
      }
      if (message.kind === 'rom') {
        if (role !== 'guest') return;
        const chunks = collectChunks('rom', message);
        if (!chunks) return;
        const bytes = joinRom(chunks);
        if (!bytes || bytes.length === 0) {
          setNetNote(t('The cartridge did not arrive complete. Ask the host to send it again.'));
          return;
        }
        const buffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        const next = isEmulatorSystem(message.system)
          ? message.system
          : (identifyRomSystem(buffer) ?? 'nes');
        loadRom(message.gameName || 'linked.rom', buffer, next);
        stopAsking();
        net.current.linked = true;
        setNetLinked(true);
        setNetNote(t('Cartridge received. The host’s game is now your game.'));
        return;
      }
      if (message.kind === 'state') {
        if (role !== 'guest') return;
        const chunks = collectChunks('state', message);
        if (!chunks) return;
        const bytes = joinRom(chunks);
        if (!bytes) return;
        // A checkpoint that arrives while the guest's own core is still
        // starting is dropped rather than applied: the next one is 1.5 s away.
        if (!running || !hostReady) return;
        post({ type: 'kryvex-netplay-restore', data: bytes });
        return;
      }
      if (message.kind === 'pad') {
        // A seat number is the sender's own binding, so it is trusted only as
        // far as which slot to write: the payload itself was sanitized on the
        // way in. A frame from an older build has no seat and keeps the old
        // host/guest mapping.
        const index =
          message.seat > 0
            ? Math.min(COUCH_SEATS - 1, message.seat - 1)
            : message.role === 'host'
              ? 0
              : 1;
        if (seatsRef.current[index]?.device) return;
        if (index === (role === 'host' ? 0 : 1) && message.seat === 0) return;
        net.current.pads[index] = message.pad;
        postPads();
      }
    },
    [collectChunks, hostReady, post, postPads, rom, running, sendChunked, stopAsking, t],
  );

  // Registered whenever a room is open, not only while linking: a seat handed
  // to this machine has to land whether or not the game has started.
  useEffect(() => {
    if (party.status !== 'joined') return;
    partySession.onNetplay = handleNetplay;
    return () => {
      if (partySession.onNetplay === handleNetplay) partySession.onNetplay = null;
    };
  }, [handleNetplay, party.status]);

  /**
   * A seat's keyboard, while a link is running.
   *
   * Only the codes a bound keyset owns are read, so two players on one keyboard
   * never see each other's keys and no other shortcut is swallowed. A field the
   * user is typing in keeps every key it wants — the netplay address box is on
   * this same page.
   */
  useEffect(() => {
    if (!netRole) {
      heldKeys.current.clear();
      return;
    }
    const layouts = seats
      .map(seat => (seat.device?.kind === 'keyboard' ? seat.device.layout : null))
      .filter((layout): layout is KeyboardLayout => layout !== null);
    if (layouts.length === 0) return;
    const codes = codesOfLayouts(layouts);
    const typing = (target: EventTarget | null): boolean => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tag = element.tagName;
      return (
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable === true
      );
    };
    const down = (event: KeyboardEvent) => {
      if (!codes.has(event.code) || event.repeat) return;
      if (typing(event.target)) return;
      heldKeys.current.add(event.code);
      event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      if (!codes.has(event.code)) return;
      heldKeys.current.delete(event.code);
      if (!typing(event.target)) event.preventDefault();
    };
    const blur = () => heldKeys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      heldKeys.current.clear();
    };
  }, [netRole, seats]);

  /**
   * Tells the room which seats this machine took.
   *
   * A claim, not an allocation: only the machine that owns a device can read it,
   * so each side draws the other's claims and its own seats stay its own. A seat
   * this machine handed to a guest is the guest's to announce, so it is skipped.
   */
  useEffect(() => {
    if (!netRole) return;
    for (const seat of seats) {
      if (!seat.device || seat.owner !== 'local') continue;
      void partySession.sendNetplay({
        kind: 'seat',
        role: netRole,
        seat: seat.seat,
        descriptor: seatDescriptor(seat.device),
        name: seat.name || party.selfName || `Player ${seat.seat}`,
      });
    }
  }, [netRole, party.selfName, seats]);

  /**
   * The granted peer's keyboard, as a seat.
   *
   * This is how room control reaches the emulator: Rooms offers every key of the
   * one peer the host allowed here first, and it lands on that peer's seat. A
   * viewer who has no emulator of their own, watching a shared game, therefore
   * plays as player 2 (or 3, or 4) with their own keys, and the host's player 1
   * is untouched. A peer with no seat yet is given the first free one with a
   * keyset nobody else is using, and told about it so its own panel agrees.
   */
  useEffect(() => {
    if (!hostReady || !rom) return;
    return setSeatInputSink(event => {
      const control = party.control;
      if (!control || control.state !== 'granted') return false;
      // The frame is built from this list, not from the ref: a seat handed out
      // by the key being handled is only in the ref after the next render, and
      // reading the stale one sent a neutral pad — so a viewer's very first
      // press reached the emulator as nothing at all.
      let seated = seatsRef.current;
      let seat = seatOfOwner(seated, control.peerId);
      if (!seat) {
        const free = firstFreeSeat(seated);
        const layout = freeLayout(seated);
        // Four seats of keyboards and no room for a fifth: the host keeps the
        // keys rather than taking somebody else's.
        if (!free || !layout) return false;
        const descriptor = `keyboard:${layout}`;
        seated = assignSeat(seated, free.seat, descriptor, control.peerId, control.name);
        setSeats(seated);
        // Mirrored here so a second key of the same press sees the seat too.
        seatsRef.current = seated;
        void partySession.sendNetplay({
          kind: 'seat',
          seat: free.seat,
          descriptor,
          target: control.peerId,
          name: control.name,
        });
        seat = { ...free, device: { kind: 'keyboard', layout }, owner: control.peerId };
      }
      // A seat bound to a physical pad cannot take keys from the room: the room
      // does not carry that pad, and pretending it does would fight its owner.
      if (seat.device?.kind !== 'keyboard') return false;
      applyControlKey(remoteHeld.current, seat.seat, event.key, event.phase === 'down');
      post({
        type: 'kryvex-netplay',
        active: true,
        pads: seatFrames(seated, {
          pads: Array.from(navigator.getGamepads?.() ?? []),
          held: heldKeys.current,
          remote: remoteHeld.current,
        }),
      });
      return true;
    });
  }, [hostReady, post, party.control, rom]);

  // A new holder starts from nothing, and a revoked one drops what it held: a
  // key left down would otherwise stay down for the rest of the game.
  useEffect(() => {
    remoteHeld.current.clear();
    if (hostReady) post({ type: 'kryvex-netplay', active: true, pads: net.current.pads });
  }, [hostReady, party.control?.peerId, post]);

  // A room that closes takes the link with it; the pads must not stay frozen.
  useEffect(() => {
    if (netRole && party.status !== 'joined') stopNetplay(t('The room closed, so the link ended.'));
  }, [netRole, party.status, stopNetplay, t]);

  useEffect(() => () => stopNetplay(), [stopNetplay]);

  // The host hands over a checkpoint on a slow clock: often enough to correct
  // drift, rare enough that a save state never becomes video traffic.
  useEffect(() => {
    if (netRole !== 'host' || !running) return;
    // A checkpoint is a whole save state: a Dreamcast one is far too large to
    // send every second, so the second engine does not enter this loop at all.
    if (rom && engineFor(rom.system) === 'flycast') return;
    const timer = window.setInterval(() => {
      if (net.current.role !== 'host' || !net.current.peer) return;
      post({ type: 'kryvex-netplay-snapshot', requestId: emulatorRequestId() });
    }, NETPLAY_STATE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [netRole, post, rom, running]);

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
        case 'kryvex-netplay-state': {
          if (net.current.role !== 'host' || !net.current.peer || !data.data) return;
          const bytes = new Uint8Array(data.data);
          if (bytes.length === 0) return;
          const buffer = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer;
          void sendChunked('state', buffer);
          break;
        }
        case 'kryvex-netplay-restore-failed':
          setNetNote(t('A checkpoint from the host did not fit this core. Ask for the cartridge again.'));
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
  }, [newest, onToast, post, refreshStates, remember, rom, sendChunked, t]);

  // A host reload resets the frame; the next ROM has to be sent again.
  useEffect(() => {
    if (!hostReady || !rom) return;
    // A Dreamcast game waits for the engine payload: the frame has nothing to
    // start without it, and this effect runs again when the zip arrives.
    if (engineFor(rom.system) === 'flycast' && !coreZip) return;
    iframeRef.current?.contentWindow?.postMessage(
      emulatorStartMessage({
        name: rom.name,
        data: rom.buffer,
        system: rom.system,
        gamepad: settings.gamepad,
        bios: bios?.buffer ?? null,
        coreZip: coreZip ?? undefined,
      }),
      '*',
    );
  }, [bios, coreZip, hostReady, rom, settings.gamepad]);

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

  /**
   * Reads the verified core files and packs them for the frontend.
   *
   * The main process re-hashes on the way out, so a file changed after install
   * is refused here rather than handed to a code loader.
   */
  const ensureCore = useCallback(async () => {
    if (coreZip || !bridge?.flycastCore) return;
    const answer = await bridge.flycastCore().catch(() => null);
    if (!answer) {
      onToast(t('The second engine runs in the desktop app only.'), 'warning');
      return;
    }
    if (!answer.ok) {
      onToast(t(flycastFailureKey(answer.error)), 'danger');
      return;
    }
    setCoreZip(
      flycastCoreZip({
        js: new Uint8Array(answer.js),
        wasm: new Uint8Array(answer.wasm),
      }),
    );
  }, [coreZip, onToast, t]);

  async function refreshEngine() {
    const status = await bridge?.flycastStatus?.().catch(() => null);
    if (status) setEngine(status);
  }

  async function installEngine() {
    if (!bridge?.flycastInstall) {
      onToast(t('The second engine runs in the desktop app only.'), 'warning');
      return;
    }
    setEngineBusy(true);
    try {
      const status = await bridge.flycastInstall();
      if (status) setEngine(status);
      if (status?.installed) {
        onToast(t('The engine is ready. Load a Dreamcast image with its BIOS.'), 'success');
      } else if (status?.error) {
        onToast(t(flycastFailureKey(status.error)), 'danger');
      }
    } catch {
      onToast(t(flycastFailureKey('network')), 'danger');
    } finally {
      setEngineBusy(false);
    }
  }

  async function removeEngine() {
    if (!bridge?.flycastRemove) return;
    setCoreZip(null);
    const status = await bridge.flycastRemove().catch(() => null);
    if (status) setEngine(status);
    onToast(t('The engine was removed.'), 'info');
  }

  /**
   * Netplay, through the RetroArch on this machine.
   *
   * The cartridge goes over as bytes — a guest's copy came out of Kryvex's own
   * store, and RetroArch matches content by CRC, so the two files need not have
   * the same name. An error id is turned into a sentence here, in the language
   * the panel is already speaking.
   */
  async function startRetroarch(role: 'host' | 'join') {
    if (!bridge?.retroarchStart || !rom) return;
    setRetroBusy(true);
    setRetroNote(null);
    try {
      const status = await bridge
        .retroarchStart({
          role,
          system: rom.system,
          address: role === 'join' ? joinAddress : undefined,
          nick: party.selfName,
          rom: {
            name: rom.name,
            extension: rom.name.split('.').pop() ?? '',
            bytes: new Uint8Array(rom.buffer),
          },
        })
        .catch(() => null);
      if (!status) return;
      setRetro(status);
      if (status.error) {
        setRetroNote(
          t(retroarchFailureKey(status.error), {
            system: systemLabel(rom.system),
            file: status.missing?.[0] ?? '',
          }),
        );
      }
    } finally {
      setRetroBusy(false);
    }
  }

  async function locateRetroarch() {
    if (!bridge?.retroarchLocate) return;
    const status = await bridge.retroarchLocate().catch(() => null);
    if (status) setRetro(status);
  }

  async function stopRetroarch() {
    if (!bridge?.retroarchStop) return;
    const status = await bridge.retroarchStop().catch(() => null);
    if (status) setRetro(status);
    setRetroNote(null);
  }

  /**
   * Turning the engine off hides its formats and forgets the packed core. A
   * game already running keeps running: closing it is the user's call, not a
   * side effect of a switch.
   */
  function toggleEngine(on: boolean) {
    const nextSystem = !on && engineFor(system) === 'flycast' ? 'nes' : system;
    onUpdate({ experimentalEngine: on, system: nextSystem });
    if (!on) setCoreZip(null);
  }

  function loadRom(name: string, buffer: ArrayBuffer, nextSystem: EmulatorSystem) {
    if (engineFor(nextSystem) === 'flycast' && !engineInstalled) {
      onToast(
        t(
          desktopEngine
            ? 'Install the engine before starting a Dreamcast game.'
            : 'The second engine runs in the desktop app only.',
        ),
        'warning',
      );
      // A status read may have been missed: ask once more for the next attempt.
      void refreshEngine();
      return;
    }
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
    if (engineFor(nextSystem) === 'flycast') void ensureCore();
    onToast(t('{name} loaded. The core starts on the canvas.', { name }), 'success');
  }

  /**
   * A PlayStation disc, joined from whatever was selected.
   *
   * A rip arrives as a `.cue` plus one or more `.bin` tracks, and the core can
   * open neither on its own: the cue is a manifest and the track has no layout.
   * The pair becomes one `.iso` here, before the slot decides anything, so the
   * rest of the panel sees a normal single-file game.
   */
  async function acceptDiscSet(files: File[]): Promise<boolean> {
    const set = discSetFromSelection(
      await Promise.all(
        files.map(async file => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })),
      ),
    );
    const joined = joinDiscFiles(set);
    if (!joined) {
      onToast(
        t('A .cue needs the .bin track beside it. Select both files and Kryvex joins them into one disc image.'),
        'danger',
      );
      return true;
    }
    const error = romValidation(joined.name, joined.bytes.byteLength, engineOptions);
    if (error) {
      onToast(t(error), 'danger');
      return true;
    }
    const buffer = joined.bytes.buffer.slice(
      joined.bytes.byteOffset,
      joined.bytes.byteOffset + joined.bytes.byteLength,
    ) as ArrayBuffer;
    loadRom(joined.name, buffer, 'psx');
    if (joined.lostAudio) {
      onToast(
        t('The disc was joined from its data track only. If the game’s music is missing, use a .chd of the whole disc.'),
        'info',
      );
    }
    return true;
  }

  async function acceptRom(file: File | undefined) {
    await acceptRoms(file ? [file] : []);
  }

  /**
   * Every file the picker returned.
   *
   * One file is the normal case. A `.cue` (or a bare disc track) is handed to
   * `acceptDiscSet`, which is the only path that reads more than one file.
   */
  async function acceptRoms(list: File[]) {
    if (list.length === 0) return;
    const cue = list.find(file => /\.cue$/i.test(file.name));
    const discish = list.filter(file => /\.(cue|bin|iso|img)$/i.test(file.name));
    if (cue) {
      await acceptDiscSet(list);
      return;
    }
    // A single `.iso`/`.img` is a PlayStation image and nothing else; a bare
    // `.bin` is only one when it is too large to be a cartridge.
    if (discish.length === 1 && list.length === 1) {
      const only = discish[0]!;
      const candidates = systemsForFile(only.name, engineOptions, only.size);
      if (candidates.length === 1 && candidates[0] === 'psx') {
        await acceptDiscSet([only]);
        return;
      }
    }
    // Several files and no cue: the first file the picker named is the game.
    const file = list[0]!;
    const error = romValidation(file.name, file.size, engineOptions);
    if (error) {
      onToast(t(error), 'danger');
      return;
    }
    const candidates = systemsForFile(file.name, engineOptions, file.size);
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

  /** Opens the native folder picker, then lists what the folder holds. */
  async function pickFolder(kind: 'roms' | 'bios') {
    const api = bridge?.emulatorPickFolder;
    if (!api) {
      onToast(t('Folders are available in the desktop app.'), 'warning');
      return;
    }
    setLibraryBusy(true);
    try {
      const listing = await api(kind);
      if (!listing) return;
      if (!listing.ok && listing.code === 'cancelled') return;
      if (kind === 'roms') {
        setRomFolder(listing);
        setGamesOpen(true);
      } else {
        setBiosFolder(listing);
      }
    } catch {
      onToast(t('That folder could not be read.'), 'danger');
    } finally {
      setLibraryBusy(false);
    }
  }

  /**
   * Loads one listed file.
   *
   * The bytes come back through the bridge, which only reads inside a folder
   * that was picked; the resulting `File` then goes through exactly the same
   * validation, header sniffing and choice as a file dropped on the slot.
   */
  async function loadListedFile(file: EmulatorLibraryFile, kind: 'roms' | 'bios') {
    const api = bridge?.emulatorReadFile;
    if (!api) return;
    setLibraryBusy(true);
    try {
      const read = await api(file.path);
      if (!read?.ok || !read.bytes) {
        onToast(
          t(
            read?.code === 'too-large'
              ? 'That file is too large to open here.'
              : 'That file could not be read.',
          ),
          'danger',
        );
        return;
      }
      // A copy, so the `File` owns an `ArrayBuffer` rather than a view over one
      // the IPC layer may reuse.
      const copy = new Uint8Array(read.bytes.byteLength);
      copy.set(read.bytes);
      const blob = new File([copy], file.name);
      if (kind === 'roms') await acceptRom(blob);
      else await acceptBios(blob);
    } catch {
      onToast(t('That file could not be read.'), 'danger');
    } finally {
      setLibraryBusy(false);
    }
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
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void acceptRoms(files);
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

  /**
   * P1 hands a seat to a room member, or takes it back.
   *
   * This is the settings hub the host asked for: pick the player, pick the keys,
   * and that member's own emulator adopts the seat so their frames arrive on it.
   * A member without an emulator still plays through room control — their keys
   * land on this same seat.
   */
  function handSeat(seatNumber: number, owner: string, peerName: string) {
    const seat = seats.find(item => item.seat === seatNumber);
    const layout =
      seat?.device?.kind === 'keyboard' ? seat.device.layout : (freeLayout(seats) ?? 'arrows');
    const descriptor = `keyboard:${layout}`;
    setSeats(current => assignSeat(current, seatNumber, descriptor, owner, seat?.name));
    if (owner !== 'local' && party.status === 'joined') {
      void partySession.sendNetplay({
        kind: 'seat',
        seat: seatNumber,
        descriptor,
        target: owner,
        name: peerName,
      });
    }
  }

  /**
   * A controller that is already plugged in belongs to seat 1.
   *
   * Without this a player with one pad would have to claim it by hand before
   * their first game, and the old single-pad behaviour would look broken. It
   * only ever claims seat 1, and only when no seat holds a pad yet.
   */
  function primeSeats() {
    if (seatsRef.current.some(seat => seat.device?.kind === 'pad')) return;
    const pads = Array.from(navigator.getGamepads?.() ?? []);
    const index = pads.findIndex(pad => pad && pad.connected !== false);
    if (index < 0) return;
    const pad = pads[index] ?? null;
    setSeats(current =>
      claimSeat(
        current,
        1,
        { kind: 'pad', index, id: pad?.id ?? `pad ${index}` },
        pad?.id?.slice(0, 24) || 'Player 1',
      ),
    );
  }

  function startHosting() {
    if (!rom) {
      onToast(t('Load a cartridge before hosting a link session.'), 'warning');
      return;
    }
    if (!running) {
      onToast(t('Wait for the core to finish starting.'), 'info');
      return;
    }
    if (engineFor(rom.system) === 'flycast') {
      onToast(
        t(
          'Link play keeps the two machines together by sending save states, and a Dreamcast state is too large for that. Load the same image on both machines instead.',
        ),
        'warning',
      );
      return;
    }
    if (party.status !== 'joined') {
      onToast(t('Join a room first: Rooms is the link between the two machines.'), 'warning');
      return;
    }
    primeSeats();
    net.current.role = 'host';
    net.current.peer = null;
    net.current.rom = null;
    net.current.state = null;
    net.current.romPeer = null;
    net.current.linked = false;
    setNetRole('host');
    setNetLinked(false);
    setNetNote(t('Waiting for player 2. Share the room link from Rooms.'));
    startPadLoop();
    void partySession.sendNetplay({
      kind: 'hello',
      role: 'host',
      name: party.selfName || 'Host',
      gameKey: rom.gameKey,
      system: rom.system,
      gameName: rom.name,
    });
  }

  function startJoining() {
    if (party.status !== 'joined') {
      onToast(t('Join a room first: Rooms is the link between the two machines.'), 'warning');
      return;
    }
    primeSeats();
    net.current.role = 'guest';
    net.current.peer = null;
    net.current.rom = null;
    net.current.state = null;
    net.current.romPeer = null;
    net.current.linked = false;
    setNetRole('guest');
    setNetLinked(false);
    setNetNote(t('Asking the host for the cartridge…'));
    startPadLoop();
    void partySession.sendNetplay({
      kind: 'hello',
      role: 'guest',
      name: party.selfName || 'Player 2',
      gameKey: '',
      system: '',
    });
    startAsking();
  }

  /** The guest's retry: an explicit request the host honours even after a send. */
  function askAgain() {
    if (net.current.role !== 'guest') return;
    net.current.linked = false;
    setNetLinked(false);
    setNetNote(t('Asking the host for the cartridge…'));
    void partySession.sendNetplay({
      kind: 'ask',
      role: 'guest',
      name: party.selfName || 'Player 2',
      gameKey: '',
      system: '',
    });
    startAsking();
  }

  const quick = states.find(record => record.kind === 'quick') ?? null;
  const folderLine = saveFolder
    ? t('Also writing to {folder}.', { folder: saveFolder.name })
    : t('Stored in this browser profile; it survives a reload.');
  const enginePercent = engine?.progress
    ? Math.min(
        100,
        Math.round((engine.progress.overall / Math.max(1, engine.progress.installBytes)) * 100),
      )
    : 0;
  const engineLine =
    engine?.phase === 'downloading'
      ? t('Downloading the engine… {percent}%', { percent: enginePercent })
      : engineInstalled
        ? t('Ready · {version}', { version: engine?.label ?? FLYCAST_RELEASE.version })
        : engine?.phase === 'error'
          ? t('The engine could not be installed.')
          : t('Not installed');

  return (
    <section className={`view emulator-view ${embedded ? 'is-embedded' : ''}`}>
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
        <div className="emulator-disclaimer-copy">
        <p>
          {t(
            'Kryvex does not host, provide or link to ROMs, and does not promote piracy. Use only ROMs and BIOS files you are legally entitled to use.',
          )}
        </p>
        {/* Emulation is EmulatorJS's work, not Kryvex's. The project is GPL-3.0
            and is fetched from its own CDN inside a sandboxed frame, never
            bundled here, so the credit and the source link belong in the UI. */}
        <p className="emulator-credit">
          {t('Emulation by EmulatorJS, GPL-3.0, loaded from its official CDN and not bundled with Kryvex.')}{' '}
          <button
            className="link"
            onClick={() => openExternalUrl('https://github.com/EmulatorJS/EmulatorJS')}
          >
            {t('Source and licence')}
          </button>
        </p>
        </div>
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
              // A drop can carry a cue and its track together, which is the
              // only way a raw PlayStation rip can be started.
              void acceptRoms(Array.from(event.dataTransfer.files));
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
            accept={romAccept(engineOptions)}
            multiple
            hidden
            onChange={pickRom}
            aria-label={t('Choose a ROM')}
          />
          <p className="emulator-formats mono">
            {t(
              'NES · SNES · N64 · GB/GBC · GBA · Sega · Atari · PC Engine · WonderSwan · Neo Geo Pocket · Virtual Boy · PlayStation',
            )}
            {experimental ? ' · Dreamcast' : ''}
          </p>
          {rom ? (
            <button className="link" onClick={closeCartridge}>
              {t('Close cartridge')}
            </button>
          ) : null}

          <div className="emulator-system-list" role="group" aria-label={t('Console')}>
            {systems.map(item => (
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
            {t(
              experimental
                ? 'Dreamcast runs on the second engine. Naomi arcade boards are still not offered: a set is several files and the slot takes one.'
                : 'Atari 8-bit computers, Pokemon Mini, Arduboy, Dreamcast and Naomi have no EmulatorJS core here, so those formats are not offered.',
            )}
          </p>

          <div className="emulator-bios">
            <span className="mono emulator-side-label">{t('BIOS (OPTIONAL)')}</span>
            <button className="btn ghost small" onClick={() => biosInput.current?.click()}>
              <Icon name="folder" size={13} />
              {bios ? bios.name : t('Choose BIOS')}
            </button>
            <p className="mono">
              {t(
                'PlayStation needs its own BIOS to start; some Game Boy Advance, Lynx and PC Engine titles need a firmware dump of their own.',
              )}
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

          {/*
            A folder is the workflow a collection actually has: the emulator
            lists what is there and loads it, instead of opening a file dialog
            for every game. The main process only ever lists and reads inside a
            folder the user picked in a native dialog.
          */}
          <div className="emulator-library">
            <span className="mono emulator-side-label">{t('FOLDERS')}</span>
            <div className="emulator-folder-row">
              <button
                className="btn ghost small"
                disabled={libraryBusy || !pickableFolders}
                onClick={() => void pickFolder('roms')}
                title={pickableFolders ? undefined : t('Folders are available in the desktop app.')}
              >
                <Icon name="folder" size={13} />
                {romFolder?.folder ? romFolder.folder : t('Games folder')}
              </button>
              {folderGames.length > 0 ? (
                <button
                  className="link mono emulator-folder-count"
                  onClick={() => setGamesOpen(value => !value)}
                  aria-expanded={gamesOpen}
                >
                  {t('{count} games', { count: folderGames.length })}
                </button>
              ) : null}
            </div>
            {gamesOpen && folderGames.length > 0 ? (
              <ul className="emulator-folder-list" aria-label={t('Games in this folder')}>
                {folderGames.slice(0, 60).map(item => (
                  <li key={item.file.path}>
                    <button
                      className="emulator-folder-item"
                      disabled={libraryBusy}
                      onClick={() => void loadListedFile(item.file, 'roms')}
                      title={item.file.name}
                    >
                      <span className="emulator-folder-name">{item.file.name}</span>
                      <span className="mono emulator-folder-system">{systemLabel(item.system)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {romFolder?.truncated ? (
              <p className="mono emulator-folder-note">
                {t('The list stops at {count} files; the rest are still on disk.', {
                  count: 4000,
                })}
              </p>
            ) : null}

            <div className="emulator-folder-row">
              <button
                className="btn ghost small"
                disabled={libraryBusy || !pickableFolders}
                onClick={() => void pickFolder('bios')}
              >
                <Icon name="folder" size={13} />
                {biosFolder?.folder ? biosFolder.folder : t('BIOS folder')}
              </button>
            </div>
            {folderBios.length > 0 ? (
              <ul className="emulator-folder-list" aria-label={t('BIOS files in this folder')}>
                {folderBios.map(file => (
                  <li key={file.path}>
                    <button
                      className="emulator-folder-item"
                      disabled={libraryBusy}
                      onClick={() => void loadListedFile(file, 'bios')}
                      title={file.name}
                    >
                      {/* The panel is already labelled, and "BIOS" is the same
                          word in every locale. The size is what helps: it is
                          how a truncated dump is spotted before loading it. */}
                      <span className="emulator-folder-name">{file.name}</span>
                      <span className="mono emulator-folder-system">
                        {Math.max(1, Math.round(file.size / 1024))} KB
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : biosFolder?.ok ? (
              <p className="mono emulator-folder-note">
                {t('No BIOS file this console reads was found in that folder.')}
              </p>
            ) : null}
            <p className="mono emulator-folder-note">
              {t('Kryvex lists what is in the folder; nothing is copied or uploaded.')}
            </p>
          </div>

          {/* The second engine is opt-in and visibly separate: its formats are
              not offered, and nothing is downloaded, while the switch is off. */}
          <div className="emulator-engine">
            <span className="mono emulator-side-label">{t('SECOND ENGINE')}</span>
            <label className="emulator-engine-switch">
              <input
                type="checkbox"
                checked={experimental}
                onChange={event => toggleEngine(event.target.checked)}
              />
              <span>
                <strong>{t('Dreamcast (experimental)')}</strong>
                <span className="mono">{t('Runs on its own engine, off by default.')}</span>
              </span>
            </label>
            {experimental ? (
              <div className="emulator-engine-body">
                <p className="mono">
                  {t(
                    'A pinned WebAssembly build of Flycast, fetched from its own release on first use. It is GPLv2 and is never bundled with Kryvex.',
                  )}
                </p>
                <p className="emulator-engine-state mono">
                  <span
                    className={`emulator-engine-dot is-${engine?.phase ?? 'absent'}`}
                    aria-hidden="true"
                  />
                  {engineLine}
                </p>
                {engine?.phase === 'downloading' && engine.progress ? (
                  <div
                    className="emulator-engine-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={enginePercent}
                    aria-label={t('Downloading the engine… {percent}%', { percent: enginePercent })}
                  >
                    <span style={{ width: `${enginePercent}%` }} />
                  </div>
                ) : null}
                <div className="emulator-engine-actions">
                  {engineInstalled ? (
                    <button className="btn ghost small" onClick={() => void removeEngine()}>
                      {t('Remove the engine')}
                    </button>
                  ) : (
                    <button
                      className="btn primary small"
                      disabled={engineBusy || !desktopEngine || engine?.phase === 'downloading'}
                      onClick={() => void installEngine()}
                    >
                      <Icon name="download" size={13} />{' '}
                      {t('Download the engine ({size})', {
                        size: formatSaveSize(FLYCAST_INSTALL_BYTES),
                      })}
                    </button>
                  )}
                  {engine?.phase === 'downloading' ? (
                    <button className="link" onClick={() => void bridge?.flycastCancel?.()}>
                      {t('Stop the download')}
                    </button>
                  ) : null}
                </div>
                {!desktopEngine ? (
                  <p className="mono">{t('The second engine runs in the desktop app only.')}</p>
                ) : null}
                <p className="mono emulator-engine-credit">
                  {t(
                    'Emulation by Flycast (GPLv2), loaded from its own release and not bundled with Kryvex.',
                  )}{' '}
                  <button
                    className="link"
                    onClick={() => openExternalUrl(FLYCAST_RELEASE.project)}
                  >
                    {t('Source and licence')}
                  </button>
                </p>
              </div>
            ) : null}
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
              {/* The core has no netplay UI of its own, so the screen carries
                  the link's state: one badge over the picture, live only once
                  the two ends are actually running the same cartridge. */}
              {netRole ? (
                <div
                  className={`emulator-link ${netLinked ? 'is-live' : ''}`}
                  role="status"
                  aria-live="polite"
                >
                  <span className="emulator-link-dot" aria-hidden="true" />
                  <strong>{netLinked ? t('LINK LIVE') : t('LINK · WAITING FOR HOST')}</strong>
                  <span className="mono">
                    {netRole === 'host' ? t('Player 1 · host') : t('Player 2 · guest')}
                  </span>
                </div>
              ) : null}
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
              {rom && !running && !hostError && engineFor(rom.system) === 'flycast' && !coreZip ? (
                <div className="emulator-idle">
                  <span className="mono">{t('SECOND ENGINE')}</span>
                  <strong>{t('Starting the second engine…')}</strong>
                  <p>
                    {t(
                      'The core is read from this machine and packed for the screen. Nothing is uploaded.',
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

          {/* Couch co-op: one screen, one seat per player. A seat is claimed by
              pressing a button on its controller, or by choosing a keyset, so a
              second player never has to reach into player 1's settings. */}
          <div className="emulator-couch">
            <span className="mono emulator-side-label">{t('COUCH CO-OP')}</span>
            <p>
              {t(
                'One screen, one seat each. Claim a controller by pressing a button on it, or give a seat its own keys. Two players can share one keyboard: each keeps its own corner.',
              )}
            </p>
            <ul className="emulator-couch-seats">
              {seats.map(seat => (
                <li key={seat.seat} className={seat.device ? 'is-bound' : ''}>
                  <span className="emulator-couch-seat">
                    <strong>{t('Player {number}', { number: seat.seat })}</strong>
                    <em className="mono">
                      {seat.device
                        ? seat.device.kind === 'pad'
                          ? t('Controller {number}', { number: seat.device.index + 1 })
                          : layoutLabel(seat.device.layout)
                        : t('No device yet')}
                    </em>
                  </span>
                  <span className="emulator-couch-actions">
                    <button
                      className="link"
                      onClick={() => setClaiming(current => (current === seat.seat ? null : seat.seat))}
                      aria-pressed={claiming === seat.seat}
                    >
                      {claiming === seat.seat ? t('Press a button…') : t('Use a controller')}
                    </button>
                    <select
                      className="emulator-couch-keys"
                      value={seat.device?.kind === 'keyboard' ? seat.device.layout : ''}
                      aria-label={t('Keys for player {number}', { number: seat.seat })}
                      onChange={event => {
                        const layout = event.target.value as KeyboardLayout | '';
                        setSeats(current =>
                          layout
                            ? claimSeat(
                                current,
                                seat.seat,
                                { kind: 'keyboard', layout },
                                `Player ${seat.seat}`,
                                seat.owner,
                              )
                            : releaseSeat(current, seat.seat),
                        );
                        // A seat already handed to a member is re-sent, so their
                        // own panel shows the keys the host just chose.
                        if (layout && seat.owner !== 'local' && party.status === 'joined') {
                          void partySession.sendNetplay({
                            kind: 'seat',
                            seat: seat.seat,
                            descriptor: `keyboard:${layout}`,
                            target: seat.owner,
                            name: seat.name,
                          });
                        }
                      }}
                    >
                      <option value="">{t('Keyboard…')}</option>
                      {keyboardLayouts().map(layout => (
                        <option key={layout} value={layout}>
                          {layoutLabel(layout)}
                        </option>
                      ))}
                    </select>
                    {party.status === 'joined' ? (
                      <select
                        className="emulator-couch-keys"
                        value={seat.owner === 'local' ? '' : seat.owner}
                        aria-label={t('Who plays in seat {number}', { number: seat.seat })}
                        onChange={event => {
                          const owner = event.target.value;
                          const peer = party.peers.find(item => item.id === owner);
                          handSeat(seat.seat, owner || 'local', peer?.name ?? '');
                        }}
                      >
                        <option value="">{t('This PC')}</option>
                        {party.peers
                          .filter(peer => !peer.self)
                          .map(peer => (
                            <option key={peer.id} value={peer.id}>
                              {peer.name}
                            </option>
                          ))}
                      </select>
                    ) : null}
                    {seat.device ? (
                      <button
                        className="link"
                        onClick={() => setSeats(current => releaseSeat(current, seat.seat))}
                      >
                        {t('Free seat')}
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            {remoteSeats.length > 0 ? (
              <ul className="emulator-couch-remote">
                <li className="mono">{t('IN THE ROOM')}</li>
                {remoteSeats
                  .slice()
                  .sort((a, b) => a.seat - b.seat)
                  .map(claim => (
                    <li key={claim.peerId} className="mono">
                      {t('Player {number}', { number: claim.seat })} · {claim.name}
                      {claim.descriptor.startsWith('keyboard:')
                        ? ` · ${layoutLabel(claim.descriptor.slice(9) as KeyboardLayout)}`
                        : ''}
                    </li>
                  ))}
              </ul>
            ) : null}
            {party.control ? (
              <p className="mono emulator-couch-control">
                {party.control.state === 'granted'
                  ? t('{name} has control of this screen and plays as player {number}.', {
                      name: party.control.name,
                      // No seat yet means the first free one, which is where the
                      // first keypress will land whenever a controller already
                      // holds a seat — naming 2 unconditionally told a viewer
                      // they were player 2 while player 2's pad sat beside her.
                      number:
                        seats.find(seat => seat.owner === party.control?.peerId)?.seat ??
                        firstFreeSeat(seats)?.seat ??
                        2,
                    })
                  : t('{name} is asking to control this screen.', { name: party.control.name })}
                {party.control.state === 'requested' ? (
                  <button className="link" onClick={() => partySession.grantControl()}>
                    {t('Allow')}
                  </button>
                ) : null}
                {party.control.state === 'granted' ? (
                  <button className="link" onClick={() => partySession.revokeControl()}>
                    {t('Take control back')}
                  </button>
                ) : null}
              </p>
            ) : null}
            {claiming !== null ? (
              <p className="mono emulator-couch-armed">
                {t('Press any button on the controller for player {number}.', {
                  number: claiming,
                })}
              </p>
            ) : null}
            <p className="mono emulator-couch-note">
              {couchIsActive(seats)
                ? t('Seats travel with link play: every machine sees all four players.')
                : t('Link play carries the seats. A seat with no device stays free for another player.')}
            </p>
          </div>

          <div className="emulator-netplay">
            <span className="mono emulator-side-label">{t('LINK PLAY')}</span>
            {netRole ? (
              <>
                <p className="mono emulator-netplay-role">
                  {netRole === 'host' ? t('Player 1 · host') : t('Player 2 · guest')}
                  {party.roomId ? ` · ${party.roomId.slice(0, 6)}…` : ''}
                </p>
                {netNote ? <p>{netNote}</p> : null}
                <div className="emulator-netplay-actions">
                  {netRole === 'guest' && !netLinked ? (
                    <button className="btn secondary small" onClick={askAgain}>
                      {t('Ask again')}
                    </button>
                  ) : null}
                  <button className="btn ghost small" onClick={() => stopNetplay(t('Link play ended.'))}>
                    <Icon name="close" size={12} /> {t('End link play')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  {t(
                    'Two machines, one cartridge: the host sends the game, both seats play through the same room, and the host’s save state keeps the two cores together. Player 2 needs a controller; the host can use the keyboard.',
                  )}
                </p>
                {rom && isDiscSystem(rom.system) ? (
                  // A disc image cannot cross the room link: the checkpoint
                  // channel caps a cartridge at 16 MB, so the honest answer is
                  // to point at the engine that synchronises input instead.
                  <p className="mono emulator-netplay-hint">
                    {t(
                      'A disc is too large for this link. Use NETPLAY (RETROARCH) below: both machines need the same image, and it synchronises the two cores frame by frame.',
                    )}
                  </p>
                ) : null}
                {party.status === 'joined' ? (
                  <div className="emulator-netplay-actions">
                    <button
                      className="btn secondary small"
                      disabled={!rom || !running}
                      onClick={startHosting}
                    >
                      <Icon name="play" size={12} /> {t('Host this cartridge')}
                    </button>
                    <button className="btn ghost small" onClick={startJoining}>
                      {t('Join as player 2')}
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="mono">{t('No room is open. Rooms is the link between the two machines.')}</p>
                    <button className="link" onClick={onOpenRooms}>
                      {t('Open Rooms')} <Icon name="back" size={11} />
                    </button>
                  </>
                )}
                {netNote ? <p>{netNote}</p> : null}
              </>
            )}
          </div>

          {/* Netplay that is actually frame-synchronised runs on RetroArch. It
              is a separate program the user installs, so the panel offers to
              find it and start it — never to download it. */}
          <div className="emulator-netplay">
            <span className="mono emulator-side-label">{t('NETPLAY (RETROARCH)')}</span>
            <p>
              {t(
                'Frame-synchronised netplay runs on RetroArch, which you install and keep. Kryvex starts it for you and never downloads or bundles it. Both machines need the same game and the same core.',
              )}
            </p>
            {!desktopNetplay ? (
              <p className="mono">{t('Netplay runs in the desktop app only.')}</p>
            ) : (
              <>
                <p className="mono emulator-netplay-role">
                  {retro?.found
                    ? t('RetroArch: {path}', { path: retro.directory ?? '' })
                    : t('RetroArch was not found on this machine.')}
                </p>
                <div className="emulator-netplay-actions">
                  <button className="btn ghost small" onClick={() => void locateRetroarch()}>
                    <Icon name="folder" size={12} />{' '}
                    {retro?.found ? t('Choose another copy') : t('Locate RetroArch')}
                  </button>
                  {retro?.session ? (
                    <button className="btn ghost small" onClick={() => void stopRetroarch()}>
                      <Icon name="close" size={12} /> {t('Stop netplay')}
                    </button>
                  ) : null}
                </div>
                {retroCore && !retroCore.present ? (
                  <p className="mono">
                    {t(
                      'The core for {system} is missing: add {file} from RetroArch’s own core updater.',
                      { system: rom ? systemLabel(rom.system) : '', file: retroCore.file },
                    )}
                  </p>
                ) : null}
                {retro?.session ? (
                  <p>
                    {retro.session.role === 'host'
                      ? t('Hosting. The other player enters {address}.', {
                          address: retro.localAddress ?? '',
                        })
                      : t('Joined {address}.', { address: retro.session.address ?? '' })}
                  </p>
                ) : (
                  <>
                    <input
                      className="mono emulator-netplay-address"
                      value={joinAddress}
                      onChange={event => setJoinAddress(event.target.value)}
                      placeholder={t('e.g. 192.168.1.20:55435')}
                      aria-label={t('Host address')}
                      spellCheck={false}
                    />
                    <div className="emulator-netplay-actions">
                      <button
                        className="btn secondary small"
                        disabled={!rom || !retro?.found || !retroCore?.present || retroBusy}
                        onClick={() => void startRetroarch('host')}
                      >
                        <Icon name="play" size={12} /> {t('Host with RetroArch')}
                      </button>
                      <button
                        className="btn ghost small"
                        disabled={
                          !rom || !retro?.found || !retroCore?.present || retroBusy || !joinAddress.trim()
                        }
                        onClick={() => void startRetroarch('join')}
                      >
                        {t('Join with RetroArch')}
                      </button>
                    </div>
                  </>
                )}
                {retroNote ? <p className="mono">{retroNote}</p> : null}
                {retro?.log?.length && (retro.phase === 'exited' || retro.error) ? (
                  // A session that ends on its own says why in its own log, and
                  // that log is the only place a netplay refusal appears.
                  <details className="emulator-netplay-log">
                    <summary className="mono">{t('RetroArch said')}</summary>
                    {retro.log.slice(-6).map((line, index) => (
                      <p className="mono" key={`${index}-${line.slice(0, 16)}`}>
                        {line}
                      </p>
                    ))}
                  </details>
                ) : null}
                <p className="mono emulator-netplay-hint">
                  {t(
                    'The host may have to allow TCP {port} through the firewall, and forward it on the router for a player outside the network. RetroArch opens in its own window; Kryvex stops it when you quit.',
                    { port: String(retro?.defaultPort ?? 55435) },
                  )}
                </p>
              </>
            )}
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
