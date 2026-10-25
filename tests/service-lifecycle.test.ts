import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIFECYCLE,
  IDLE_CHOICES,
  LIFECYCLE_SERVICES,
  clampIdleMinutes,
  idleLabel,
  idleWaitMs,
  lifecycleService,
  modeFor,
  resolveLifecycle,
  sanitizeLifecycle,
} from '../src/lib/lifecycle';
import { sanitizeState } from '../src/lib/store';
import { emulatorGameKey, emulatorRequestId } from '../src/lib/emulator';
import {
  MAX_STATES_PER_GAME,
  type EmulatorStateRecord,
  formatSaveSize,
  listStates,
  deleteState,
  pruneStates,
  resetEmulatorSavesForTests,
  safeFileStem,
  saveStamp,
  sortStates,
  stateFileName,
  stateLabel,
  writeState,
} from '../src/lib/emulator-saves';
import type { LifecycleMode } from '../src/types';

const emulator = lifecycleService('emulator');
const disk = lifecycleService('disk');
const rooms = lifecycleService('rooms');

describe('service lifecycle resolution', () => {
  it('is always active while the service is on screen', () => {
    for (const mode of ['keep', 'mute', 'pause', 'auto-pause', 'stop'] as LifecycleMode[]) {
      const verdict = resolveLifecycle({ visible: true, mode, capabilities: emulator });
      expect(verdict.state).toBe('active');
      expect(verdict.keepMounted).toBe(true);
      expect(verdict.pause).toBe(false);
      expect(verdict.mute).toBe(false);
    }
  });

  it('parks a kept service instead of destroying it', () => {
    const verdict = resolveLifecycle({ visible: false, mode: 'keep', capabilities: emulator });
    expect(verdict.state).toBe('background');
    expect(verdict.keepMounted).toBe(true);
    expect(verdict.pause).toBe(false);
    expect(verdict.mute).toBe(false);
    expect(verdict.note).toBeUndefined();
  });

  it('mutes a kept service that can be muted, and says so when it cannot', () => {
    expect(resolveLifecycle({ visible: false, mode: 'mute', capabilities: emulator }).mute).toBe(
      true,
    );
    const diskVerdict = resolveLifecycle({ visible: false, mode: 'mute', capabilities: disk });
    expect(diskVerdict.mute).toBe(false);
    expect(diskVerdict.state).toBe('background');
    expect(diskVerdict.note).toMatch(/no audio/);
  });

  it('pauses on leave and resumes on return', () => {
    const away = resolveLifecycle({ visible: false, mode: 'pause', capabilities: emulator });
    expect(away.state).toBe('paused');
    expect(away.pause).toBe(true);
    expect(away.keepMounted).toBe(true);
    const back = resolveLifecycle({ visible: true, mode: 'pause', capabilities: emulator });
    expect(back.state).toBe('active');
    expect(back.pause).toBe(false);
  });

  it('falls back to the background when a service cannot pause', () => {
    const verdict = resolveLifecycle({ visible: false, mode: 'pause', capabilities: disk });
    expect(verdict.state).toBe('background');
    expect(verdict.pause).toBe(false);
    expect(verdict.keepMounted).toBe(true);
    expect(verdict.note).toMatch(/cannot suspend/);
  });

  it('holds an auto-paused service until the idle boundary', () => {
    const before = resolveLifecycle({
      visible: false,
      mode: 'auto-pause',
      idleMinutes: 15,
      hiddenForMs: idleWaitMs(15) - 1,
      capabilities: emulator,
    });
    expect(before.state).toBe('background');
    const after = resolveLifecycle({
      visible: false,
      mode: 'auto-pause',
      idleMinutes: 15,
      hiddenForMs: idleWaitMs(15),
      capabilities: emulator,
    });
    expect(after.state).toBe('paused');
    expect(after.pause).toBe(true);
  });

  it('keeps an auto-paused room connected, because pausing would drop it', () => {
    const verdict = resolveLifecycle({
      visible: false,
      mode: 'auto-pause',
      idleMinutes: 5,
      hiddenForMs: idleWaitMs(5) * 4,
      capabilities: rooms,
    });
    expect(verdict.state).toBe('background');
    expect(verdict.keepMounted).toBe(true);
  });

  it('only the stop policy unmounts a view', () => {
    const verdict = resolveLifecycle({ visible: false, mode: 'stop', capabilities: emulator });
    expect(verdict.state).toBe('stopped');
    expect(verdict.keepMounted).toBe(false);
  });

  it('stops a service that can neither keep running nor pause', () => {
    const fragile = { ...emulator, canKeepRunning: false, canPause: false };
    const verdict = resolveLifecycle({ visible: false, mode: 'keep', capabilities: fragile });
    expect(verdict.state).toBe('stopped');
    expect(verdict.keepMounted).toBe(false);
    expect(verdict.note).toMatch(/cannot keep running/);
  });

  it('pauses instead of stopping when a non-keepable service can pause', () => {
    const verdict = resolveLifecycle({
      visible: false,
      mode: 'keep',
      capabilities: { ...emulator, canKeepRunning: false },
    });
    expect(verdict.state).toBe('paused');
    expect(verdict.pause).toBe(true);
  });

  it('declares what every service can actually do', () => {
    for (const service of LIFECYCLE_SERVICES) {
      expect(service.canKeepRunning).toBe(true);
      expect(typeof service.detail).toBe('string');
    }
    // A live call cannot be suspended, and a main-process scan has nothing to mute.
    expect(rooms.canPause).toBe(false);
    expect(disk.canMute).toBe(false);
    expect(emulator.canPause && emulator.canMute).toBe(true);
  });
});

describe('lifecycle settings', () => {
  it('resolves a per-service override before the default', () => {
    const settings = { ...DEFAULT_LIFECYCLE, mode: 'keep' as LifecycleMode };
    expect(modeFor(settings, 'disk')).toBe('keep');
    expect(modeFor({ ...settings, overrides: { disk: 'auto-pause' } }, 'disk')).toBe('auto-pause');
    expect(modeFor({ ...settings, overrides: { disk: 'auto-pause' } }, 'emulator')).toBe('keep');
  });

  it('fills defaults for a state file written before the model existed', () => {
    const state = sanitizeState({ settings: { density: 'compact' } });
    expect(state.settings.lifecycle).toEqual(DEFAULT_LIFECYCLE);
  });

  it('drops an unknown mode and an out-of-range interval', () => {
    const settings = sanitizeLifecycle({
      mode: 'explode',
      idleMinutes: 100_000,
      overrides: { emulator: 'pause', disk: 'nonsense', spy: 'stop' },
    });
    expect(settings.mode).toBe('keep');
    expect(settings.idleMinutes).toBe(480);
    expect(settings.overrides).toEqual({ emulator: 'pause' });
  });

  it('bounds the idle interval and offers the documented presets', () => {
    expect(clampIdleMinutes(0)).toBe(1);
    expect(clampIdleMinutes(-4)).toBe(1);
    expect(clampIdleMinutes('12')).toBe(12);
    expect(clampIdleMinutes(Number.NaN, 15)).toBe(15);
    expect(IDLE_CHOICES).toEqual([5, 10, 15, 60, 240]);
    expect(idleLabel(15)).toBe('15 minutes');
    expect(idleLabel(60)).toBe('1 hour');
    expect(idleLabel(240)).toBe('4 hours');
    expect(() => sanitizeLifecycle([])).not.toThrow();
  });
});

describe('emulator save names', () => {
  it('derives a stable key per cartridge and size', () => {
    const key = emulatorGameKey('Contra (USA).nes', 'nes', 131072);
    expect(key).toBe(emulatorGameKey('Contra (USA).nes', 'nes', 131072));
    expect(key).not.toBe(emulatorGameKey('Contra (USA).nes', 'nes', 262144));
    expect(key).not.toBe(emulatorGameKey('Contra (USA).nes', 'snes', 131072));
    expect(emulatorRequestId()).toMatch(/^req-/);
  });

  it('strips characters a filesystem refuses', () => {
    expect(safeFileStem('Sonic/2: "Hack"?.md')).toBe('Sonic-2- -Hack--');
    expect(safeFileStem('   ')).toBe('game');
    expect(safeFileStem('.hidden')).toBe('hidden');
  });

  it('names a state with the game, a sortable stamp and its kind', () => {
    const stamp = Date.UTC(2026, 9, 24, 18, 42, 5);
    const name = stateFileName('Contra (USA).nes', stamp, 'quick');
    expect(name).toMatch(/^Contra \(USA\) \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2} quick\.state$/);
    expect(stateFileName('game.nes', stamp, 'manual')).toContain('manual.state');
    expect(stateLabel('quick', stamp)).toContain('Quick save');
    expect(saveStamp(Number.NaN)).toBe('unknown-date');
  });

  it('reports sizes without pretending a tiny state is empty', () => {
    expect(formatSaveSize(0)).toBe('0 KB');
    expect(formatSaveSize(512)).toBe('1 KB');
    expect(formatSaveSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('keeps the newest states and drops the rest', () => {
    const record = (id: string, createdAt: number) => ({
      id,
      gameKey: 'nes:1:2',
      gameName: 'Game.nes',
      system: 'nes' as const,
      kind: 'manual' as const,
      label: id,
      createdAt,
      bytes: new Uint8Array(4),
      thumb: null,
      size: 4,
    });
    const many = Array.from({ length: MAX_STATES_PER_GAME + 3 }, (_, index) =>
      record(`s-${index}`, index),
    );
    const { keep, drop } = pruneStates(many);
    expect(keep).toHaveLength(MAX_STATES_PER_GAME);
    expect(keep[0]?.id).toBe(`s-${MAX_STATES_PER_GAME + 2}`);
    expect(drop).toHaveLength(3);
    expect(sortStates(many)[0]?.createdAt).toBe(MAX_STATES_PER_GAME + 2);
  });

  it('stores, lists and deletes states without a browser database', async () => {
    resetEmulatorSavesForTests();
    const input = {
      gameKey: 'nes:1:2',
      gameName: 'Game.nes',
      system: 'nes' as const,
      kind: 'quick' as const,
      label: 'Quick save',
      createdAt: 1_700_000_000_000,
      bytes: new Uint8Array([1, 2, 3, 4]),
      thumb: null,
    };
    const first = await writeState(input);
    const second = await writeState({ ...input, kind: 'manual', createdAt: input.createdAt + 1000 });
    const listed = await listStates('nes:1:2');
    expect(listed.map(record => record.id)).toEqual([second.id, first.id]);
    expect(listed[0]?.size).toBe(4);
    await deleteState(second.id);
    expect(await listStates('nes:1:2')).toHaveLength(1);
    expect(await listStates('snes:9:9')).toHaveLength(0);
  });

  it('caps a game at twelve states however many are written', async () => {
    resetEmulatorSavesForTests();
    const base = {
      gameKey: 'gba:7:8',
      gameName: 'Game.gba',
      system: 'gba' as const,
      kind: 'manual' as const,
      label: 'Save',
      bytes: new Uint8Array([9]),
      thumb: null,
    };
    for (let index = 0; index < MAX_STATES_PER_GAME + 2; index += 1) {
      await writeState({ ...base, createdAt: 1_700_000_000_000 + index * 1000 });
    }
    const listed = (await listStates('gba:7:8')) as EmulatorStateRecord[];
    expect(listed).toHaveLength(MAX_STATES_PER_GAME);
    // The two oldest writes were pruned.
    expect(listed.at(-1)?.createdAt).toBe(1_700_000_000_000 + 2 * 1000);
  });
});
