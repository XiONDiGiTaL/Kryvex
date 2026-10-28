import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { BIOS_FILE_NAMES, biosFiles, gameFiles, systemNeedsBios } from '../src/lib/emulator-folders';
import { isInsideFolder } from '../electron/emulator-library';
import type { EmulatorLibraryFile } from '../src/types';

function file(name: string, size = 1024): EmulatorLibraryFile {
  return { name, path: `/games/${name}`, size };
}

describe('what a picked folder holds', () => {
  it('lists only files an offered core can open', () => {
    const games = gameFiles([
      file('Sonic.cdi'),
      file('Super Mario Bros.nes'),
      file('notes.txt'),
      file('save.srm'),
      file('Zelda.sfc'),
    ]);
    const names = games.map(game => game.file.name);
    // The Dreamcast image needs the second engine, so it is not offered yet.
    expect(names).toEqual(['Super Mario Bros.nes', 'Zelda.sfc']);
    expect(games[0]?.system).toBe('nes');
    expect(games[1]?.system).toBe('snes');
  });

  it('offers the second engine formats only when it is switched on', () => {
    const withEngine = gameFiles([file('Sonic.cdi'), file('Crazy Taxi.chd')], { flycast: true });
    expect(withEngine.map(game => game.system)).toEqual(['dreamcast', 'dreamcast']);
  });

  it('sorts by console, then by name, so a big folder is scannable', () => {
    const games = gameFiles([file('b.gba'), file('a.nes'), file('a.gba')]);
    // "Game Boy Advance" sorts before "NES", and within a console it is by name.
    expect(games.map(game => game.file.name)).toEqual(['a.gba', 'b.gba', 'a.nes']);
  });

  it('names only the BIOS files the console actually reads', () => {
    const files = [
      file('scph5501.bin', 512 * 1024),
      file('gba_bios.bin', 16 * 1024),
      file('random.bin'),
      file('dc_boot.bin'),
    ];
    expect(biosFiles(files, 'psx').map(item => item.name)).toEqual(['scph5501.bin']);
    expect(biosFiles(files, 'gba').map(item => item.name)).toEqual(['gba_bios.bin']);
    // No console picked: every name a core knows is offered.
    expect(biosFiles(files).map(item => item.name)).toEqual([
      'dc_boot.bin',
      'gba_bios.bin',
      'scph5501.bin',
    ]);
    // A console with no BIOS requirement gets nothing, not everything.
    expect(biosFiles(files, 'nes')).toEqual([]);
    expect(systemNeedsBios('nes')).toBe(false);
    expect(systemNeedsBios('psx')).toBe(true);
  });

  it('matches BIOS names without caring about case', () => {
    expect(biosFiles([file('SCPH5502.BIN')], 'psx').map(item => item.name)).toEqual(['SCPH5502.BIN']);
    expect(BIOS_FILE_NAMES.psx).toContain('scph5502.bin');
  });
});

describe('the read guard', () => {
  it('refuses a path outside the folder that was picked', () => {
    const folder = path.resolve('/games');
    expect(isInsideFolder(folder, path.join(folder, 'mario.nes'))).toBe(true);
    expect(isInsideFolder(folder, path.join(folder, 'sub', 'mario.nes'))).toBe(true);
    // A sibling whose name starts with the same letters is not inside it.
    expect(isInsideFolder(folder, path.resolve('/games-elsewhere/mario.nes'))).toBe(false);
    expect(isInsideFolder(folder, path.resolve('/etc/passwd'))).toBe(false);
    // The folder itself, and anything above it, is not a file it may read.
    expect(isInsideFolder(folder, folder)).toBe(false);
    expect(isInsideFolder(folder, path.resolve('/'))).toBe(false);
    expect(isInsideFolder('', path.resolve('/games/mario.nes'))).toBe(false);
  });
});
