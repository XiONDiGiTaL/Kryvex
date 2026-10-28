/**
 * Rooms rules: everything that can be decided without a network or a DOM.
 *
 * A room id is a capability, not an identity: whoever has it can join. Nothing
 * here talks to a server, so the UI, the store and the tests all share one
 * definition of what a valid room, name, message, tracker list or invite looks
 * like.
 */

/** Crockford base32 without the ambiguous letters. 26 chars ≈ 130 bits. */
export const ROOM_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
export const ROOM_ID_LENGTH = 26;
export const MAX_DISPLAY_NAME = 24;
export const MAX_CHAT_TEXT = 2000;
export const MAX_CHAT_MESSAGES = 300;
export const MAX_RECENT_ROOMS = 6;
export const MAX_TRACKERS = 6;

/**
 * Public WebTorrent trackers used only to exchange WebRTC offers and answers.
 * Chat, files and screen video never pass through them.
 */
export const DEFAULT_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.btorrent.xyz',
];

/** Public STUN is enough on most home networks; TURN is a later opt-in. */
export const DEFAULT_ICE_SERVERS = ['stun:stun.l.google.com:19302'];

export const PEER_COLORS = [
  '#38BDF8',
  '#2DD4BF',
  '#A78BFA',
  '#FBBF24',
  '#FB7185',
  '#4ADE80',
  '#F472B6',
  '#94A3B8',
];

/** Exactly ROOM_ALPHABET × ROOM_ID_LENGTH; i, l, o and u never appear. */
const ROOM_PATTERN = new RegExp(`^[${ROOM_ALPHABET}]{${ROOM_ID_LENGTH}}$`);

function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < size; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return bytes;
}

/** 26 Crockford characters from fresh randomness; a test can inject bytes. */
export function newRoomId(source?: (size: number) => Uint8Array): string {
  const bytes = (source ?? randomBytes)(ROOM_ID_LENGTH);
  let id = '';
  for (let index = 0; index < ROOM_ID_LENGTH; index += 1) {
    id += ROOM_ALPHABET[(bytes[index] ?? 0) % ROOM_ALPHABET.length];
  }
  return id;
}

/** Accepts pasted ids with spaces, dashes or capitals; otherwise returns null. */
export function normalizeRoomId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().toLowerCase().replace(/[\s-]+/g, '');
  return ROOM_PATTERN.test(id) ? id : null;
}

export function isRoomId(raw: unknown): boolean {
  return normalizeRoomId(raw) !== null;
}

export function formatInvite(id: string): string {
  const room = normalizeRoomId(id);
  return room ? `kryvex://room/${room}` : '';
}

/**
 * A pasted invite, a bare code or a whole sentence containing the link all
 * resolve to the same room. The first valid id wins.
 */
export function parseInvite(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  const direct = normalizeRoomId(text);
  if (direct) return direct;
  const link = /kryvex:\/\/room\/([a-z0-9\s-]+)/i.exec(text)?.[1];
  const fromLink = link ? normalizeRoomId(link) : null;
  if (fromLink) return fromLink;
  const candidates = text.split(/[^a-z0-9-]+/i).filter(part => part.replace(/-/g, '').length === ROOM_ID_LENGTH);
  for (const candidate of candidates) {
    const id = normalizeRoomId(candidate);
    if (id) return id;
  }
  return null;
}

/** Newlines and tabs collapse to single spaces; control characters disappear. */
export function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DISPLAY_NAME);
}

/** Chat keeps its line breaks but loses other control characters. */
export function sanitizeChatText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHAT_TEXT);
}

export function clampChatHistory<T>(messages: T[]): T[] {
  return messages.length > MAX_CHAT_MESSAGES
    ? messages.slice(messages.length - MAX_CHAT_MESSAGES)
    : messages;
}

function isHttpFreeUrl(value: string): boolean {
  return !/[\s\u0000-\u001f]/.test(value);
}

/** Signaling relays must be WebSocket endpoints; http(s) is rejected. */
export function sanitizeTrackers(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\n,]+/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const url = item.trim();
    // One host only: a second scheme or a path is not a relay endpoint.
    if (!/^wss:\/\/[a-z0-9.\-:[\]]+$/i.test(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
    if (out.length >= MAX_TRACKERS) break;
  }
  return out;
}

/** STUN and TURN only; a malformed entry is dropped, never patched. */
export function sanitizeIceServers(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\n,]+/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const url = item.trim();
    if (!/^(stun|turn)s?:[^\s/]+/i.test(url) || !isHttpFreeUrl(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
    if (out.length >= 4) break;
  }
  return out;
}

export function sanitizeRecentRooms(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const id = normalizeRoomId(item);
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= MAX_RECENT_ROOMS) break;
  }
  return out;
}

/** A stable colour for a peer id, so the same person keeps the same dot. */
export function pickPeerColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100_000;
  }
  return PEER_COLORS[hash % PEER_COLORS.length] ?? PEER_COLORS[0]!;
}

export function initials(name: string): string {
  const parts = sanitizeDisplayName(name).split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]!.charAt(0);
  const second = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : '';
  return `${first}${second}`.toUpperCase().slice(0, 2);
}

/** Short label used for anonymous peers before their hello arrives. */
export function shortPeerId(id: string): string {
  return id.replace(/[^a-z0-9]/gi, '').slice(-5).toUpperCase() || 'PEER';
}

/**
 * Whether the sharer should hear their own capture by default.
 *
 * Chromium mutes the media of a `<webview>` that is captured, so an app share
 * would otherwise go silent for the person sharing it: playing the captured
 * track back to them is the fix. A screen or window share captures the system
 * mix instead, which the sharer is already hearing from the app that produces
 * it. Monitoring that plays every sound twice, a few hundred milliseconds
 * apart — the doubling this rule exists to avoid. The control stays in the
 * panel, so monitoring a screen share is still one click away when someone
 * wants it (a muted output device, for instance).
 */
export function monitorShareByDefault(isAppShare: boolean, hasAudio: boolean): boolean {
  return isAppShare && hasAudio;
}
