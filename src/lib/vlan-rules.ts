import type { VlanEngine } from '../types';

/**
 * Virtual LAN rules the renderer owns.
 *
 * The engine families and their labels live here rather than in the view, and
 * so does the check applied to an address that arrives from the room: a peer is
 * untrusted text, so what it publishes is validated before it is ever painted,
 * and Kryvex never dials it. A member copies the address into a game or a
 * service themself.
 */

export const VLAN_ENGINES: VlanEngine[] = [
  'zerotier',
  'easytier',
  'tailscale',
  'wireguard',
  'openvpn',
  'hamachi',
  'nebula',
  'n2n',
  'generic',
];

/** Product names, so the panel never shows a machine token to a reader. */
export const VLAN_ENGINE_LABELS: Record<VlanEngine, string> = {
  zerotier: 'ZeroTier',
  easytier: 'EasyTier',
  tailscale: 'Tailscale',
  wireguard: 'WireGuard',
  openvpn: 'OpenVPN',
  hamachi: 'Hamachi',
  nebula: 'Nebula',
  n2n: 'n2n',
  generic: 'Tunnel',
};

export function isVlanEngine(raw: unknown): raw is VlanEngine {
  return typeof raw === 'string' && (VLAN_ENGINES as string[]).includes(raw);
}

export function vlanEngineLabel(engine: VlanEngine | '' | null | undefined): string {
  return isVlanEngine(engine) ? VLAN_ENGINE_LABELS[engine] : '';
}

/**
 * An address worth showing as a member's virtual IP.
 *
 * Loopback, link-local, multicast, broadcast, `0.x` and anything that is not
 * four octets are refused: none of them can reach another machine, so painting
 * one would be worse than showing nothing. Public ranges are allowed, because
 * some overlay networks hand out addresses that look public (Hamachi's 25.x
 * range is the long-standing example) and this string is only ever copied by a
 * human, never connected to by Kryvex.
 */
export function isDisplayableAddress(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const value = raw.trim();
  if (!value || value.length > 15) return false;
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  if (!parts.every(part => /^\d{1,3}$/.test(part) && String(Number(part)) === part)) return false;
  const [a, b] = parts.map(Number) as [number, number, number, number];
  if (a === 0 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a >= 224) return false;
  return true;
}

/** One published address, or null when the payload is not worth showing. */
export function sanitizeVlanShare(payload: unknown): { ip: string; engine: VlanEngine } | null {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;
  if (!isDisplayableAddress(source.ip)) return null;
  return {
    ip: source.ip.trim(),
    engine: isVlanEngine(source.engine) ? source.engine : 'generic',
  };
}
