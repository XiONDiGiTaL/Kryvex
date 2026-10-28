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
 * Every built-in can be dropped into a Workspace window.
 *
 * They used to be split in two: Arcade, File Forge and Canvas had no session of
 * their own and could be mounted twice, while Lexium, the player, the emulator,
 * Disk pulse and the link own a partition, a server or a running core and were
 * kept out. The rule is now the same for all of them, and the difference is
 * handled where it belongs — a single-instance tool shows a docking card on its
 * route while its window holds the only copy, so the feature is reachable from
 * the canvas without ever running two of it.
 */
export const EMBEDDABLE_TOOL_IDS: readonly SecretToolId[] = [...SECRET_TOOL_IDS];

/**
 * The tools that must exist once, in the route or in a window, never both.
 *
 * Each of these owns something a second copy would duplicate: Lexium a server
 * session, the player a queue and an audio graph, the emulator a running core,
 * Disk pulse a polling service and Kryvex Link a listening socket.
 */
export const SINGLETON_TOOL_IDS: readonly SecretToolId[] = [
  'lexium',
  'player',
  'emulator',
  'disk',
  'link',
];

export function isEmbeddableTool(value: unknown): value is SecretToolId {
  return isSecretToolId(value) && EMBEDDABLE_TOOL_IDS.includes(value);
}

export function isSingletonTool(value: unknown): value is SecretToolId {
  return isSecretToolId(value) && SINGLETON_TOOL_IDS.includes(value);
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
