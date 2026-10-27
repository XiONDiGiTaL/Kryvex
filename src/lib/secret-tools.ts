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
  'arcade',
  'forge',
  'canvas',
];

export const SECRET_TOOL_LABELS: Record<SecretToolId, string> = {
  lexium: 'Lexium',
  player: 'Media player',
  emulator: 'Secret emulator',
  disk: 'Disk pulse',
  link: 'Kryvex Link',
  arcade: 'Arcade',
  forge: 'File Forge',
  canvas: 'Canvas',
};

/**
 * The three tools that are a plain view rather than a page.
 *
 * They keep no session and no guest of their own, so they can be mounted twice
 * without fighting over one connection: that is what lets them be dropped into
 * a Workspace window while the tool is also open in the main area. The other
 * built-ins own a partition or a main-process server and stay single-instance.
 */
export const EMBEDDABLE_TOOL_IDS: readonly SecretToolId[] = [
  'arcade',
  'forge',
  'canvas',
];

export function isEmbeddableTool(value: unknown): value is SecretToolId {
  return isSecretToolId(value) && EMBEDDABLE_TOOL_IDS.includes(value);
}

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
