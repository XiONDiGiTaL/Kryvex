/**
 * What a picked folder actually holds.
 *
 * The main process lists files; this decides which of them are cartridges the
 * emulator can open and which are the BIOS images a core asks for. It is pure
 * so the classification can be tested without a disk, and it deliberately
 * guesses nothing: a file whose extension no offered core claims is not listed
 * as a game, and a BIOS file is only offered for the system that names it.
 */
import { ROM_SYSTEMS, offeredSystems, systemsForFile, type EngineOptions } from './emulator';
import type { EmulatorLibraryFile, EmulatorSystem } from '../types';

/**
 * The file names the cores look for.
 *
 * These are the names the cores themselves read, so a renamed dump is refused
 * rather than loaded into the wrong slot. Only systems whose core wants a BIOS
 * appear here; everything else needs none, which the panel already says.
 */
export const BIOS_FILE_NAMES: Partial<Record<EmulatorSystem, string[]>> = {
  gba: ['gba_bios.bin'],
  psx: ['scph5500.bin', 'scph5501.bin', 'scph5502.bin', 'scph1001.bin'],
  pce: ['syscard3.pce', 'syscard2.pce', 'syscard1.pce'],
  sgx: ['syscard3.pce', 'syscard2.pce', 'syscard1.pce'],
  lynx: ['lynxboot.img'],
  dreamcast: ['dc_boot.bin', 'dc_flash.bin'],
};

/** Every BIOS name any system here knows, for the unfiltered list. */
const ALL_BIOS_NAMES = Array.from(
  new Set(Object.values(BIOS_FILE_NAMES).flatMap(names => names ?? [])),
);

function lower(name: string): string {
  return name.toLowerCase();
}

/**
 * The console a listed file belongs to.
 *
 * A shared extension (`.bin`, `.pce`, `.chd`) has several candidates, so the
 * console already selected wins when it is one of them; otherwise the first
 * offered candidate is used. Header sniffing still happens when the bytes are
 * read, so this only decides which core the request starts from.
 */
export function systemForLibraryFile(
  name: string,
  preferred: EmulatorSystem,
  options?: EngineOptions,
): EmulatorSystem | null {
  const candidates = systemsForFile(name, options);
  if (candidates.length === 0) return null;
  return candidates.includes(preferred) ? preferred : (candidates[0] ?? null);
}

/**
 * The files in a folder that the emulator can open, with their console.
 *
 * A `.txt` beside the games, or a save file, is simply not in this list: the
 * panel promises games, not everything on the disk.
 */
export function gameFiles(
  files: EmulatorLibraryFile[],
  options?: EngineOptions,
): Array<{ file: EmulatorLibraryFile; system: EmulatorSystem }> {
  const offered = new Set(offeredSystems(options).map(system => system.id));
  const games: Array<{ file: EmulatorLibraryFile; system: EmulatorSystem }> = [];
  for (const file of files) {
    const candidates = systemsForFile(file.name, options).filter(system => offered.has(system));
    const system = candidates[0];
    if (!system) continue;
    games.push({ file, system });
  }
  // Grouped by console, then alphabetical: a folder covers many systems, and
  // the label is what a reader scans first.
  return games.sort((a, b) => {
    const left = labelFor(a.system);
    const right = labelFor(b.system);
    return left.localeCompare(right) || a.file.name.localeCompare(b.file.name);
  });
}

function labelFor(system: EmulatorSystem): string {
  return ROM_SYSTEMS.find(item => item.id === system)?.label ?? system;
}

/**
 * The BIOS images in a folder.
 *
 * With no system given, anything a known core names is listed; with one, only
 * what that core reads — a PlayStation BIOS is not offered to a Game Boy.
 */
export function biosFiles(
  files: EmulatorLibraryFile[],
  system?: EmulatorSystem | null,
): EmulatorLibraryFile[] {
  const wanted = system ? (BIOS_FILE_NAMES[system] ?? []) : ALL_BIOS_NAMES;
  if (wanted.length === 0) return [];
  const names = new Set(wanted.map(lower));
  return files
    .filter(file => names.has(lower(file.name)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether a system's core wants a BIOS at all. */
export function systemNeedsBios(system: EmulatorSystem): boolean {
  return (BIOS_FILE_NAMES[system] ?? []).length > 0;
}
