import type { SecretToolId } from '../types';

/**
 * The in-house tools, in the order the Services page lists them.
 *
 * They are services to the user — same rail, same one-click reach — but they
 * have no URL, category, colour or session, so they cannot live in the service
 * array. The names here are also their translation keys on the Services page,
 * which is why the pin controls can label a tool without owning their own copy.
 */
export const SECRET_TOOL_IDS: readonly SecretToolId[] = [
  'lexium',
  'player',
  'emulator',
  'disk',
  'link',
];

export const SECRET_TOOL_LABELS: Record<SecretToolId, string> = {
  lexium: 'Lexium',
  player: 'Media player',
  emulator: 'Secret emulator',
  disk: 'Disk pulse',
  link: 'Kyvex Link',
};

export function isSecretToolId(value: unknown): value is SecretToolId {
  return typeof value === 'string' && (SECRET_TOOL_IDS as readonly string[]).includes(value);
}

/**
 * A saved pin list is untrusted like the rest of the state file: an older
 * build has no field at all, and a hand-edited one can name anything.
 */
export function sanitizePinnedTools(raw: unknown): SecretToolId[] {
  if (!Array.isArray(raw)) return [];
  const pinned: SecretToolId[] = [];
  for (const item of raw) {
    if (isSecretToolId(item) && !pinned.includes(item)) pinned.push(item);
  }
  return pinned;
}
