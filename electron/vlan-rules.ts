import type { VlanAdapter, VlanEngine, VlanStatus } from './types';

/**
 * Virtual LAN rules: which adapters count as an overlay network, and what may
 * be said about them.
 *
 * Kryvex runs no tunnel of its own. The user's ZeroTier, EasyTier, Tailscale,
 * WireGuard, Hamachi or OpenVPN install creates the adapter and owns its
 * routing and its admission; this module only decides which of the machine's
 * addresses belong to such an adapter, so the Rooms panel can show a member a
 * real address to copy instead of inventing one.
 *
 * Everything here is pure, so the handler, the panel and the tests share one
 * definition of a tunnel address.
 */

/**
 * Adapters that belong to a virtual machine or a container, not to a virtual
 * LAN. A Hyper-V vEthernet or a VirtualBox host-only adapter is a private
 * address on a real machine, but nobody is playing a game across it, so it is
 * deliberately not offered as a network a member could join.
 */
const NOT_A_NETWORK =
  /virtualbox|vmware|hyper-v|vethernet|docker|wsl|bluetooth|npcap|loopback|host-only/i;

/** Product names, most specific first, then anything tunnel-shaped. */
const ENGINE_BY_ADAPTER: Array<[VlanEngine, RegExp]> = [
  ['zerotier', /zerotier/i],
  ['easytier', /easytier/i],
  ['tailscale', /tailscale/i],
  ['hamachi', /hamachi|logmein/i],
  ['nebula', /nebula/i],
  ['wireguard', /wireguard|wintun/i],
  ['openvpn', /openvpn|tap-windows|tap9/i],
  ['n2n', /\bn2n\b|edge0/i],
  // `tun0`, `tap9` and `wg0` are the names Linux and macOS hand a tunnel, so a
  // digit after the word still counts; the word boundary alone would not match.
  ['generic', /\btun\d*\b|\btap\d*\b|\bwg\d+\b|\bvpn\b|tunnel/i],
];

/**
 * The family an adapter name belongs to, or null when it is not a tunnel.
 *
 * The name is all Windows or Linux gives us without asking the engine, so this
 * is a label, never a claim about who is on the other side.
 */
export function classifyAdapter(name: string): VlanEngine | null {
  if (typeof name !== 'string') return null;
  const label = name.trim();
  if (!label || NOT_A_NETWORK.test(label)) return null;
  for (const [engine, pattern] of ENGINE_BY_ADAPTER) {
    if (pattern.test(label)) return engine;
  }
  return null;
}

/**
 * An address that only exists because a tunnel is up.
 *
 * Private and carrier-grade ranges qualify; loopback and link-local do not,
 * because neither one can reach another machine.
 */
export function isTunnelAddress(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const parts = raw.trim().split('.');
  if (parts.length !== 4) return false;
  if (!parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return false;
  const [a, b] = parts.map(Number) as [number, number, number, number];
  if (a === 127 || a === 0) return false;
  if (a === 169 && b === 254) return false;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return a === 100 && b >= 64 && b <= 127;
}

/**
 * One entry per tunnel address, ordered by family and then by address, so a
 * machine with several adapters always lists them the same way.
 */
export function collectAdapters(rows: Array<{ address: string; name: string }>): VlanAdapter[] {
  const seen = new Set<string>();
  const found: VlanAdapter[] = [];
  for (const row of rows ?? []) {
    const engine = classifyAdapter(row?.name ?? '');
    if (!engine) continue;
    if (!isTunnelAddress(row?.address)) continue;
    const address = row.address.trim();
    if (seen.has(address)) continue;
    seen.add(address);
    found.push({ name: row.name.trim(), address, engine });
  }
  return found.sort(
    (left, right) =>
      left.engine.localeCompare(right.engine) ||
      left.name.localeCompare(right.name) ||
      left.address.localeCompare(right.address),
  );
}

/** A sentence for the panel, in the same voice as the rest of the app. */
export function vlanDetail(adapters: VlanAdapter[]): string {
  if (adapters.length === 0) {
    return 'No tunnel adapter is running. Start your own ZeroTier, EasyTier, Tailscale, WireGuard, Hamachi or OpenVPN network and reopen this panel.';
  }
  const families = [...new Set(adapters.map(adapter => adapter.engine))];
  if (adapters.length === 1) {
    return `One tunnel address is available on this machine (${families[0]}).`;
  }
  return `${adapters.length} tunnel addresses are available on this machine (${families.join(', ')}).`;
}

/** Never a partial answer: a caller either gets a full status or an empty one. */
export function emptyVlanStatus(): VlanStatus {
  return { adapters: [], detail: vlanDetail([]) };
}
