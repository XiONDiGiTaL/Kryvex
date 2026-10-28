/**
 * Copy for the netplay sidecar (RetroArch).
 *
 * Kryvex's own link is checkpoint-based; RetroArch is the engine that carries
 * frame-synchronised input, and Kryvex only starts it. The failure sentences
 * live here as templates rather than inside a `t(...)` literal because the
 * panel builds them from a main-process id, and the coverage audit can only
 * collect literals.
 */
import type { RetroarchFailure } from '../types';

/**
 * Why a netplay start did not happen, as a sentence the interface translates.
 *
 * `{file}` and `{system}` are filled by the panel: the interesting part of a
 * missing core is its file name, which the person can search for in RetroArch's
 * own updater.
 */
export function retroarchFailureKey(failure: RetroarchFailure | undefined): string {
  switch (failure) {
    case 'not-found':
      return 'RetroArch was not found. Install it, then point Kryvex at retroarch.exe.';
    case 'no-core':
      return 'The core for {system} is not installed: add {file} from RetroArch’s own core updater.';
    case 'address':
      return 'That is not an address Kryvex can dial. Use the host’s IP or name, with an optional port.';
    case 'rom':
      return 'Load a cartridge before starting netplay.';
    case 'write':
      return 'The cartridge could not be written for RetroArch to open.';
    case 'busy':
      return 'A netplay session is already running.';
    case 'spawn':
      return 'RetroArch could not be started.';
    default:
      return 'Netplay could not start.';
  }
}
