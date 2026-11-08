/**
 * The rules behind the Activity Center.
 *
 * A service module is somebody else's page, so what it claims to have shown is
 * untrusted input: every field is trimmed, capped and validated here before it
 * reaches the log, and a record that cannot identify its module is dropped
 * rather than drawn as an orphan row.
 *
 * The log is a bounded list in the profile, newest first. It is not a second
 * history file and it never grows: past the cap the oldest entry goes.
 */

export interface ActivityEntry {
  id: string;
  serviceId: string;
  serviceName: string;
  /** The origin that raised it, for a row that has to say where it came from. */
  host: string;
  title: string;
  body: string;
  /** Epoch milliseconds. */
  at: number;
  read: boolean;
}

export interface ActivityInput {
  serviceId: string;
  serviceName?: string;
  host?: string;
  title: string;
  body?: string;
  at?: number;
}

export const ACTIVITY_LIMIT = 200;
const MAX_TITLE = 160;
const MAX_BODY = 400;
const MAX_HOST = 200;
const MAX_NAME = 120;
/** A module repeating itself inside this window is one event, not two. */
const REPEAT_WINDOW = 60_000;

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function stamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** The stored log, with anything a hand-edited profile could smuggle in dropped. */
export function sanitizeActivity(raw: unknown): ActivityEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ActivityEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const value = item as Record<string, unknown>;
    const id = text(value.id, 80);
    const serviceId = text(value.serviceId, 120);
    const title = text(value.title, MAX_TITLE);
    if (!id || !serviceId || !title) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      serviceId,
      serviceName: text(value.serviceName, MAX_NAME) || serviceId,
      host: text(value.host, MAX_HOST),
      title,
      body: text(value.body, MAX_BODY),
      at: stamp(value.at),
      read: value.read === true,
    });
    if (out.length >= ACTIVITY_LIMIT) break;
  }
  return out;
}

/**
 * Add one notification to the log.
 *
 * The same module raising the same title and body again within a minute is the
 * page retrying, not a second event, so the existing row is moved to the front
 * instead of duplicated. Everything else is a new entry, and the list is capped
 * on the way out so no page can grow the profile without limit.
 */
export function recordActivity(
  list: readonly ActivityEntry[],
  input: ActivityInput,
): ActivityEntry[] {
  const serviceId = text(input.serviceId, 120);
  const title = text(input.title, MAX_TITLE);
  if (!serviceId || !title) return [...list];
  const at = stamp(input.at) || Date.now();
  const body = text(input.body, MAX_BODY);
  const previous = list[0];
  if (
    previous &&
    previous.serviceId === serviceId &&
    previous.title === title &&
    previous.body === body &&
    at - previous.at < REPEAT_WINDOW &&
    at >= previous.at
  ) {
    const refreshed: ActivityEntry = { ...previous, at, read: false };
    return [refreshed, ...list.slice(1)].slice(0, ACTIVITY_LIMIT);
  }
  const entry: ActivityEntry = {
    id: `${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    serviceId,
    serviceName: text(input.serviceName, MAX_NAME) || serviceId,
    host: text(input.host, MAX_HOST),
    title,
    body,
    at,
    read: false,
  };
  return [entry, ...list].slice(0, ACTIVITY_LIMIT);
}

/** Mark one entry read, or — with no id — everything. */
export function markActivityRead(
  list: readonly ActivityEntry[],
  id?: string | null,
): ActivityEntry[] {
  if (!id) return list.map(entry => (entry.read ? entry : { ...entry, read: true }));
  return list.map(entry => (entry.id === id && !entry.read ? { ...entry, read: true } : entry));
}

/** Drop everything, or everything one module raised. */
export function clearActivity(
  list: readonly ActivityEntry[],
  serviceId?: string | null,
): ActivityEntry[] {
  if (!serviceId) return [];
  return list.filter(entry => entry.serviceId !== serviceId);
}

export function unreadCount(list: readonly ActivityEntry[]): number {
  return list.reduce((total, entry) => total + (entry.read ? 0 : 1), 0);
}

/**
 * The modules that appear in the log, newest first, with what each still owes
 * the reader. This is what the filter chips are built from.
 */
export function activityServices(
  list: readonly ActivityEntry[],
): Array<{ id: string; name: string; unread: number }> {
  const seen = new Map<string, { id: string; name: string; unread: number }>();
  for (const entry of list) {
    const known = seen.get(entry.serviceId);
    if (known) {
      if (!entry.read) known.unread += 1;
      continue;
    }
    seen.set(entry.serviceId, {
      id: entry.serviceId,
      name: entry.serviceName,
      unread: entry.read ? 0 : 1,
    });
  }
  return [...seen.values()];
}
