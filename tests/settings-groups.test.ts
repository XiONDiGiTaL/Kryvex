import { describe, expect, it } from 'vitest';
import {
  sanitizeEmulator,
  sanitizeHome,
  sanitizeResources,
  sanitizeState,
  sanitizeVpn,
} from '../src/lib/store';

describe('new settings groups', () => {
  it('fills defaults for an older state file', () => {
    const state = sanitizeState({ settings: { density: 'compact' } });
    expect(state.settings.searchRegion).toBe('global');
    expect(state.settings.home.showBoard).toBe(true);
    expect(state.settings.home.notes).toEqual([]);
    expect(state.settings.resources).toEqual({ enabled: false, sidebar: true });
    expect(state.settings.vpn.enabled).toBe(false);
    expect(state.settings.emulator.system).toBe('nes');
    expect(state.settings.emulator.gamepad).toBe(true);
  });

  it('clamps the Home board to a small widget', () => {
    const home = sanitizeHome({
      showBoard: false,
      city: '  Reykjavík  ',
      latitude: 64.14,
      longitude: -21.94,
      unit: 'f',
      notes: [
        { id: 'n-1', text: 'Water the plants', done: false, createdAt: 1 },
        { id: 'n-2', text: '', done: false, createdAt: 2 },
        { id: 'n-3', text: 'x'.repeat(400), done: true, createdAt: 3 },
      ],
    });
    expect(home.showBoard).toBe(false);
    expect(home.city).toBe('Reykjavík');
    expect(home.latitude).toBe(64.14);
    expect(home.unit).toBe('f');
    expect(home.notes).toHaveLength(2);
    expect(home.notes[1]?.text).toHaveLength(160);
    expect(home.notes[1]?.done).toBe(true);
  });

  it('drops an out-of-range weather point instead of trusting it', () => {
    const home = sanitizeHome({ latitude: 999, longitude: 0, city: 'Nowhere' });
    expect(home.latitude).toBeNull();
    expect(home.longitude).toBeNull();
  });

  it('validates emulator system and scale', () => {
    expect(sanitizeEmulator({ system: 'gba', scale: 99 }).scale).toBe(5);
    expect(sanitizeEmulator({ system: 'gba', scale: 0 }).scale).toBe(1);
    expect(sanitizeEmulator({ system: 'atari' }).system).toBe('nes');
    expect(sanitizeEmulator({ system: 'genesis' }).system).toBe('genesis');
    expect(sanitizeEmulator({ system: 'ngpc' }).system).toBe('ngpc');
    expect(sanitizeEmulator({ system: 'snes', crt: false }).crt).toBe(false);
  });

  it('keeps VPN and resource settings bounded and boolean', () => {
    expect(sanitizeVpn({ enabled: 'yes', binaryPath: 'C:\\openvpn.exe' })).toMatchObject({
      enabled: false,
      binaryPath: 'C:\\openvpn.exe',
    });
    expect(sanitizeResources({ enabled: true, sidebar: false })).toEqual({
      enabled: true,
      sidebar: false,
    });
  });

  it('keeps per-service mute, notification and persistence flags', () => {
    const state = sanitizeState({
      services: [
        {
          id: 's-a',
          name: 'Chat',
          url: 'https://example.com',
          category: 'communication',
          color: '#38BDF8',
          letter: 'C',
          pinned: false,
          createdAt: 1,
          muted: true,
          notifications: false,
          persistence: 'pause',
        },
      ],
    });
    expect(state.services[0]).toMatchObject({
      muted: true,
      notifications: false,
      persistence: 'pause',
    });
    const defaults = sanitizeState({
      services: [
        {
          id: 's-b',
          name: 'Mail',
          url: 'https://example.com',
          category: 'communication',
          color: '#38BDF8',
          letter: 'M',
          pinned: false,
          createdAt: 1,
        },
      ],
    });
    expect(defaults.services[0]?.muted).toBeUndefined();
    expect(defaults.services[0]?.notifications).toBeUndefined();
    expect(defaults.services[0]?.persistence).toBeUndefined();
  });

  it('accepts only known search regions and engines', () => {
    const state = sanitizeState({
      settings: { searchRegion: 'kr', searchEngine: 'naver' },
    });
    expect(state.settings.searchRegion).toBe('kr');
    expect(state.settings.searchEngine).toBe('naver');
    expect(sanitizeState({ settings: { searchRegion: 'mars', searchEngine: 'altavista' } }).settings.searchRegion).toBe('global');
  });
});
