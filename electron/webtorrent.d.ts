/**
 * WebTorrent ships as ESM without TypeScript declarations. These are the small
 * parts of its public runtime surface Kryvex uses; the manager still loads the
 * real package dynamically so the CommonJS Electron main bundle stays valid.
 */
declare module 'webtorrent' {
  export interface TorrentFile {
    name: string;
    path: string;
    length: number;
    downloaded: number;
    progress: number;
    select?: (priority?: number) => void;
    deselect?: () => void;
  }

  export interface TorrentWire {
    isSeeder?: boolean;
    destroy?: () => void;
  }

  export interface Torrent {
    infoHash: string;
    name: string;
    length: number;
    magnetURI?: string;
    announce?: string[];
    urlList?: string[];
    files: TorrentFile[];
    wires: TorrentWire[];
    numPeers: number;
    downloaded: number;
    uploaded: number;
    downloadSpeed: number;
    uploadSpeed: number;
    progress: number;
    ratio: number;
    timeRemaining: number;
    paused: boolean;
    done: boolean;
    ready: boolean;
    destroyed: boolean;
    path: string;
    discovery?: {
      tracker?: {
        update?: () => void;
      };
    };
    on: (event: string, listener: (...args: any[]) => void) => Torrent;
    once: (event: string, listener: (...args: any[]) => void) => Torrent;
    removeListener: (event: string, listener: (...args: any[]) => void) => Torrent;
    pause: () => void;
    resume: () => void;
    destroy: (opts?: { destroyStore?: boolean }, callback?: (error?: Error) => void) => void;
  }

  export interface WebTorrentOptions {
    maxConns?: number;
    dht?: boolean;
    tracker?: boolean | Record<string, unknown>;
    lsd?: boolean;
    utPex?: boolean;
    utp?: boolean;
    natUpnp?: boolean;
    natPmp?: boolean;
    webSeeds?: boolean;
    downloadLimit?: number;
    uploadLimit?: number;
  }

  export default class WebTorrent {
    constructor(opts?: WebTorrentOptions);
    torrents: Torrent[];
    dht: unknown | false;
    utp: boolean;
    lsd: boolean;
    utPex: boolean;
    destroyed: boolean;
    on: (event: string, listener: (...args: any[]) => void) => WebTorrent;
    once: (event: string, listener: (...args: any[]) => void) => WebTorrent;
    removeListener: (event: string, listener: (...args: any[]) => void) => WebTorrent;
    add: (
      torrentId: string | Uint8Array,
      opts?: { path?: string; announce?: string[]; paused?: boolean; addUID?: boolean },
      onTorrent?: (torrent: Torrent) => void,
    ) => Torrent;
    remove: (torrentId: string | Torrent, opts?: { destroyStore?: boolean }) => Promise<void>;
    destroy: (callback?: (error?: Error) => void) => void;
  }
}
