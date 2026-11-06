import { describe, expect, it } from 'vitest';
import {
  firewallVerdict,
  parseFirewallReading,
  phoneStatus,
} from '../electron/link-rules';

/**
 * The connection check exists because "the phone will not load the page" is the
 * normal failure, and most of the time it is not the pairing code. These are the
 * two pure pieces behind it: what the firewall reading means, and what a phone
 * is allowed to say about its own battery.
 */

describe('the Windows firewall reading', () => {
  it('reads the tri-state values PowerShell prints', () => {
    expect(parseFirewallReading('True\n', 'True\n')).toEqual({
      ruleEnabled: true,
      privateFiltering: true,
    });
    // No rule prints nothing at all; that is "missing", not "disabled".
    expect(parseFirewallReading('', 'True\n')).toEqual({
      ruleEnabled: null,
      privateFiltering: true,
    });
    expect(parseFirewallReading('garbage', '')).toEqual({
      ruleEnabled: null,
      privateFiltering: null,
    });
  });

  it('turns the reading into what the phone will experience', () => {
    expect(firewallVerdict({ ruleEnabled: true, privateFiltering: true })).toBe('open');
    expect(firewallVerdict({ ruleEnabled: false, privateFiltering: true })).toBe('rule-disabled');
    expect(firewallVerdict({ ruleEnabled: null, privateFiltering: true })).toBe('no-rule');
    // Windows is not filtering inbound traffic on this profile at all.
    expect(firewallVerdict({ ruleEnabled: null, privateFiltering: false })).toBe('open');
    expect(firewallVerdict({ ruleEnabled: false, privateFiltering: false })).toBe('open');
    // Nothing could be read: say so rather than claim the network is fine.
    expect(firewallVerdict({ ruleEnabled: null, privateFiltering: null })).toBe('unknown');
  });
});

describe('the status a phone reports', () => {
  it('keeps a normal reading', () => {
    expect(phoneStatus({ level: 0.82, charging: true })).toEqual({ level: 0.82, charging: true });
    expect(phoneStatus({ level: 0, charging: false })).toEqual({ level: 0, charging: false });
    expect(phoneStatus({ level: 1 })).toEqual({ level: 1, charging: false });
  });

  it('clamps a level outside 0..1 instead of trusting it', () => {
    expect(phoneStatus({ level: 2, charging: false })).toEqual({ level: 1, charging: false });
    expect(phoneStatus({ level: -3 })).toEqual({ level: 0, charging: false });
  });

  it('drops anything malformed rather than showing it as 0%', () => {
    expect(phoneStatus({ charging: true })).toBeNull();
    expect(phoneStatus({ level: '0.5' })).toBeNull();
    expect(phoneStatus({ level: Number.NaN })).toBeNull();
    expect(phoneStatus({ level: Number.POSITIVE_INFINITY })).toBeNull();
    expect(phoneStatus(null)).toBeNull();
    expect(phoneStatus([])).toBeNull();
    expect(phoneStatus('82%')).toBeNull();
  });
});
