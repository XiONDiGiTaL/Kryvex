import { describe, expect, it } from 'vitest';
import {
  MAX_WORLD_CLOCKS,
  addClock,
  clockId,
  formatZoneTime,
  isValidTimeZone,
  offsetLabel,
  removeClock,
  sanitizeWorldClocks,
  shownClocks,
  zoneCity,
  zoneOffsetMinutes,
} from '../src/lib/world-clock';
import type { WorldClockCity } from '../src/types';

function city(zone: string, name: string, country = ''): WorldClockCity {
  return { id: clockId(zone, name), zone, city: name, ...(country ? { country } : {}) };
}

describe('world clock', () => {
  it('accepts real IANA zones and refuses the rest', () => {
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });

  it('reads the bare zone names older builds saved', () => {
    const list = sanitizeWorldClocks(['Asia/Tokyo', 'Europe/Paris']);
    expect(list.map(item => item.zone)).toEqual(['Asia/Tokyo', 'Europe/Paris']);
    expect(list[0]?.city).toBe('Tokyo');
    expect(list[1]?.city).toBe('Paris');
  });

  it('keeps the city name a lookup gave it, not the zone name', () => {
    // İzmir and Istanbul share a zone; the row the user asked for is İzmir.
    const list = sanitizeWorldClocks([
      { id: 'izmir', zone: 'Europe/Istanbul', city: 'İzmir', country: 'Türkiye', latitude: 38.42, longitude: 27.14 },
    ]);
    expect(list[0]).toMatchObject({ city: 'İzmir', country: 'Türkiye', zone: 'Europe/Istanbul' });
    expect(list[0]?.latitude).toBe(38.42);
  });

  it('keeps four places, one per zone, without repeats or junk', () => {
    const list = sanitizeWorldClocks([
      { zone: 'Asia/Tokyo', city: 'Tokyo' },
      { zone: 'Asia/Tokyo', city: 'Osaka' },
      { zone: 'nowhere', city: 'Nowhere' },
      'Europe/Paris',
      'UTC',
      'America/Chicago',
      'Pacific/Auckland',
    ]);
    expect(list).toHaveLength(MAX_WORLD_CLOCKS);
    expect(list.map(item => item.zone)).toEqual([
      'Asia/Tokyo',
      'Europe/Paris',
      'UTC',
      'America/Chicago',
    ]);
    // The first row for a zone keeps its name rather than being relabelled by
    // the duplicate that followed it.
    expect(list[0]?.city).toBe('Tokyo');
  });

  it('shows something useful before anything is chosen', () => {
    const fallback = shownClocks([]);
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback.length).toBeLessThanOrEqual(MAX_WORLD_CLOCKS);
    expect(fallback.every(entry => isValidTimeZone(entry.zone))).toBe(true);
    expect(fallback.every(entry => entry.city.length > 0)).toBe(true);
    expect(shownClocks([city('Asia/Tokyo', 'Tokyo')]).map(entry => entry.city)).toEqual(['Tokyo']);
  });

  it('adds a place, relabels a zone it already lists, and stops at four', () => {
    let list: WorldClockCity[] = [];
    for (const entry of [
      city('UTC', 'UTC'),
      city('Europe/Paris', 'Paris'),
      city('Asia/Tokyo', 'Tokyo'),
      city('America/Chicago', 'Chicago'),
    ]) {
      list = addClock(list, entry);
    }
    expect(list).toHaveLength(MAX_WORLD_CLOCKS);
    // The fifth is refused rather than silently replacing one.
    expect(addClock(list, city('Asia/Seoul', 'Seoul'))).toHaveLength(MAX_WORLD_CLOCKS);
    expect(addClock(list, city('nowhere', 'Nowhere'))).toEqual(list);

    // A second place in a listed zone relabels that row: same clock, new name.
    const istanbul = addClock(addClock([], city('Europe/Istanbul', 'Istanbul')), city('Europe/Istanbul', 'İzmir'));
    expect(istanbul).toHaveLength(1);
    expect(istanbul[0]?.city).toBe('İzmir');
  });

  it('removes by id, and never removes what was never added', () => {
    const list = sanitizeWorldClocks([
      { id: 'a', zone: 'Asia/Tokyo', city: 'Tokyo' },
      { id: 'b', zone: 'Europe/Paris', city: 'Paris' },
    ]);
    expect(removeClock(list, 'a').map(item => item.id)).toEqual(['b']);
    expect(removeClock(list, 'missing')).toHaveLength(2);
  });

  it('names a zone and tells the time, the offset and the format there', () => {
    expect(zoneCity('America/New_York')).toBe('New York');
    expect(offsetLabel(0)).toBe('UTC');
    expect(offsetLabel(-300)).toBe('UTC−5');
    expect(offsetLabel(330)).toBe('UTC+5:30');
    expect(zoneOffsetMinutes('UTC', new Date())).toBe(0);
    expect(zoneOffsetMinutes('nowhere', new Date())).toBeNull();

    const at = new Date(Date.UTC(2026, 9, 22, 12, 0, 0));
    expect(formatZoneTime('UTC', 'en-GB', at)).toMatch(/12:00/);
    // 24-hour by default, 12-hour on the switch, and never a blank row.
    expect(formatZoneTime('UTC', 'en-GB', at, false)).not.toMatch(/PM/i);
    expect(formatZoneTime('UTC', 'en-US', at, true)).toMatch(/12:00\s*PM/i);
    expect(formatZoneTime('nowhere', 'en-GB', at)).toBe('');
    // Paris is one hour ahead in October, New York four hours behind.
    expect(zoneOffsetMinutes('Europe/Paris', at)).toBe(120);
    expect(zoneOffsetMinutes('America/New_York', at)).toBe(-240);
  });
});
