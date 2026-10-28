/**
 * The pinned Flycast release, as the main process sees it.
 *
 * The renderer has its own copy in `src/lib/flycast.ts` — the two processes
 * have separate TypeScript roots (`rootDir: electron`), so a shared module is
 * not available to both. `tests/flycast.test.ts` reads this file and compares
 * every field, so the copies cannot drift apart silently: a hash changed in one
 * place and not the other fails the suite.
 *
 * Only these URLs are ever fetched. The renderer can ask that the engine be
 * installed, and it can ask for the installed bytes; it cannot name a host, a
 * path or a version, so a compromised renderer cannot turn this into a general
 * downloader.
 */
import path from 'node:path';

export interface FlycastAsset {
  /** File name on disk and inside the payload the frontend reads. */
  name: string;
  url: string;
  bytes: number;
  sha256: string;
}

const RELEASE_ROOT = 'https://github.com/nasomers/flycast-wasm/releases/download/v1.0';

export const FLYCAST_CATALOGUE = {
  version: 'v1.0',
  label: 'flycast-wasm v1.0',
  project: 'https://github.com/nasomers/flycast-wasm',
  upstream: 'https://github.com/flyinghead/flycast',
  licence: 'GPLv2',
  js: {
    name: 'flycast_libretro.js',
    url: `${RELEASE_ROOT}/flycast_libretro.js`,
    bytes: 312644,
    sha256: '1f2ae9afafa85c8ff577ca3961be0343c2ac394ddc79285981f0d55ad75dbd7b',
  },
  wasm: {
    name: 'flycast_libretro.wasm',
    url: `${RELEASE_ROOT}/flycast_libretro.wasm`,
    bytes: 10398725,
    sha256: 'db2b87d8d2742087a56c4eeed317da14e3549ee037e36de3d77c1e6e5291bead',
  },
} as const satisfies {
  version: string;
  label: string;
  project: string;
  upstream: string;
  licence: string;
  js: FlycastAsset;
  wasm: FlycastAsset;
};

/** Everything one install has to fetch, in the order it is fetched. */
export const FLYCAST_ASSETS: FlycastAsset[] = [FLYCAST_CATALOGUE.js, FLYCAST_CATALOGUE.wasm];

export const FLYCAST_INSTALL_BYTES = FLYCAST_ASSETS.reduce((total, asset) => total + asset.bytes, 0);

/** Where a verified install lives: one directory per pinned version. */
export function flycastLayout(root: string): { dir: string; js: string; wasm: string } {
  const dir = path.join(root, FLYCAST_CATALOGUE.version);
  return {
    dir,
    js: path.join(dir, FLYCAST_CATALOGUE.js.name),
    wasm: path.join(dir, FLYCAST_CATALOGUE.wasm.name),
  };
}

/** A file already on disk, described the way the assets are. */
export function installedAsset(name: string, bytes: number): FlycastAsset | null {
  return FLYCAST_ASSETS.find(asset => asset.name === name && asset.bytes === bytes) ?? null;
}
