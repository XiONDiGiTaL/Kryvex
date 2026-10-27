import os from 'node:os';
import type { VlanStatus } from './types';
import { collectAdapters, emptyVlanStatus, vlanDetail } from './vlan-rules';

/**
 * Reads the tunnel adapters this machine already has.
 *
 * This is a read-only feature on purpose. Kryvex creates no adapter, installs
 * no driver, changes no route and asks for no elevation: whatever overlay
 * network is up belongs to the engine the user installed, and that engine keeps
 * owning its admission and its teardown. The only thing this module does is
 * report the address an engine has already given this machine, so a member can
 * copy it into a compatible game or service.
 */
export function vlanStatus(): VlanStatus {
  let interfaces: ReturnType<typeof os.networkInterfaces>;
  try {
    interfaces = os.networkInterfaces();
  } catch {
    return emptyVlanStatus();
  }

  const rows: Array<{ address: string; name: string }> = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const row of entries ?? []) {
      // Node reports an IPv4 address as family 'IPv4' on every supported
      // version; a numeric family means an older shape and is skipped rather
      // than guessed at.
      if (row.family !== 'IPv4' || row.internal) continue;
      rows.push({ address: row.address, name });
    }
  }

  try {
    const adapters = collectAdapters(rows);
    return { adapters, detail: vlanDetail(adapters) };
  } catch {
    return emptyVlanStatus();
  }
}
