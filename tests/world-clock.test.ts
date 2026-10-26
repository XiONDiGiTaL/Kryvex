import { describe, expect, it } from 'vitest';
import {
  MAX_WORLD_CLOCKS,
  formatZoneTime,
  isValidTimeZone,
  offsetLabel,
  sanitizeWorldClocks,
  shownZones,
  toggleZone,
  zoneCity,
  zoneOffsetMinutes,
} from '../src/lib/world-clock';

describe('world clock', () => {
  it('accepts real IANA zones and refuses the rest', () => {
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });

  it('keeps four zones, in order, without repeats', () => {
    const list = sanitizeWorldClocks([
      'Asia/Tokyo',
      'Asia/Tokyo',
      'nowhere',
      'Europe/Paris',
      'UTC',
      'America/Chicago',
      'Pacific/Auckland',
    ]);
    expect(list).toEqual(['Asia/Tokyo', 'Europe/Paris', 'UTC', 'America/Chicago']);
    expect(list).toHaveLength(MAX_WORLD_CLOCKS);
  });

  it('shows something useful before anything is chosen', () => {
    const fallback = shownZones([]);
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback.length).toBeLessThanOrEqual(MAX_WORLD_CLOCKS);
    expect(fallback.every(zone => isValidTimeZone(zone))).toBe(true);
    expect(shownZones(['Asia/Tokyo'])).toEqual(['Asia/Tokyo']);
  });

  it('adds and removes without ever exceeding the cap', () => {
    let chosen: string[] = [];
    for (const zone of ['UTC', 'Europe/Paris', 'Asia/Tokyo', 'America/Chicago', 'Asia/Seoul']) {
      chosen = toggleZone(chosen, zone);
    }
    expect(chosen).toHaveLength(MAX_WORLD_CLOCKS);
    expect(toggleZone(chosen, 'Europe/Paris')).not.toContain('Europe/Paris');
    expect(toggleZone(chosen, 'nowhere')).toEqual(chosen);
  });

  it('names a zone and tells the time and the offset there', () => {
    expect(zoneCity('America/New_York')).toBe('New York');
    expect(offsetLabel(0)).toBe('UTC');
    expect(offsetLabel(-300)).toBe('UTC−5');
    expect(offsetLabel(330)).toBe('UTC+5:30');
    expect(zoneOffsetMinutes('UTC', new Date())).toBe(0);
    expect(zoneOffsetMinutes('nowhere', new Date())).toBeNull();

    const at = new Date(Date.UTC(2026, 9, 22, 12, 0, 0));
    expect(formatZoneTime('UTC', 'en-GB', at)).toMatch(/12:00/);
    // Paris is one hour ahead in October, New York four hours behind.
    expect(zoneOffsetMinutes('Europe/Paris', at)).toBe(120);
    expect(zoneOffsetMinutes('America/New_York', at)).toBe(-240);
    expect(formatZoneTime('nowhere', 'en-GB', at)).toBe('');
  });
});
