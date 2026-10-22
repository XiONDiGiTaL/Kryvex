import path from 'node:path';

/**
 * Safety policy for Kryvex's disk tool.
 *
 * Everything here is pure so the guards can be unit-tested without touching a
 * real drive. The renderer only ever sends target *ids*; roots, age filters and
 * file patterns live in this module and never cross the bridge, so a page
 * cannot ask the main process to delete an arbitrary path.
 *
 * The rules are deliberately additive: a file is deletable only when it is
 * strictly inside a root of an enabled target, is not a link, and is not inside
 * a protected root. Unknown ids are refused rather than guessed.
 */

export type DiskRisk = 'safe' | 'caution';

export interface DiskTargetSpec {
  id: string;
  label: string;
  detail: string;
  risk: DiskRisk;
  /** Absolute roots. A directory means its contents; every root must exist. */
  roots: string[];
  /** Only entries at least this old are candidates. */
  minAgeHours?: number;
  /** When set, only direct children of a root whose name starts with one of these. */
  filePrefixes?: string[];
  selectedByDefault: boolean;
  /** Elevated categories are never cleaned by the built-in helper. */
  requiresElevation: boolean;
}

export interface DeletionCheck {
  ok: boolean;
  reason?: 'root' | 'outside' | 'protected' | 'drive';
}

const WINDOWS_SYSTEM_DIRS = [
  'System32',
  'SysWOW64',
  'WinSxS',
  'System Volume Information',
  '$Recycle.Bin',
  'Recovery',
  'Boot',
  'EFI',
];

/** Never delete these, even if a target root is misconfigured. */
export function protectedRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const home = env.USERPROFILE || '';
  const roaming = env.APPDATA || '';
  const windows = env.SystemRoot || env.WINDIR || '';
  // Deliberately does not include the profile itself: %TEMP% and the browser
  // caches live under it, and each target root is already an explicit allowlist
  // entry. These are the subtrees a cleanup must never reach.
  const roots = [
    windows,
    env.ProgramFiles || '',
    env['ProgramFiles(x86)'] || '',
    env.ProgramData || '',
    home && path.join(home, 'Desktop'),
    home && path.join(home, 'Documents'),
    home && path.join(home, 'Downloads'),
    home && path.join(home, 'Pictures'),
    home && path.join(home, 'Videos'),
    home && path.join(home, 'Music'),
    home && path.join(home, 'OneDrive'),
    home && path.join(home, 'Favorites'),
    roaming,
    home && path.join(home, 'AppData', 'LocalLow'),
    home && path.join(home, '.ssh'),
    home && path.join(home, '.gnupg'),
  ];
  if (windows) {
    for (const dir of WINDOWS_SYSTEM_DIRS) roots.push(path.join(windows, dir));
  }
  return roots.filter(Boolean).map(normalize);
}

/** Case- and separator-insensitive form used for every comparison. */
export function normalize(value: string): string {
  return path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
}

/** True when `candidate` sits strictly below `root`. */
export function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(normalize(root), normalize(candidate));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function isDriveRoot(value: string): boolean {
  const resolved = path.resolve(value);
  return normalize(path.parse(resolved).root) === normalize(resolved);
}

export function isProtectedPath(value: string, roots = protectedRoots()): boolean {
  const target = normalize(value);
  return roots.some((root) => target === root || isInside(root, target));
}

/**
 * The single gate every deletion goes through. A candidate must be inside the
 * target root, must not be the root itself, must not be a drive root, and must
 * not fall inside a protected root.
 */
export function checkDeletable(
  root: string,
  candidate: string,
  roots = protectedRoots(),
): DeletionCheck {
  if (!path.isAbsolute(root) || !path.isAbsolute(candidate)) return { ok: false, reason: 'outside' };
  if (isDriveRoot(root) || isDriveRoot(candidate)) return { ok: false, reason: 'drive' };
  const rootNorm = normalize(root);
  const candidateNorm = normalize(candidate);
  if (candidateNorm === rootNorm) return { ok: false, reason: 'root' };
  if (!isInside(rootNorm, candidateNorm)) return { ok: false, reason: 'outside' };
  if (isProtectedPath(candidateNorm, roots)) return { ok: false, reason: 'protected' };
  return { ok: true };
}

export function matchesPrefix(name: string, prefixes: string[] | undefined): boolean {
  if (!prefixes || prefixes.length === 0) return true;
  return prefixes.some((prefix) => name.toLowerCase().startsWith(prefix.toLowerCase()));
}

/** Old files only: a cache written a minute ago is still in use. */
export function isOldEnough(
  modifiedMs: number,
  now: number,
  minAgeHours: number | undefined,
): boolean {
  if (!minAgeHours || minAgeHours <= 0) return true;
  return modifiedMs <= now - minAgeHours * 60 * 60 * 1000;
}

/** Cache/temp locations the built-in cleaner knows how to reason about. */
export function cleanupTargets(env: NodeJS.ProcessEnv = process.env): DiskTargetSpec[] {
  const local = env.LOCALAPPDATA || '';
  const temp = env.TEMP || (local ? path.join(local, 'Temp') : '');
  const chrome = local ? path.join(local, 'Google', 'Chrome', 'User Data') : '';
  const edge = local ? path.join(local, 'Microsoft', 'Edge', 'User Data') : '';

  const browserCaches = (base: string): string[] =>
    base
      ? [
          path.join(base, 'Default', 'Cache'),
          path.join(base, 'Default', 'Code Cache'),
          path.join(base, 'Default', 'GPUCache'),
          path.join(base, 'Default', 'DawnCache'),
        ]
      : [];

  const targets: DiskTargetSpec[] = [
    {
      id: 'user-temp',
      label: 'User temp files',
      detail: 'Files in %TEMP% that no program has touched for a day.',
      risk: 'safe',
      roots: [temp],
      minAgeHours: 24,
      selectedByDefault: true,
      requiresElevation: false,
    },
    {
      id: 'crash-dumps',
      label: 'Crash dumps',
      detail: 'Local crash reports left by applications.',
      risk: 'safe',
      roots: [local ? path.join(local, 'CrashDumps') : ''],
      selectedByDefault: true,
      requiresElevation: false,
    },
    {
      id: 'inet-cache',
      label: 'Windows internet cache',
      detail: 'Downloaded page resources for the legacy Windows cache.',
      risk: 'safe',
      roots: [local ? path.join(local, 'Microsoft', 'Windows', 'INetCache') : ''],
      selectedByDefault: true,
      requiresElevation: false,
    },
    {
      id: 'thumbnail-cache',
      label: 'Thumbnail cache',
      detail: 'Explorer regenerates these previews on demand.',
      risk: 'safe',
      roots: [local ? path.join(local, 'Microsoft', 'Windows', 'Explorer') : ''],
      filePrefixes: ['thumbcache_', 'iconcache_'],
      selectedByDefault: true,
      requiresElevation: false,
    },
    {
      id: 'chrome-cache',
      label: 'Chrome caches',
      detail: 'The default profile’s page, script and GPU caches. Bookmarks, history and sessions stay.',
      risk: 'caution',
      roots: browserCaches(chrome),
      selectedByDefault: false,
      requiresElevation: false,
    },
    {
      id: 'edge-cache',
      label: 'Edge caches',
      detail: 'The default profile’s page, script and GPU caches. History and sessions stay.',
      risk: 'caution',
      roots: browserCaches(edge),
      selectedByDefault: false,
      requiresElevation: false,
    },
    {
      id: 'error-reporting',
      label: 'Error reporting queue',
      detail: 'Queued Windows Error Reporting archives. They are only diagnostics.',
      risk: 'caution',
      roots: [local ? path.join(local, 'Microsoft', 'Windows', 'WER') : ''],
      selectedByDefault: false,
      requiresElevation: false,
    },
  ];
  return targets.filter((target) => target.roots.length > 0 && target.roots.every(Boolean));
}

export function targetById(id: string, env: NodeJS.ProcessEnv = process.env): DiskTargetSpec | null {
  if (typeof id !== 'string' || id.length > 64) return null;
  return cleanupTargets(env).find((target) => target.id === id) ?? null;
}

/** Human-readable size with the units the rest of the app uses. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}
