import type { WorldClockCity } from '../types';

/**
 * The Home board's world clock.
 *
 * A row is a *place*, not a zone: two cities can share `Europe/Istanbul`, and a
 * user in one of them should read their own city rather than whichever regional
 * name the zone happens to carry. The zone is still what tells the time, and it
 * is validated by asking `Intl` to format with it — an unknown name throws, which
 * is the only reliable check that works offline.
 *
 * With nothing chosen the widget shows what the system already knows, so it is
 * useful before it is configured.
 */
export const MAX_WORLD_CLOCKS = 4;
const MAX_LABEL = 80;

export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !zone || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The zone this machine reports, if it reports a usable one. */
export function systemZone(): string | null {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

/** `America/New_York` reads as "New York". */
export function zoneCity(zone: string): string {
  const parts = zone.split('/');
  return (parts[parts.length - 1] ?? zone).replace(/_/g, ' ');
}

function cleanLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const text = value.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, MAX_LABEL) : fallback;
}

function finite(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.round(number * 10_000) / 10_000 : undefined;
}

/**
 * A saved row, whichever shape it was saved in.
 *
 * Before cities existed this field held bare zone names (`Asia/Tokyo`). Those
 * still load, labelled from the zone, so an existing board keeps its clocks.
 * Unknown zones are dropped rather than drawn as a broken row.
 */
function entryFrom(item: unknown): WorldClockCity | null {
  if (typeof item === 'string') {
    if (!isValidTimeZone(item)) return null;
    return { id: item, zone: item, city: zoneCity(item) };
  }
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  if (!isValidTimeZone(record.zone)) return null;
  const zone = record.zone;
  const city = cleanLabel(record.city, zoneCity(zone));
  const country = typeof record.country === 'string' ? cleanLabel(record.country, '') : '';
  const latitude = finite(record.latitude);
  const longitude = finite(record.longitude);
  const id = cleanLabel(record.id, zone) || zone;
  return {
    id,
    zone,
    city,
    ...(country ? { country } : {}),
    ...(latitude !== undefined && Math.abs(latitude) <= 90 ? { latitude } : {}),
    ...(longitude !== undefined && Math.abs(longitude) <= 180 ? { longitude } : {}),
  };
}

/** One row per zone, in the order the user chose, and never more than four. */
export function sanitizeWorldClocks(raw: unknown): WorldClockCity[] {
  if (!Array.isArray(raw)) return [];
  const out: WorldClockCity[] = [];
  const zones = new Set<string>();
  for (const item of raw) {
    const entry = entryFrom(item);
    if (!entry || zones.has(entry.zone)) continue;
    zones.add(entry.zone);
    out.push(entry);
    if (out.length === MAX_WORLD_CLOCKS) break;
  }
  return out;
}

/** The rows to draw: the chosen places, or this machine plus UTC. */
export function shownClocks(chosen: WorldClockCity[]): WorldClockCity[] {
  const list = sanitizeWorldClocks(chosen);
  if (list.length > 0) return list;
  const local = systemZone();
  const fallback: WorldClockCity[] = [];
  if (local) fallback.push({ id: `system:${local}`, zone: local, city: zoneCity(local) });
  if (local !== 'UTC') fallback.push({ id: 'utc', zone: 'UTC', city: 'UTC' });
  return fallback;
}

/** The id a looked-up city gets: its zone, so one row per zone holds. */
export function clockId(zone: string, city: string): string {
  return `${zone}:${city.toLowerCase()}`.slice(0, 120);
}

/**
 * Adds a place, or relabels the row for that zone.
 *
 * Adding `İzmir` where `Europe/Istanbul` is already listed replaces the label
 * instead of stacking a second row with the same time. A fifth zone is refused.
 */
export function addClock(list: WorldClockCity[], entry: WorldClockCity): WorldClockCity[] {
  const current = sanitizeWorldClocks(list);
  const parsed = entryFrom(entry);
  if (!parsed) return current;
  const existing = current.findIndex(item => item.zone === parsed.zone);
  if (existing >= 0) {
    const next = current.slice();
    next[existing] = { ...parsed, id: current[existing]?.id ?? parsed.id };
    return next;
  }
  if (current.length >= MAX_WORLD_CLOCKS) return current;
  return [...current, parsed];
}

export function removeClock(list: WorldClockCity[], id: string): WorldClockCity[] {
  return sanitizeWorldClocks(list).filter(item => item.id !== id);
}

export function formatZoneTime(
  zone: string,
  locale: string,
  at: Date = new Date(),
  hour12 = false,
): string {
  if (!isValidTimeZone(zone)) return '';
  try {
    return at.toLocaleTimeString(locale, {
      timeZone: zone,
      hour12,
      hour: hour12 ? 'numeric' : '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** Minutes east of UTC for a zone at an instant, used for the day offset chip. */
export function zoneOffsetMinutes(zone: string, at: Date = new Date()): number | null {
  if (!isValidTimeZone(zone)) return null;
  // The parts carry minutes, not seconds, so compare against a whole minute:
  // the leftover seconds would otherwise land on the wrong side of a round.
  const wholeMinute = Math.floor(at.getTime() / 60_000) * 60_000;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(wholeMinute));
    const read = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 'NaN');
    const asUtc = Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      read('hour') % 24,
      read('minute'),
    );
    if (!Number.isFinite(asUtc)) return null;
    const rounded = Math.round((asUtc - wholeMinute) / 60_000);
    // `Math.round` can hand back -0, which would read as an odd offset.
    return Math.abs(rounded) > 24 * 60 ? null : rounded || 0;
  } catch {
    return null;
  }
}

/** "UTC+2", "UTC−5", or "UTC" for the zero offset. */
export function offsetLabel(minutes: number): string {
  if (minutes === 0) return 'UTC';
  const sign = minutes > 0 ? '+' : '−';
  const total = Math.abs(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return `UTC${sign}${hours}${rest ? `:${`${rest}`.padStart(2, '0')}` : ''}`;
}

/** A short weekday when the zone is on another calendar day, else empty. */
export function zoneDayShift(zone: string, locale: string, at: Date = new Date()): string {
  if (!isValidTimeZone(zone)) return '';
  try {
    const there = at.toLocaleDateString(locale, { timeZone: zone, weekday: 'short' });
    const here = at.toLocaleDateString(locale, { weekday: 'short' });
    return there === here ? '' : there;
  } catch {
    return '';
  }
}
