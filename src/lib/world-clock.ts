/**
 * The Home board's world clock.
 *
 * Zones are IANA names, validated by asking `Intl` to format with them: an
 * unknown name throws, which is the only reliable check that works offline.
 * With nothing chosen the widget shows what the system already knows, so it is
 * useful before it is configured.
 */
export const MAX_WORLD_CLOCKS = 4;

/** The zones offered in the picker: one per region, not an exhaustive list. */
export const COMMON_ZONES: readonly string[] = [
  'UTC',
  'Europe/London',
  'Europe/Lisbon',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Jerusalem',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Perth',
  'Australia/Sydney',
  'Pacific/Auckland',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
];

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

/**
 * What and where, in the order the user chose. Unknown names and repeats are
 * dropped rather than shown as a broken row.
 */
export function sanitizeWorldClocks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (!isValidTimeZone(item) || out.includes(item)) continue;
    out.push(item);
    if (out.length === MAX_WORLD_CLOCKS) break;
  }
  return out;
}

/** The rows to draw: the chosen zones, or the local one plus UTC. */
export function shownZones(chosen: string[]): string[] {
  const list = sanitizeWorldClocks(chosen);
  if (list.length > 0) return list;
  const local = systemZone();
  return local && local !== 'UTC' ? [local, 'UTC'] : ['UTC'];
}

export function toggleZone(chosen: string[], zone: string): string[] {
  if (!isValidTimeZone(zone)) return sanitizeWorldClocks(chosen);
  if (chosen.includes(zone)) return chosen.filter(item => item !== zone);
  if (chosen.length >= MAX_WORLD_CLOCKS) return chosen;
  return [...chosen, zone];
}

/** `America/New_York` reads as "New York". */
export function zoneCity(zone: string): string {
  const parts = zone.split('/');
  return (parts[parts.length - 1] ?? zone).replace(/_/g, ' ');
}

export function formatZoneTime(zone: string, locale: string, at: Date = new Date()): string {
  if (!isValidTimeZone(zone)) return '';
  try {
    return at.toLocaleTimeString(locale, { timeZone: zone, hour: '2-digit', minute: '2-digit' });
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
