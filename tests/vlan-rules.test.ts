import { describe, expect, it } from 'vitest';
import {
  classifyAdapter,
  collectAdapters,
  emptyVlanStatus,
  isTunnelAddress,
  vlanDetail,
} from '../electron/vlan-rules';
import {
  VLAN_ENGINE_LABELS,
  VLAN_ENGINES,
  isDisplayableAddress,
  isVlanEngine,
  sanitizeVlanShare,
  vlanEngineLabel,
} from '../src/lib/vlan-rules';

describe('tunnel adapters', () => {
  it('names the engine behind an adapter it recognises', () => {
    expect(classifyAdapter('ZeroTier One [8056c2e21ca5d4bd]')).toBe('zerotier');
    expect(classifyAdapter('easytier')).toBe('easytier');
    expect(classifyAdapter('Tailscale')).toBe('tailscale');
    expect(classifyAdapter('WireGuard Tunnel')).toBe('wireguard');
    expect(classifyAdapter('TAP-Windows Adapter V9')).toBe('openvpn');
    expect(classifyAdapter('Hamachi')).toBe('hamachi');
    expect(classifyAdapter('tun0')).toBe('generic');
  });

  it('refuses a virtual machine or container network', () => {
    // These are private addresses on real machines, but nobody plays a game
    // across a Hyper-V switch or a Docker bridge, so they are not offered.
    expect(classifyAdapter('vEthernet (Default Switch)')).toBeNull();
    expect(classifyAdapter('VirtualBox Host-Only Network')).toBeNull();
    expect(classifyAdapter('VMware Network Adapter VMnet8')).toBeNull();
    expect(classifyAdapter('veth0')).toBeNull();
    expect(classifyAdapter('Ethernet')).toBeNull();
    expect(classifyAdapter('Wi-Fi')).toBeNull();
    expect(classifyAdapter('')).toBeNull();
  });

  it('accepts only addresses another machine could reach', () => {
    expect(isTunnelAddress('10.126.126.1')).toBe(true);
    expect(isTunnelAddress('172.16.4.9')).toBe(true);
    expect(isTunnelAddress('172.31.255.254')).toBe(true);
    expect(isTunnelAddress('192.168.50.250')).toBe(true);
    expect(isTunnelAddress('100.84.3.7')).toBe(true);
    expect(isTunnelAddress('172.32.0.1')).toBe(false);
    expect(isTunnelAddress('127.0.0.1')).toBe(false);
    expect(isTunnelAddress('169.254.10.10')).toBe(false);
    expect(isTunnelAddress('0.0.0.0')).toBe(false);
    expect(isTunnelAddress('8.8.8.8')).toBe(false);
    expect(isTunnelAddress('10.0.0.256')).toBe(false);
    expect(isTunnelAddress('10.0.0')).toBe(false);
    expect(isTunnelAddress(undefined)).toBe(false);
  });

  it('collects one ordered row per tunnel address', () => {
    const rows = [
      { address: '192.168.50.250', name: 'Ethernet' },
      { address: '10.147.19.81', name: 'ZeroTier One' },
      { address: '127.0.0.1', name: 'Loopback' },
      { address: '10.124.101.81', name: 'ZeroTier One' },
      { address: '10.147.19.81', name: 'ZeroTier One' },
      { address: '192.168.56.1', name: 'VirtualBox Host-Only Network' },
      { address: '10.126.126.7', name: 'easytier' },
    ];
    const adapters = collectAdapters(rows);
    expect(adapters.map(adapter => adapter.address)).toEqual([
      '10.126.126.7',
      '10.124.101.81',
      '10.147.19.81',
    ]);
    expect(adapters[0]?.engine).toBe('easytier');
    expect(adapters[1]?.engine).toBe('zerotier');
    expect(adapters.every(adapter => adapter.name.length > 0)).toBe(true);
  });

  it('says plainly when no engine is running', () => {
    const empty = emptyVlanStatus();
    expect(empty.adapters).toEqual([]);
    expect(empty.detail).toContain('No tunnel adapter is running');
    const one = vlanDetail([{ name: 'ZeroTier One', address: '10.147.19.81', engine: 'zerotier' }]);
    expect(one).toContain('One tunnel address');
    expect(one).toContain('zerotier');
    const two = vlanDetail([
      { name: 'ZeroTier One', address: '10.147.19.81', engine: 'zerotier' },
      { name: 'easytier', address: '10.126.126.7', engine: 'easytier' },
    ]);
    expect(two).toContain('2 tunnel addresses');
    expect(two).toContain('easytier');
  });
});

describe('published addresses', () => {
  it('labels every engine it knows', () => {
    for (const engine of VLAN_ENGINES) {
      expect(VLAN_ENGINE_LABELS[engine].length).toBeGreaterThan(0);
      expect(vlanEngineLabel(engine)).toBe(VLAN_ENGINE_LABELS[engine]);
    }
    expect(vlanEngineLabel('nonsense' as never)).toBe('');
    expect(vlanEngineLabel(null)).toBe('');
  });

  it('shows an address a member typed, and refuses what cannot be one', () => {
    // Hamachi hands out 25.x addresses, so a public-looking range is allowed:
    // this string is copied by a human, never dialled by Kryvex.
    expect(isDisplayableAddress('25.42.7.9')).toBe(true);
    expect(isDisplayableAddress('100.84.3.7')).toBe(true);
    expect(isDisplayableAddress(' 10.0.0.5 ')).toBe(true);
    expect(isDisplayableAddress('127.0.0.1')).toBe(false);
    expect(isDisplayableAddress('169.254.1.1')).toBe(false);
    expect(isDisplayableAddress('224.0.0.1')).toBe(false);
    expect(isDisplayableAddress('0.1.2.3')).toBe(false);
    expect(isDisplayableAddress('010.1.2.3')).toBe(false);
    expect(isDisplayableAddress('10.0.0.5:8000')).toBe(false);
    expect(isDisplayableAddress('example.com')).toBe(false);
    expect(isDisplayableAddress(42)).toBe(false);
  });

  it('sanitises what arrives from a peer', () => {
    expect(sanitizeVlanShare({ ip: '10.126.126.7', engine: 'easytier' })).toEqual({
      ip: '10.126.126.7',
      engine: 'easytier',
    });
    // An unknown family is shown as a plain tunnel rather than dropped: the
    // address is still the useful part.
    expect(sanitizeVlanShare({ ip: '10.126.126.7', engine: 'made-up' })).toEqual({
      ip: '10.126.126.7',
      engine: 'generic',
    });
    expect(sanitizeVlanShare({ ip: '', engine: 'zerotier' })).toBeNull();
    expect(sanitizeVlanShare({ ip: '127.0.0.1', engine: 'zerotier' })).toBeNull();
    expect(sanitizeVlanShare({ engine: 'zerotier' })).toBeNull();
    expect(sanitizeVlanShare('<img src=x onerror=alert(1)>')).toBeNull();
    expect(sanitizeVlanShare(null)).toBeNull();
  });

  it('recognises only the engine tokens in the list', () => {
    expect(isVlanEngine('zerotier')).toBe(true);
    expect(isVlanEngine('ZEROTIER')).toBe(false);
    expect(isVlanEngine('')).toBe(false);
    expect(VLAN_ENGINES.length).toBe(new Set(VLAN_ENGINES).size);
  });
});
