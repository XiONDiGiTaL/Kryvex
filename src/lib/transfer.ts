import {
  MAX_ACTIVE_TRANSFERS,
  TRANSFER_CHUNK_BYTES,
  TRANSFER_WINDOW,
  clampTransferSize,
  isFinishedTransfer,
  newTransferId,
  sanitizeTransferName,
  transferChunks,
  type TransferRow,
} from './transfer-rules';

/**
 * Rooms file transfer engine.
 *
 * Two people in a room can send each other a file directly: the bytes travel as
 * chunks over the WebRTC data channels the room already has, so there is no
 * upload, no server and no size limit. The receiver picks the destination with
 * a native save dialog before the first byte is accepted.
 *
 * The wire carries two actions. `control` is a JSON frame (offer, accept,
 * credit, end, done, cancel, fail); `chunk` is a binary frame with `{id, seq}`
 * metadata. The receiver writes each chunk to disk before returning a credit, so
 * a fast sender is throttled to a slow disk instead of filling memory.
 *
 * The engine owns no DOM and no filesystem: the ports below are the room and the
 * main process, which is what makes it testable in a plain Node process.
 */

export interface TransferControl {
  [key: string]: string | number;
  kind: 'offer' | 'accept' | 'decline' | 'begin' | 'credit' | 'end' | 'done' | 'cancel' | 'fail';
  id: string;
  name: string;
  size: number;
  chunks: number;
  credits: number;
  reason: string;
}

export interface TransferChunkMeta {
  [key: string]: string | number;
  id: string;
  seq: number;
}

export interface TransferSink {
  token: string;
  path: string;
}

export interface TransferPorts {
  /** Send a control frame; an empty peer id broadcasts to the room. */
  control: (payload: TransferControl, peerId: string) => Promise<void>;
  /** Send one chunk to one peer. */
  chunk: (bytes: Uint8Array, meta: TransferChunkMeta, peerId: string) => Promise<void>;
  /** Ask the user where to keep this file; null when they close the dialog. */
  openSink?: (request: { name: string; size: number }) => Promise<TransferSink | null>;
  /** Append one chunk; resolves to the bytes now on disk, or 0. */
  writeSink?: (token: string, bytes: Uint8Array) => Promise<number>;
  /** Close the file; resolves to its final path, or null. */
  finishSink?: (token: string) => Promise<string | null>;
  abortSink?: (token: string) => Promise<void>;
  onChange?: (rows: TransferRow[]) => void;
}

interface Outbound {
  file: File;
  peerId: string;
  credits: number;
  running: boolean;
  total: number;
  seq: number;
}

interface Inbound {
  token: string;
  path: string;
  next: number;
  bytes: number;
  total: number;
}

const CONTROL_KINDS = new Set([
  'offer',
  'accept',
  'decline',
  'begin',
  'credit',
  'end',
  'done',
  'cancel',
  'fail',
]);

interface ControlPatch {
  name?: string;
  size?: number;
  chunks?: number;
  credits?: number;
  reason?: string;
}

function control(
  kind: TransferControl['kind'],
  id: string,
  patch: ControlPatch = {},
): TransferControl {
  return {
    kind,
    id,
    name: patch.name ?? '',
    size: patch.size ?? 0,
    chunks: patch.chunks ?? 0,
    credits: patch.credits ?? 0,
    reason: patch.reason ?? '',
  };
}

function normalizeControl(raw: unknown): TransferControl | null {
  const source = (raw ?? {}) as Partial<TransferControl>;
  const kind = typeof source.kind === 'string' ? source.kind : '';
  if (!CONTROL_KINDS.has(kind)) return null;
  const id = typeof source.id === 'string' ? source.id.slice(0, 64) : '';
  if (!id) return null;
  const numeric = (value: unknown, max: number): number => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(max, Math.floor(number))) : 0;
  };
  const name = typeof source.name === 'string' ? source.name.slice(0, 240) : '';
  const size = clampTransferSize(source.size) ?? 0;
  const chunks = numeric(source.chunks, Number.MAX_SAFE_INTEGER);
  const credits = numeric(source.credits, TRANSFER_WINDOW);
  const reason = typeof source.reason === 'string' ? source.reason.slice(0, 60) : '';
  return { kind: kind as TransferControl['kind'], id, name, size, chunks, credits, reason };
}

function normalizeChunkMeta(raw: unknown): TransferChunkMeta | null {
  const source = (raw ?? {}) as Partial<TransferChunkMeta>;
  const id = typeof source.id === 'string' ? source.id.slice(0, 64) : '';
  const seq = Number(source.seq);
  if (!id || !Number.isFinite(seq) || seq < 0) return null;
  return { id, seq: Math.floor(seq) };
}

export class TransferEngine {
  private rows = new Map<string, TransferRow>();
  private order: string[] = [];
  private outbound = new Map<string, Outbound>();
  private inbound = new Map<string, Inbound>();
  private waiters = new Map<string, (() => void)[]>();
  private disposed = false;

  constructor(private ports: TransferPorts) {}

  list(): TransferRow[] {
    return this.order.map(id => this.rows.get(id)).filter((row): row is TransferRow => Boolean(row));
  }

  private openCount(): number {
    return this.list().filter(row => !isFinishedTransfer(row)).length;
  }

  private add(row: TransferRow): void {
    this.rows.set(row.id, row);
    this.order.push(row.id);
    this.emit();
  }

  private patch(id: string, patch: Partial<TransferRow>): void {
    const row = this.rows.get(id);
    if (!row) return;
    this.rows.set(id, { ...row, ...patch });
    this.emit();
  }

  private emit(): void {
    this.ports.onChange?.(this.list());
  }

  private wake(id: string): void {
    const waiting = this.waiters.get(id);
    if (!waiting) return;
    this.waiters.delete(id);
    for (const resolve of waiting) resolve();
  }

  private waitForCredit(id: string): Promise<void> {
    return new Promise(resolve => {
      const list = this.waiters.get(id) ?? [];
      list.push(resolve);
      this.waiters.set(id, list);
    });
  }

  private rateOf(row: TransferRow, done: number): number {
    if (!row.startedAt) return 0;
    const seconds = (Date.now() - row.startedAt) / 1000;
    return seconds > 0.25 ? done / seconds : 0;
  }

  /**
   * Offer files to the room.
   *
   * The offer is broadcast; the first peer to accept gets the bytes. A second
   * accept is declined so two peers cannot both pull the same file into one
   * `File` handle's stream.
   */
  offer(files: File[]): number {
    let offered = 0;
    for (const file of files) {
      if (!file || this.openCount() >= MAX_ACTIVE_TRANSFERS) break;
      const size = clampTransferSize(file.size);
      if (size === null) continue;
      const id = newTransferId();
      const name = sanitizeTransferName(file.name);
      const total = transferChunks(size);
      this.add({
        id,
        direction: 'send',
        peerId: '',
        name,
        size,
        done: 0,
        state: 'offered',
        rate: 0,
        startedAt: 0,
      });
      this.outbound.set(id, { file, peerId: '', credits: 0, running: false, total, seq: 0 });
      void this.ports
        .control(control('offer', id, { name, size, chunks: total }), '')
        .catch(() => undefined);
      offered += 1;
    }
    return offered;
  }

  /** Receiver side: choose a destination, then let the sender start. */
  async accept(id: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.direction !== 'receive' || row.state !== 'offered') return false;
    const { openSink, writeSink, finishSink } = this.ports;
    if (!openSink || !writeSink || !finishSink) return false;
    this.patch(id, { state: 'waiting' });
    let sink: TransferSink | null = null;
    try {
      sink = await openSink({ name: row.name, size: row.size });
    } catch {
      sink = null;
    }
    if (!sink) {
      this.patch(id, { state: 'cancelled', error: 'no-destination', endedAt: Date.now() });
      void this.ports
        .control(control('decline', id, { reason: 'no-destination' }), row.peerId)
        .catch(() => undefined);
      return false;
    }
    this.inbound.set(id, {
      token: sink.token,
      path: sink.path,
      next: 0,
      bytes: 0,
      total: transferChunks(row.size),
    });
    this.patch(id, { state: 'active', path: sink.path, startedAt: Date.now() });
    try {
      await this.ports.control(
        control('accept', id, { credits: TRANSFER_WINDOW }),
        row.peerId,
      );
    } catch {
      this.failInbound(id, 'send-failed', row.peerId);
      return false;
    }
    return true;
  }

  decline(id: string): boolean {
    const row = this.rows.get(id);
    if (!row || row.direction !== 'receive' || row.state !== 'offered') return false;
    this.patch(id, { state: 'declined', endedAt: Date.now() });
    void this.ports
      .control(control('decline', id, { reason: 'declined' }), row.peerId)
      .catch(() => undefined);
    return true;
  }

  cancel(id: string): boolean {
    const row = this.rows.get(id);
    if (!row || isFinishedTransfer(row)) return false;
    const inbox = this.inbound.get(id);
    if (inbox) {
      this.inbound.delete(id);
      void this.ports.abortSink?.(inbox.token).catch(() => undefined);
    }
    this.outbound.delete(id);
    this.patch(id, { state: 'cancelled', endedAt: Date.now(), rate: 0 });
    this.wake(id);
    const peer = row.peerId || this.outbound.get(id)?.peerId || '';
    if (peer) {
      void this.ports
        .control(control('cancel', id, { reason: 'cancelled' }), peer)
        .catch(() => undefined);
    }
    return true;
  }

  /** Drop every finished row; a transfer still running stays where it is. */
  clear(): boolean {
    const kept = this.list().filter(row => !isFinishedTransfer(row));
    if (kept.length === this.order.length) return false;
    this.rows = new Map(kept.map(row => [row.id, row]));
    this.order = kept.map(row => row.id);
    this.emit();
    return true;
  }

  /** A peer left: whatever it was sending or receiving ends here. */
  peerLeft(peerId: string): void {
    const affected = this.list().filter(row => row.peerId === peerId && !isFinishedTransfer(row));
    for (const row of affected) {
      const inbox = this.inbound.get(row.id);
      if (inbox) {
        this.inbound.delete(row.id);
        void this.ports.abortSink?.(inbox.token).catch(() => undefined);
      }
      this.outbound.delete(row.id);
      this.patch(row.id, { state: 'failed', error: 'peer-left', endedAt: Date.now(), rate: 0 });
      this.wake(row.id);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const inbox of this.inbound.values()) {
      void this.ports.abortSink?.(inbox.token).catch(() => undefined);
    }
    for (const id of this.waiters.keys()) this.wake(id);
    this.inbound.clear();
    this.outbound.clear();
    this.rows.clear();
    this.order = [];
  }

  /** One control frame from the room. */
  onControl(raw: unknown, peerId: string): void {
    if (this.disposed) return;
    const payload = normalizeControl(raw);
    if (!payload) return;
    if (payload.kind === 'offer') {
      this.receiveOffer(payload, peerId);
      return;
    }
    const row = this.rows.get(payload.id);
    if (!row) return;

    if (payload.kind === 'accept') {
      const job = this.outbound.get(payload.id);
      if (!job || job.running || row.direction !== 'send') return;
      if (job.peerId && job.peerId !== peerId) {
        void this.ports
          .control(control('decline', payload.id, { reason: 'busy' }), peerId)
          .catch(() => undefined);
        return;
      }
      job.peerId = peerId;
      job.credits = Math.max(1, Math.min(TRANSFER_WINDOW, payload.credits || TRANSFER_WINDOW));
      this.patch(payload.id, { state: 'active', peerId, startedAt: Date.now() });
      void this.pump(payload.id);
      return;
    }

    if (payload.kind === 'credit') {
      const job = this.outbound.get(payload.id);
      if (!job) return;
      job.credits += Math.max(0, payload.credits);
      this.wake(payload.id);
      return;
    }

    if (payload.kind === 'decline') {
      if (row.direction !== 'send') return;
      this.outbound.delete(payload.id);
      this.patch(payload.id, {
        state: 'declined',
        error: payload.reason === 'no-destination' ? 'no-destination' : payload.reason === 'busy' ? 'busy' : '',
        endedAt: Date.now(),
        rate: 0,
      });
      return;
    }

    if (payload.kind === 'cancel' || payload.kind === 'fail') {
      const inbox = this.inbound.get(payload.id);
      if (inbox) {
        this.inbound.delete(payload.id);
        void this.ports.abortSink?.(inbox.token).catch(() => undefined);
      }
      this.outbound.delete(payload.id);
      this.wake(payload.id);
      this.patch(payload.id, {
        state: payload.kind === 'cancel' ? 'cancelled' : 'failed',
        error: payload.kind === 'cancel' ? 'cancelled' : payload.reason || 'send-failed',
        endedAt: Date.now(),
        rate: 0,
      });
      return;
    }

    if (payload.kind === 'done') {
      if (row.direction !== 'send') return;
      this.patch(payload.id, { state: 'done', done: row.size, endedAt: Date.now(), rate: 0 });
      return;
    }

    if (payload.kind === 'end') {
      if (row.direction !== 'receive') return;
      void this.finishInbound(payload.id, peerId);
    }
  }

  /** One binary chunk from the room. */
  async onChunk(bytes: Uint8Array, rawMeta: unknown, peerId: string): Promise<void> {
    if (this.disposed) return;
    const meta = normalizeChunkMeta(rawMeta);
    if (!meta) return;
    const row = this.rows.get(meta.id);
    const inbox = this.inbound.get(meta.id);
    if (!row || !inbox || row.direction !== 'receive' || row.state !== 'active') return;
    if (meta.seq !== inbox.next) {
      this.failInbound(meta.id, 'out-of-order', peerId);
      return;
    }
    if (bytes.byteLength === 0 || bytes.byteLength > TRANSFER_CHUNK_BYTES) {
      this.failInbound(meta.id, 'size-mismatch', peerId);
      return;
    }
    const write = this.ports.writeSink;
    if (!write) {
      this.failInbound(meta.id, 'write-failed', peerId);
      return;
    }
    let written = 0;
    try {
      written = await write(inbox.token, bytes);
    } catch {
      written = 0;
    }
    if (written !== bytes.byteLength) {
      this.failInbound(meta.id, 'write-failed', peerId);
      return;
    }
    inbox.next += 1;
    inbox.bytes += written;
    this.patch(meta.id, { done: inbox.bytes, rate: this.rateOf(row, inbox.bytes) });
    try {
      await this.ports.control(control('credit', meta.id, { credits: 1 }), peerId);
    } catch {
      this.failInbound(meta.id, 'send-failed', peerId);
    }
  }

  private receiveOffer(payload: TransferControl, peerId: string): void {
    if (this.rows.has(payload.id)) return;
    if (this.openCount() >= MAX_ACTIVE_TRANSFERS) {
      void this.ports
        .control(control('decline', payload.id, { reason: 'busy' }), peerId)
        .catch(() => undefined);
      return;
    }
    const size = clampTransferSize(payload.size);
    if (size === null) {
      void this.ports
        .control(control('decline', payload.id, { reason: 'invalid' }), peerId)
        .catch(() => undefined);
      return;
    }
    this.add({
      id: payload.id,
      direction: 'receive',
      peerId,
      name: sanitizeTransferName(payload.name),
      size,
      done: 0,
      state: 'offered',
      rate: 0,
      startedAt: 0,
    });
  }

  private async finishInbound(id: string, peerId: string): Promise<void> {
    const row = this.rows.get(id);
    const inbox = this.inbound.get(id);
    if (!row || !inbox) return;
    if (inbox.bytes !== row.size || inbox.next !== inbox.total) {
      this.failInbound(id, 'size-mismatch', peerId);
      return;
    }
    this.inbound.delete(id);
    let path: string | null = null;
    try {
      path = this.ports.finishSink ? await this.ports.finishSink(inbox.token) : null;
    } catch {
      path = null;
    }
    if (!path) {
      this.patch(id, { state: 'failed', error: 'write-failed', endedAt: Date.now(), rate: 0 });
      void this.ports
        .control(control('fail', id, { reason: 'write-failed' }), peerId)
        .catch(() => undefined);
      return;
    }
    this.patch(id, { state: 'saved', done: row.size, path, endedAt: Date.now(), rate: 0 });
    void this.ports.control(control('done', id), peerId).catch(() => undefined);
  }

  private failInbound(id: string, code: string, peerId: string): void {
    const inbox = this.inbound.get(id);
    if (inbox) {
      this.inbound.delete(id);
      void this.ports.abortSink?.(inbox.token).catch(() => undefined);
    }
    this.outbound.delete(id);
    this.patch(id, { state: 'failed', error: code, endedAt: Date.now(), rate: 0 });
    void this.ports.control(control('fail', id, { reason: code }), peerId).catch(() => undefined);
  }

  /** Sender loop: one chunk at a time while the receiver keeps crediting. */
  private async pump(id: string): Promise<void> {
    const job = this.outbound.get(id);
    if (!job || job.running) return;
    job.running = true;
    try {
      while (job.seq < job.total) {
        const row = this.rows.get(id);
        if (!row || row.state !== 'active') return;
        while (job.credits <= 0) {
          await this.waitForCredit(id);
          const waiting = this.rows.get(id);
          if (!waiting || waiting.state !== 'active') return;
          if (this.disposed) return;
        }
        const start = job.seq * TRANSFER_CHUNK_BYTES;
        const end = Math.min(job.file.size, start + TRANSFER_CHUNK_BYTES);
        const bytes = new Uint8Array(await job.file.slice(start, end).arrayBuffer());
        job.credits -= 1;
        await this.ports.chunk(bytes, { id, seq: job.seq }, job.peerId);
        job.seq += 1;
        this.patch(id, { done: end, rate: this.rateOf(row, end) });
      }
      await this.ports.control(control('end', id, { chunks: job.total }), job.peerId);
    } catch {
      this.patch(id, { state: 'failed', error: 'send-failed', endedAt: Date.now(), rate: 0 });
      void this.ports
        .control(control('fail', id, { reason: 'send-failed' }), job.peerId)
        .catch(() => undefined);
    } finally {
      job.running = false;
    }
  }
}
