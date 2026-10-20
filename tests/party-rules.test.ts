import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ICE_SERVERS,
  DEFAULT_TRACKERS,
  MAX_CHAT_TEXT,
  MAX_TRACKERS,
  PEER_COLORS,
  ROOM_ID_LENGTH,
  clampChatHistory,
  formatInvite,
  initials,
  isRoomId,
  newRoomId,
  normalizeRoomId,
  parseInvite,
  pickPeerColor,
  sanitizeChatText,
  sanitizeDisplayName,
  sanitizeIceServers,
  sanitizeRecentRooms,
  sanitizeTrackers,
  shortPeerId,
} from '../src/lib/party-rules';
import { sanitizeParty, sanitizeState } from '../src/lib/store';
import { starterState } from '../src/lib/services';
import { makeI18n } from '../src/lib/i18n';

describe('room ids', () => {
  it('are long, unambiguous and built from fresh bytes', () => {
    const id = newRoomId();
    expect(id).toHaveLength(ROOM_ID_LENGTH);
    expect(id).toMatch(/^[0-9a-hjkmnp-tv-z]+$/);
    expect(newRoomId()).not.toBe(id);
  });

  it('can be generated deterministically for a test', () => {
    const source = (size: number) => new Uint8Array(size).fill(1);
    expect(newRoomId(source)).toBe('1'.repeat(ROOM_ID_LENGTH));
  });

  it('accepts pasted codes with capitals, spaces and dashes', () => {
    const id = newRoomId();
    const pretty = `${id.slice(0, 6)}-${id.slice(6, 13)} ${id.slice(13).toUpperCase()}`;
    expect(normalizeRoomId(pretty)).toBe(id);
    expect(isRoomId(id)).toBe(true);
  });

  it('rejects everything that is not a full id', () => {
    expect(normalizeRoomId('')).toBeNull();
    expect(normalizeRoomId('short')).toBeNull();
    expect(normalizeRoomId('i'.repeat(ROOM_ID_LENGTH))).toBeNull();
    expect(normalizeRoomId(42)).toBeNull();
    expect(normalizeRoomId(`${newRoomId()}x`)).toBeNull();
  });
});

describe('invites', () => {
  it('round-trip through the kryvex:// link', () => {
    const id = newRoomId();
    const link = formatInvite(id);
    expect(link).toBe(`kryvex://room/${id}`);
    expect(parseInvite(link)).toBe(id);
    expect(parseInvite(`  ${link.toUpperCase()}  `)).toBe(id);
  });

  it('reads a code out of a chat sentence', () => {
    const id = newRoomId();
    expect(parseInvite(`come and watch: kryvex://room/${id} later`)).toBe(id);
    expect(parseInvite(`room ${id}`)).toBe(id);
  });

  it('refuses text without a room', () => {
    expect(parseInvite('hello there')).toBeNull();
    expect(parseInvite('')).toBeNull();
    expect(parseInvite(null)).toBeNull();
    expect(formatInvite('nope')).toBe('');
  });
});

describe('names and chat', () => {
  it('collapses whitespace and strips control characters', () => {
    expect(sanitizeDisplayName('  Ada\u0000  Lovelace \n ')).toBe('Ada Lovelace');
    expect(sanitizeDisplayName('x'.repeat(40))).toHaveLength(24);
    expect(sanitizeDisplayName(5)).toBe('');
  });

  it('keeps line breaks in messages, drops the rest of the controls', () => {
    expect(sanitizeChatText('one\r\ntwo\u0007\n\n\n\nthree')).toBe('one\ntwo\n\nthree');
    expect(sanitizeChatText('   ')).toBe('');
    expect(sanitizeChatText('y'.repeat(MAX_CHAT_TEXT + 50))).toHaveLength(MAX_CHAT_TEXT);
  });

  it('caps the transcript', () => {
    expect(clampChatHistory([1, 2, 3])).toEqual([1, 2, 3]);
    const long = Array.from({ length: 400 }, (_, index) => index);
    const capped = clampChatHistory(long);
    expect(capped).toHaveLength(300);
    expect(capped[capped.length - 1]).toBe(399);
  });
});

describe('relays and ICE', () => {
  it('accepts secure WebSocket relays only, capped and deduped', () => {
    expect(
      sanitizeTrackers([
        'wss://tracker.openwebtorrent.com',
        'wss://tracker.openwebtorrent.com',
        'http://insecure.example',
        'ws://plain.example',
        'wss://a.example',
        'wss://b.example',
        'wss://c.example',
        'wss://d.example',
        'wss://e.example',
      ]),
    ).toEqual([
      'wss://tracker.openwebtorrent.com',
      'wss://a.example',
      'wss://b.example',
      'wss://c.example',
      'wss://d.example',
      'wss://e.example',
    ]);

    expect(sanitizeTrackers('wss://one.example\nnonsense\nwss://two.example')).toEqual([
      'wss://one.example',
      'wss://two.example',
    ]);
    expect(sanitizeTrackers(['wss://x'.repeat(MAX_TRACKERS + 4)])).toEqual([]);
  });

  it('keeps STUN and TURN entries, drops strange schemes', () => {
    expect(
      sanitizeIceServers([
        'stun:stun.l.google.com:19302',
        'turn:relay.example:3478',
        'http://relay.example',
        'stun:stun.l.google.com:19302',
      ]),
    ).toEqual(['stun:stun.l.google.com:19302', 'turn:relay.example:3478']);
    expect(sanitizeIceServers([])).toEqual([]);
  });

  it('ships working defaults', () => {
    expect(DEFAULT_TRACKERS.every(url => url.startsWith('wss://'))).toBe(true);
    expect(DEFAULT_ICE_SERVERS.every(url => url.startsWith('stun:'))).toBe(true);
  });
});

describe('peers', () => {
  it('recent rooms are valid ids in order', () => {
    const a = newRoomId();
    const b = newRoomId();
    expect(sanitizeRecentRooms([a, 'bogus', b, a])).toEqual([a, b]);
    expect(sanitizeRecentRooms('nope')).toEqual([]);
  });

  it('colours are stable and come from the palette', () => {
    const color = pickPeerColor('peer-one');
    expect(PEER_COLORS).toContain(color);
    expect(pickPeerColor('peer-one')).toBe(color);
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('')).toBe('?');
    expect(shortPeerId('abc-def-ghi')).toBe('EFGHI');
  });
});

describe('persisted Rooms settings', () => {
  it('starts empty, with public relays', () => {
    const party = starterState().settings.party;
    expect(party.displayName).toBe('');
    expect(party.trackers).toEqual(DEFAULT_TRACKERS);
    expect(party.iceServers).toEqual(DEFAULT_ICE_SERVERS);
    expect(party.recentRooms).toEqual([]);
  });

  it('drops bad values but keeps the room usable', () => {
    const party = sanitizeParty({
      displayName: '  Ada  ',
      color: 'red',
      trackers: ['http://evil.example'],
      iceServers: ['ftp://nope'],
      recentRooms: [newRoomId(), 'junk'],
    });
    expect(party.displayName).toBe('Ada');
    expect(party.color).toBe('#38BDF8');
    expect(party.trackers).toEqual(DEFAULT_TRACKERS);
    expect(party.iceServers).toEqual(DEFAULT_ICE_SERVERS);
    expect(party.recentRooms).toHaveLength(1);
  });

  it('survives a state round trip', () => {
    const base = starterState();
    const state = sanitizeState({
      ...base,
      settings: {
        ...base.settings,
        party: {
          displayName: 'Ada',
          color: '#A78BFA',
          trackers: ['wss://relay.example'],
          iceServers: ['stun:stun.example:3478'],
          recentRooms: ['abcdefghjkmnpqrstvwxyz0123'],
        },
      },
    });
    expect(state.settings.party.displayName).toBe('Ada');
    expect(state.settings.party.color).toBe('#A78BFA');
    expect(state.settings.party.trackers).toEqual(['wss://relay.example']);
    expect(state.settings.party.recentRooms).toEqual(['abcdefghjkmnpqrstvwxyz0123']);
  });

  it('is translated without renaming the protocol', () => {
    expect(makeI18n('es').t('Rooms')).toBe('Salas');
    expect(makeI18n('de').t('Start a room')).toBe('Raum erstellen');
    expect(makeI18n('fr').t('Share something')).toBe('Partager quelque chose');
    expect(makeI18n('fr').t('WebRTC')).toBe('WebRTC');
  });
});
