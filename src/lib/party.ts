import { joinRoom, selfId, type Room } from '@trystero-p2p/torrent';
import type { PartySettings } from '../types';
import {
  clampChatHistory,
  pickPeerColor,
  sanitizeChatText,
  sanitizeDisplayName,
  shortPeerId,
} from './party-rules';
import { sanitizeVlanShare } from './vlan-rules';
import type { VlanEngine } from '../types';
import { sanitizePad, type NetplayPad } from './netplay';

/**
 * Rooms session.
 *
 * Signaling (SDP and ICE) travels over public WebTorrent trackers; chat,
 * presence, control events and screen video go peer-to-peer over WebRTC. No
 * Kryvex service is in the path and there is no account. A room id is the whole
 * capability.
 *
 * There is exactly one session for the application (`partySession` at the
 * bottom). It is not owned by the Rooms view: switching to another service must
 * not leave the room, and coming back must show the same membership and the same
 * chat, including everything said while the view was closed.
 */

export interface PartyPeer {
  id: string;
  name: string;
  color: string;
  sharing: boolean;
  self: boolean;
}

export interface PartyMessage {
  id: string;
  peerId: string;
  name: string;
  color: string;
  text: string;
  at: number;
}

export interface PartyState {
  status: 'idle' | 'joining' | 'joined' | 'error';
  roomId: string | null;
  selfId: string;
  selfName: string;
  selfColor: string;
  peers: PartyPeer[];
  messages: PartyMessage[];
  /** Whoever is sharing right now, and their live stream. */
  share: { peerId: string; name: string; stream: MediaStream } | null;
  /** The local capture, shown as a preview and muted on every client. */
  local: { label: string; stream: MediaStream } | null;
  /**
   * Remote control of the shared source. It is off until the host grants it to
   * a named peer, and granting never happens because a share started.
   */
  control: { peerId: string; name: string; state: 'requested' | 'granted' } | null;
  /**
   * Virtual LAN addresses members chose to publish, keyed by peer id. Kryvex
   * does not create the network and never dials these: a member copies one into
   * a compatible game or service by hand.
   */
  vlan: Record<string, { ip: string; engine: VlanEngine }>;
  /** The address this client published, so the panel can offer to withdraw it. */
  myVlan: { ip: string; engine: VlanEngine } | null;
  error: string | null;
}

/** Pointer and key events forwarded to the host while control is granted. */
export interface InputEvent {
  kind: 'move' | 'down' | 'up' | 'key' | 'wheel';
  /** Normalised 0-1 coordinates inside the shared frame. */
  x?: number;
  y?: number;
  button?: 'left' | 'right' | 'middle';
  key?: string;
  deltaY?: number;
}

// Actions are JSON payloads, so each shape carries an index signature.
interface HelloPayload {
  [key: string]: string;
  name: string;
  color: string;
}

interface ChatPayload {
  [key: string]: string | number;
  text: string;
  at: number;
}

interface PresencePayload {
  [key: string]: boolean;
  sharing: boolean;
}

interface ControlPayload {
  [key: string]: string;
  action: 'request' | 'grant' | 'revoke';
  name: string;
}

interface InputPayload {
  [key: string]: string | number;
  kind: string;
  x: number;
  y: number;
  button: string;
  key: string;
  deltaY: number;
}

interface ShareMeta {
  kind?: string;
  label?: string;
}

/** One published virtual address. `ip` is empty when a member withdraws it. */
interface VlanPayload {
  [key: string]: string;
  ip: string;
  engine: string;
}

/**
 * Netplay rides the same room as chat and the share. One action carries every
 * frame kind so ordering is preserved and a late hello cannot overtake a ROM
 * chunk from the same sender.
 */
interface NetplayPayload {
  [key: string]: string | number;
  kind: string;
  role: string;
  name: string;
  gameKey: string;
  system: string;
  gameName: string;
  seq: number;
  total: number;
  data: string;
  buttons: number;
  axesX: number;
  axesY: number;
}

export interface NetplayMessage {
  /**
   * `hello` announces a seat, `ask` asks the host to send the cartridge again,
   * and `rom`/`state`/`pad`/`bye` carry the session itself.
   */
  kind: 'hello' | 'ask' | 'rom' | 'pad' | 'state' | 'bye';
  role: 'host' | 'guest' | '';
  name: string;
  gameKey: string;
  system: string;
  gameName: string;
  seq: number;
  total: number;
  data: string;
  pad: NetplayPad;
  peerId: string;
}

const APP_ID = 'kryvex-rooms-v1';

const EMPTY: PartyState = {
  status: 'idle',
  roomId: null,
  selfId,
  selfName: '',
  selfColor: pickPeerColor(selfId),
  peers: [],
  messages: [],
  share: null,
  local: null,
  control: null,
  vlan: {},
  myVlan: null,
  error: null,
};

function fallbackName(id: string): string {
  return `Guest ${shortPeerId(id)}`;
}

export class PartySession {
  private state: PartyState = { ...EMPTY, peers: [] };
  private listeners = new Set<() => void>();
  private room: Room | null = null;
  private sendHello: ((payload: HelloPayload) => Promise<void>) | null = null;
  private sendChat: ((payload: ChatPayload) => Promise<void>) | null = null;
  private sendPresence: ((payload: PresencePayload) => Promise<void>) | null = null;
  private sendControl: ((payload: ControlPayload) => Promise<void>) | null = null;
  private sendInput: ((payload: InputPayload) => Promise<void>) | null = null;
  private sendNetplayAction: ((payload: NetplayPayload) => Promise<void>) | null = null;
  private sendVlan: ((payload: VlanPayload) => Promise<void>) | null = null;
  private names = new Map<string, HelloPayload>();
  private sharing = new Set<string>();
  private lastRoom: { id: string; settings: PartySettings; name: string } | null = null;
  /**
   * Host-side sink for an input event from the peer that was granted control.
   * The view installs it; the session never injects input by itself.
   */
  onInput: ((event: InputEvent) => void) | null = null;
  /** Sink for a link-play frame; a view without an emulator ignores it. */
  onNetplay: ((message: NetplayMessage) => void) | null = null;

  getSnapshot = (): PartyState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<PartyState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private peerList(): PartyPeer[] {
    const peers: PartyPeer[] = [
      {
        id: selfId,
        name: this.state.selfName,
        color: this.state.selfColor,
        sharing: Boolean(this.state.local),
        self: true,
      },
    ];
    for (const [id, hello] of this.names) {
      peers.push({
        id,
        name: hello.name,
        color: hello.color,
        sharing: this.sharing.has(id),
        self: false,
      });
    }
    return peers;
  }

  private refreshPeers(): void {
    this.set({ peers: this.peerList() });
  }

  join(roomId: string, settings: PartySettings, name: string): void {
    this.leave();
    const display = sanitizeDisplayName(name) || fallbackName(selfId);
    const color = settings.color || pickPeerColor(selfId);
    this.set({ status: 'joining', roomId, selfName: display, selfColor: color, error: null });

    try {
      const room = joinRoom(
        {
          appId: APP_ID,
          relayConfig: settings.trackers.length > 0 ? { urls: settings.trackers } : undefined,
          rtcConfig: {
            iceServers: settings.iceServers.map(url => ({ urls: url })),
          },
        },
        roomId,
        {
          onJoinError: details => {
            this.set({
              status: 'error',
              error: details?.error || 'The room relay refused the connection.',
            });
          },
        },
      );
      this.room = room;

      const hello = room.makeAction<HelloPayload>('hello', {
        onMessage: (payload, context) => {
          const name = sanitizeDisplayName(payload?.name) || fallbackName(context.peerId);
          const color =
            typeof payload?.color === 'string' && /^#[0-9a-f]{6}$/i.test(payload.color)
              ? payload.color
              : pickPeerColor(context.peerId);
          this.names.set(context.peerId, { name, color });
          this.refreshPeers();
        },
      });
      const chat = room.makeAction<ChatPayload>('chat', {
        onMessage: (payload, context) => {
          const text = sanitizeChatText(payload?.text);
          if (!text) return;
          const at = Number.isFinite(payload?.at) ? Number(payload.at) : Date.now();
          const id = `${context.peerId}-${at}`;
          // A reconnect can redeliver a message that is already in the log.
          if (this.state.messages.some(item => item.id === id)) return;
          const who = this.names.get(context.peerId);
          const message: PartyMessage = {
            id,
            peerId: context.peerId,
            name: who?.name ?? fallbackName(context.peerId),
            color: who?.color ?? pickPeerColor(context.peerId),
            text,
            at,
          };
          this.set({ messages: clampChatHistory([...this.state.messages, message]) });
        },
      });
      const presence = room.makeAction<PresencePayload>('presence', {
        onMessage: (payload, context) => {
          if (payload?.sharing) this.sharing.add(context.peerId);
          else {
            this.sharing.delete(context.peerId);
            if (this.state.share?.peerId === context.peerId) this.set({ share: null });
          }
          this.refreshPeers();
        },
      });
      const control = room.makeAction<ControlPayload>('control', {
        onMessage: (payload, context) => {
          const who = this.names.get(context.peerId)?.name ?? fallbackName(context.peerId);
          if (payload?.action === 'request') {
            // A request is only meaningful while this client is sharing.
            if (!this.state.local) return;
            this.set({ control: { peerId: context.peerId, name: who, state: 'requested' } });
            return;
          }
          if (payload?.action === 'grant') {
            // Only the host grants; a grant from anyone else is ignored.
            if (!this.state.local) return;
            this.set({ control: { peerId: context.peerId, name: who, state: 'granted' } });
            return;
          }
          this.set({ control: null });
        },
      });
      const netplay = room.makeAction<NetplayPayload>('netplay', {
        onMessage: (payload, context) => {
          const kind = payload?.kind;
          if (
            kind !== 'hello' &&
            kind !== 'ask' &&
            kind !== 'rom' &&
            kind !== 'pad' &&
            kind !== 'state' &&
            kind !== 'bye'
          ) {
            return;
          }
          this.onNetplay?.(
            {
              kind,
              role:
                payload?.role === 'host' || payload?.role === 'guest' ? payload.role : '',
              name: typeof payload?.name === 'string' ? payload.name.slice(0, 40) : '',
              gameKey: typeof payload?.gameKey === 'string' ? payload.gameKey.slice(0, 120) : '',
              system: typeof payload?.system === 'string' ? payload.system.slice(0, 24) : '',
              gameName:
                typeof payload?.gameName === 'string' ? payload.gameName.slice(0, 120) : '',
              seq: Number.isFinite(payload?.seq) ? Math.max(0, Math.floor(Number(payload.seq))) : 0,
              total: Number.isFinite(payload?.total)
                ? Math.max(0, Math.floor(Number(payload.total)))
                : 0,
              // A state or ROM frame is capped so one sender cannot pour
              // unbounded memory into a receiver that never asked for it.
              data: typeof payload?.data === 'string' ? payload.data.slice(0, 200_000) : '',
              pad: sanitizePad(payload),
              peerId: context.peerId,
            },
          );
        },
      });
      const input = room.makeAction<InputPayload>('input', {
        onMessage: (payload, context) => {
          // Input is accepted only from the peer this client granted control to.
          if (this.state.control?.state !== 'granted') return;
          if (this.state.control.peerId !== context.peerId) return;
          const kind = payload?.kind;
          if (kind !== 'move' && kind !== 'down' && kind !== 'up' && kind !== 'key' && kind !== 'wheel') {
            return;
          }
          this.onInput?.({
            kind,
            x: Number(payload?.x) || 0,
            y: Number(payload?.y) || 0,
            button: (payload?.button as InputEvent['button']) || 'left',
            key: typeof payload?.key === 'string' ? payload.key.slice(0, 40) : '',
            deltaY: Number(payload?.deltaY) || 0,
          });
        },
      });

      // Virtual LAN addresses. A member publishes one by hand; the action
      // carries text only, so a peer can never hand this client something to
      // dial, and the address is validated again on the way in.
      const vlan = room.makeAction<VlanPayload>('vlan', {
        onMessage: (payload, context) => {
          const share = sanitizeVlanShare(payload);
          const map = { ...this.state.vlan };
          if (share) map[context.peerId] = share;
          else delete map[context.peerId];
          this.set({ vlan: map });
        },
      });

      this.sendHello = payload => hello.send(payload);
      this.sendChat = payload => chat.send(payload);
      this.sendPresence = payload => presence.send(payload);
      this.sendControl = payload => control.send(payload);
      this.sendInput = payload => input.send(payload);
      this.sendNetplayAction = payload => netplay.send(payload);
      this.sendVlan = payload => vlan.send(payload);

      room.onPeerJoin = peerId => {
        this.names.set(peerId, {
          name: fallbackName(peerId),
          color: pickPeerColor(peerId),
        });
        this.refreshPeers();
        void this.sendHello?.({ name: display, color });
        // A member who joins after an address was published never saw it; send
        // it again for this one peer so the panel is complete for them too.
        const mine = this.state.myVlan;
        if (mine) void this.sendVlan?.({ ip: mine.ip, engine: mine.engine });
        // Late join: a peer that arrives after sharing began never received the
        // stream, because it was added before that peer existed. Re-add it for
        // this one peer, so the streamer does not have to restart the share.
        // Trystero renegotiates with every connected peer, so the peers that
        // already had the stream simply receive the same tracks again; the one
        // that just joined gets them for the first time.
        const local = this.state.local;
        if (local) {
          void Promise.all(room.addStream(local.stream, { metadata: { kind: 'screen', label: local.label } }))
            .then(() => this.sendPresence?.({ sharing: true }))
            .catch(() => undefined);
        }
      };
      room.onPeerLeave = peerId => {
        this.names.delete(peerId);
        this.sharing.delete(peerId);
        const vlan = { ...this.state.vlan };
        delete vlan[peerId];
        this.set({
          share: this.state.share?.peerId === peerId ? null : this.state.share,
          // A peer that drops loses whatever control it had.
          control: this.state.control?.peerId === peerId ? null : this.state.control,
          // ...and its address leaves with it.
          vlan,
        });
        this.refreshPeers();
      };
      room.onPeerStream = (stream, peerId, metadata) => {
        const meta = (metadata ?? {}) as ShareMeta;
        const who = this.names.get(peerId)?.name ?? fallbackName(peerId);
        this.sharing.add(peerId);
        this.set({ share: { peerId, name: who, stream } });
        this.refreshPeers();
        void meta;
      };

      this.set({ status: 'joined' });
      // The roster starts with you; waiting for the first peer event would
      // leave a fresh room looking empty.
      this.refreshPeers();
      void this.sendHello({ name: display, color });
      this.lastRoom = { id: roomId, settings, name: display };
    } catch (error) {
      this.room = null;
      this.set({
        status: 'error',
        error: error instanceof Error ? error.message : 'The room could not be opened.',
      });
    }
  }

  send(text: string): boolean {
    const body = sanitizeChatText(text);
    if (!body || !this.sendChat) return false;
    const message: PartyMessage = {
      id: `self-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      peerId: selfId,
      name: this.state.selfName,
      color: this.state.selfColor,
      text: body,
      at: Date.now(),
    };
    this.set({ messages: clampChatHistory([...this.state.messages, message]) });
    void this.sendChat({ text: body, at: message.at });
    return true;
  }

  async startShare(stream: MediaStream, label: string): Promise<void> {
    if (!this.room) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    this.set({ local: { label, stream } });
    this.refreshPeers();
    try {
      await Promise.all(this.room.addStream(stream, { metadata: { kind: 'screen', label } }));
      void this.sendPresence?.({ sharing: true });
    } catch (error) {
      stream.getTracks().forEach(track => track.stop());
      this.set({
        local: null,
        error: error instanceof Error ? error.message : 'The share could not start.',
      });
      this.refreshPeers();
    }
  }

  stopShare(): void {
    const local = this.state.local;
    if (!local) return;
    if (this.room) {
      try {
        this.room.removeStream(local.stream);
        void this.sendPresence?.({ sharing: false });
      } catch {
        /* the room may already be closed */
      }
    }
    local.stream.getTracks().forEach(track => track.stop());
    this.set({ local: null, control: null });
    this.refreshPeers();
  }

  /** Mute or unmute the captured audio for everyone without stopping video. */
  setShareAudioEnabled(enabled: boolean): boolean {
    const local = this.state.local;
    if (!local) return false;
    let touched = false;
    for (const track of local.stream.getAudioTracks()) {
      track.enabled = enabled;
      touched = true;
    }
    return touched;
  }

  hasShareAudio(): boolean {
    return (this.state.local?.stream.getAudioTracks().length ?? 0) > 0;
  }

  /**
   * Publish this machine's virtual address to the room.
   *
   * The caller passes what the main process already read off the adapter; no
   * path here can invent one, and nothing is connected to. `false` means the
   * address was not showable or the room is closed.
   */
  shareVlan(ip: string, engine: VlanEngine): boolean {
    const share = sanitizeVlanShare({ ip, engine });
    if (!share || !this.sendVlan) return false;
    this.set({ myVlan: share });
    void this.sendVlan({ ip: share.ip, engine: share.engine });
    return true;
  }

  /** Withdraw it from everyone else without leaving the room. */
  stopVlan(): boolean {
    if (!this.state.myVlan) return false;
    this.set({ myVlan: null });
    void this.sendVlan?.({ ip: '', engine: '' });
    return true;
  }

  requestControl(): boolean {
    if (this.state.local) return false; // the host does not ask itself
    if (!this.state.share) return false;
    void this.sendControl?.({ action: 'request', name: this.state.selfName });
    return true;
  }

  /** Host only: allow the peer that asked, and only while sharing. */
  grantControl(): boolean {
    const control = this.state.control;
    if (!control || control.state === 'granted' || !this.state.local) return false;
    this.set({ control: { ...control, state: 'granted' } });
    void this.sendControl?.({ action: 'grant', name: control.name });
    return true;
  }

  revokeControl(): void {
    if (!this.state.control) return;
    this.set({ control: null });
    void this.sendControl?.({ action: 'revoke', name: '' });
  }

  /** Viewer side: forward one input event to the host that granted control. */
  forwardInput(event: InputEvent): void {
    if (this.state.control?.state !== 'granted') return;
    if (!this.state.share) return;
    void this.sendInput?.({
      kind: event.kind,
      x: Math.min(1, Math.max(0, event.x ?? 0)),
      y: Math.min(1, Math.max(0, event.y ?? 0)),
      button: event.button ?? 'left',
      key: event.key ?? '',
      deltaY: event.deltaY ?? 0,
    });
  }

  /**
   * One link-play frame. The room is the session, so this is a no-op until a
   * room is joined and the transport is ready.
   */
  async sendNetplay(
    payload: Partial<NetplayMessage> & { kind: NetplayMessage['kind'] },
  ): Promise<boolean> {
    if (!this.sendNetplayAction) return false;
    const pad = sanitizePad(payload.pad);
    // Awaited by the caller so numbered chunks leave in order; the pad only
    // needs the promise to exist, not its result.
    await this.sendNetplayAction({
      kind: payload.kind,
      role: payload.role ?? '',
      name: payload.name ?? '',
      gameKey: payload.gameKey ?? '',
      system: payload.system ?? '',
      gameName: payload.gameName ?? '',
      seq: payload.seq ?? 0,
      total: payload.total ?? 0,
      data: payload.data ?? '',
      buttons: pad.buttons,
      axesX: pad.axesX,
      axesY: pad.axesY,
    });
    return true;
  }

  /**
   * Rejoin after a relay failure. The room id and the chat log are kept: a
   * transient drop must not throw away the conversation or make the user join
   * by hand again.
   */
  reconnect(): boolean {
    if (!this.lastRoom) return false;
    const { id, settings, name } = this.lastRoom;
    const messages = this.state.messages;
    this.join(id, settings, name);
    this.set({ messages });
    return true;
  }

  leave(): void {
    const local = this.state.local;
    if (local) local.stream.getTracks().forEach(track => track.stop());
    if (this.room) {
      try {
        this.room.leave();
      } catch {
        /* already closed */
      }
    }
    this.room = null;
    this.sendHello = null;
    this.sendChat = null;
    this.sendPresence = null;
    this.sendControl = null;
    this.sendInput = null;
    this.sendNetplayAction = null;
    this.sendVlan = null;
    this.names.clear();
    this.sharing.clear();
    this.lastRoom = null;
    this.set({
      status: 'idle',
      roomId: null,
      peers: [],
      // Leaving is the one action that ends the room for this client, and with
      // it the history: a room that nobody is in is gone.
      messages: [],
      share: null,
      local: null,
      control: null,
      // A withdrawn room keeps no addresses: they belonged to the people in it.
      vlan: {},
      myVlan: null,
      error: null,
    });
  }
}

/**
 * One session for the whole application, not one per view.
 *
 * A room is a live connection: rebuilding it because the user looked at another
 * service would drop the membership, the chat log and any incoming stream. The
 * view subscribes to this singleton and never leaves on unmount; leaving is an
 * explicit action.
 */
export const partySession = new PartySession();
