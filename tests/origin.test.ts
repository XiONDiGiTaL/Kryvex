import { describe, expect, it } from 'vitest';
import {
  ipVersion,
  isLocalHost,
  isPrivateAddress,
  lookupUrl,
  parseLookup,
  pickAddress,
  siteHost,
} from '../electron/origin-rules';
import {
  ageLabel,
  clockAt,
  coordinateLabel,
  countryLabel,
  flagSrc,
  networkLabel,
  nodeLabel,
  originProblem,
  publicHost,
} from '../src/lib/origin';

describe('siteHost', () => {
  it('keeps the host of a web address and drops the rest', () => {
    expect(siteHost('https://www.Example.com:8443/search?q=1')).toBe('www.example.com');
    expect(siteHost('example.com')).toBe('example.com');
    expect(siteHost('http://example.com.')).toBe('example.com');
  });

  it('refuses everything that is not a web page', () => {
    expect(siteHost('about:blank')).toBeNull();
    expect(siteHost('file:///tmp/page.html')).toBeNull();
    expect(siteHost('javascript:alert(1)')).toBeNull();
    expect(siteHost('')).toBeNull();
    expect(siteHost(null)).toBeNull();
  });

  it('unwraps an address literal so it can be looked up', () => {
    expect(siteHost('http://[::1]:3000')).toBe('::1');
    expect(siteHost('https://8.8.8.8/')).toBe('8.8.8.8');
  });
});

describe('local and private hosts', () => {
  it('never sends a local page to a registry', () => {
    expect(isLocalHost('localhost')).toBe(true);
    expect(isLocalHost('studio.localhost')).toBe(true);
    expect(isLocalHost('nas.local')).toBe(true);
    expect(isLocalHost('127.0.0.1')).toBe(true);
    expect(isLocalHost('192.168.1.20')).toBe(true);
    expect(isLocalHost('10.0.0.5')).toBe(true);
    expect(isLocalHost('172.20.3.4')).toBe(true);
    expect(isLocalHost('169.254.10.1')).toBe(true);
    expect(isLocalHost('::1')).toBe(true);
    expect(isLocalHost('fd00::1')).toBe(true);
  });

  it('treats a public site and a public address as remote', () => {
    expect(isLocalHost('example.com')).toBe(false);
    expect(isLocalHost('1.1.1.1')).toBe(false);
    expect(isLocalHost('172.32.0.1')).toBe(false);
    expect(isPrivateAddress('203.0.113.9')).toBe(false);
  });
});

describe('registry answer', () => {
  const answer = {
    ip: '1.1.1.1',
    success: true,
    type: 'IPv4',
    country: 'Australia',
    country_code: 'au',
    region: 'Queensland',
    city: 'Brisbane',
    latitude: -27.4679371,
    longitude: 153.0280882,
    connection: { asn: 13335, org: 'Cloudflare', isp: 'Cloudflare, Inc.' },
    timezone: { id: 'Australia/Brisbane', abbr: 'AEST' },
  };

  it('reads a complete answer into the shape the card draws', () => {
    const origin = parseLookup(answer, 'one.one.one.one');
    expect(origin?.host).toBe('one.one.one.one');
    expect(origin?.address).toBe('1.1.1.1');
    expect(origin?.countryCode).toBe('AU');
    expect(origin?.asn).toBe(13335);
    expect(origin?.latitude).toBe(-27.4679);
    expect(origin?.timezone).toBe('Australia/Brisbane');
  });

  it('rejects an answer without a country or an address', () => {
    expect(parseLookup({ success: false, message: 'invalid IP' }, 'example.com')).toBeNull();
    expect(parseLookup({ success: true, ip: '1.1.1.1' }, 'example.com')).toBeNull();
    expect(parseLookup(null, 'example.com')).toBeNull();
  });

  it('falls back to no flag colour when the code is not a country code', () => {
    const origin = parseLookup({ ...answer, country_code: 'Australia' }, 'example.com');
    expect(origin?.countryCode).toBe('');
  });

  it('prefers IPv4 when DNS returns both families', () => {
    const picked = pickAddress([
      { address: '2606:4700::1111', family: 6 },
      { address: '1.0.0.1', family: 4 },
    ]);
    expect(picked?.address).toBe('1.0.0.1');
    expect(pickAddress([])).toBeNull();
  });

  it('asks a keyless endpoint with the address in the path', () => {
    expect(lookupUrl('1.1.1.1')).toBe('https://ipwho.is/1.1.1.1');
    expect(ipVersion('2606:4700::1111')).toBe(6);
    expect(ipVersion('nope')).toBe(0);
  });
});

describe('origin card labels', () => {
  it('reads the page host without the www prefix', () => {
    expect(publicHost('https://www.bing.com/search?q=kryvex')).toBe('bing.com');
    expect(publicHost('about:blank')).toBe('');
    expect(publicHost('not a url')).toBe('');
  });

  it('points at a bundled flag, and at nothing for an unusable code', () => {
    expect(flagSrc('DE')).toBe('flags/de.svg');
    expect(flagSrc('')).toBe('');
    expect(flagSrc('deu')).toBe('');
  });

  it('names the country in the reader’s language', () => {
    expect(countryLabel('DE', 'en')).toBe('Germany');
    expect(countryLabel('', 'en')).toBe('');
  });

  it('summarises the network owner and the node', () => {
    expect(networkLabel({ isp: 'Cloudflare, Inc.', org: '', asn: 13335 })).toBe(
      'Cloudflare, Inc. · AS13335',
    );
    expect(networkLabel({ isp: '', org: '', asn: null })).toBe('');
    expect(nodeLabel({ city: 'Brisbane', region: 'Queensland' })).toBe('Brisbane, Queensland');
    expect(nodeLabel({ city: '', region: 'Queensland' })).toBe('Queensland');
  });

  it('writes coordinates with a hemisphere instead of a minus sign', () => {
    expect(coordinateLabel(-27.4679, 153.0281)).toBe('27.47° S, 153.03° E');
    expect(coordinateLabel(null, 10)).toBe('');
  });

  it('shows the server’s own clock', () => {
    const at = Date.UTC(2026, 0, 1, 3, 0);
    expect(clockAt('Australia/Brisbane', 'en', at)).toBe('13:00');
    expect(clockAt('Not/AZone', 'en', at)).toBe('');
  });

  it('describes how old a cached answer is', () => {
    const at = 1_000_000;
    expect(ageLabel(at, at + 20_000)).toBe('just now');
    expect(ageLabel(at, at + 5 * 60_000)).toBe('5 min');
    expect(ageLabel(at, at + 3 * 3_600_000)).toBe('3 h');
    expect(ageLabel(at, at + 2 * 86_400_000)).toBe('2 d');
  });

  it('explains a lookup that could not name a country', () => {
    expect(originProblem('local')).toMatch(/this machine/);
    expect(originProblem('offline')).toMatch(/could not be reached/);
    expect(originProblem(undefined)).toMatch(/no record/);
  });
});
