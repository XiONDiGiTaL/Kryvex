import { joinRoom, selfId, type Room } from '@trystero-p2p/torrent';
import type { PartySettings } from '../types';
import {
  clampChatHistory,
  pickPeerColor,
  sanitizeChatText,
  sanitizeDisplayName,
  shortPeerId,
} from './party-rules';

/**
 * Rooms session.
 *
 * Signaling (SDP and ICE) travels over public WebTorrent trackers; chat,
 * presence and screen video go peer-to-peer over WebRTC. No Kryvex service is
 * in the path and there is no account. A room id is the whole capability.
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
  error: string | null;
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

interface ShareMeta {
  kind?: string;
  label?: string;
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
  private names = new Map<string, HelloPayload>();
  private sharing = new Set<string>();

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
          const who = this.names.get(context.peerId);
          const message: PartyMessage = {
            id: `${context.peerId}-${payload.at ?? Date.now()}`,
            peerId: context.peerId,
            name: who?.name ?? fallbackName(context.peerId),
            color: who?.color ?? pickPeerColor(context.peerId),
            text,
            at: Number.isFinite(payload?.at) ? Number(payload.at) : Date.now(),
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

      this.sendHello = payload => hello.send(payload);
      this.sendChat = payload => chat.send(payload);
      this.sendPresence = payload => presence.send(payload);

      room.onPeerJoin = peerId => {
        this.names.set(peerId, {
          name: fallbackName(peerId),
          color: pickPeerColor(peerId),
        });
        this.refreshPeers();
        void this.sendHello?.({ name: display, color });
      };
      room.onPeerLeave = peerId => {
        this.names.delete(peerId);
        this.sharing.delete(peerId);
        this.set({
          share: this.state.share?.peerId === peerId ? null : this.state.share,
        });
        this.refreshPeers();
      };
      room.onPeerStream = (stream, peerId, metadata) => {
        const meta = (metadata ?? {}) as ShareMeta;
        const who = this.names.get(peerId)?.name ?? fallbackName(peerId);
        this.sharing.add(peerId);
        this.set({
          share: { peerId, name: who, stream },
          messages: this.state.messages,
        });
        this.refreshPeers();
        void meta;
      };

      this.set({ status: 'joined' });
      // The roster starts with you; waiting for the first peer event would
      // leave a fresh room looking empty.
      this.refreshPeers();
      void this.sendHello({ name: display, color });
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
    this.set({ local: null });
    this.refreshPeers();
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
    this.names.clear();
    this.sharing.clear();
    this.set({
      status: 'idle',
      roomId: null,
      peers: [],
      messages: [],
      share: null,
      local: null,
      error: null,
    });
  }
}
