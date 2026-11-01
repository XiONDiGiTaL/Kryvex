import {
  MAX_ACTIVE_TRANSFERS,
  TRANSFER_CHUNK_BYTES,
  TRANSFER_PAUSE_MS,
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
  kind:
    | 'offer'
    | 'accept'
    | 'decline'
    | 'begin'
    | 'credit'
    | 'end'
    | 'done'
    | 'cancel'
    | 'fail'
    | 'resume'
    | 'resume-accept';
  id: string;
  name: string;
  size: number;
  chunks: number;
  credits: number;
  /** Bytes the receiver already has on disk, when a transfer resumes. */
  have: number;
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
  /** How long a paused transfer waits; tests use a short one. */
  pauseTimeoutMs?: number;
  onChange?: (rows: TransferRow[]) => void;
}

interface Outbound {
  file: File;
  peerId: string;
  credits: number;
  running: boolean;
  total: number;
  seq: number;
  /** True once a peer accepted, which is what makes a pause resumable. */
  accepted: boolean;
  /** Bumped by a pause, so a loop still unwinding cannot join a resumed one. */
  serial: number;
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
  'resume',
  'resume-accept',
]);

interface ControlPatch {
  name?: string;
  size?: number;
  chunks?: number;
  credits?: number;
  have?: number;
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
    have: patch.have ?? 0,
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
  const have = numeric(source.have, Number.MAX_SAFE_INTEGER);
  const reason = typeof source.reason === 'string' ? source.reason.slice(0, 60) : '';
  return { kind: kind as TransferControl['kind'], id, name, size, chunks, credits, have, reason };
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
  private pauseTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
    // Only a pause is on a clock; every other state ends that clock right here,
    // so no caller has to remember to disarm it or to clear the deadline the
    // panel counts down from.
    const leavingPause = Boolean(patch.state && patch.state !== 'paused');
    if (leavingPause) this.clearPauseTimeout(id);
    const next = leavingPause ? { ...patch, pausedUntil: undefined } : patch;
    this.rows.set(id, { ...row, ...next });
    this.emit();
  }

  /**
   * Put a deadline on a pause.
   *
   * A pause keeps a partial file open and one of the twelve slots taken, so it
   * is a wait with an end, not a promise. The sender and the receiver each keep
   * their own clock, because either of them may be the one still waiting.
   */
  private armPauseTimeout(id: string): void {
    this.clearPauseTimeout(id);
    const timer = setTimeout(() => {
      this.pauseTimers.delete(id);
      this.expirePause(id);
    }, this.ports.pauseTimeoutMs ?? TRANSFER_PAUSE_MS);
    // Never hold a whole process open for a deadline the user is not watching.
    (timer as unknown as { unref?: () => void }).unref?.();
    this.pauseTimers.set(id, timer);
  }

  private clearPauseTimeout(id: string): void {
    const timer = this.pauseTimers.get(id);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.pauseTimers.delete(id);
  }

  /** The peer never came back: drop the partial and free the slot. */
  private expirePause(id: string): void {
    const row = this.rows.get(id);
    if (!row || row.state !== 'paused') return;
    const inbox = this.inbound.get(id);
    if (inbox) {
      this.inbound.delete(id);
      void this.ports.abortSink?.(inbox.token).catch(() => undefined);
    }
    this.outbound.delete(id);
    this.patch(id, { state: 'failed', error: 'pause-timeout', endedAt: Date.now(), rate: 0 });
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
      this.outbound.set(id, {
        file,
        peerId: '',
        credits: 0,
        running: false,
        total,
        seq: 0,
        accepted: false,
        serial: 0,
      });
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

  /**
   * A peer left.
   *
   * A transfer that never started is over: the offer described a peer that is
   * gone and there is nothing to continue. A transfer that had already moved
   * bytes keeps everything it owns — the partial file, its open handle, the
   * sender's `File` — and pauses instead. A peer reaches the room through a new
   * channel every time it returns, so the id stored on the row is already stale;
   * `announceResume` is what joins the two ends back together.
   */
  peerLeft(peerId: string): void {
    const affected = this.list().filter(row => row.peerId === peerId && !isFinishedTransfer(row));
    for (const row of affected) {
      // A paused row already knows its peer is gone; its own deadline decides
      // when to stop waiting, so an id it once had arriving again changes nothing.
      if (row.state === 'paused') continue;
      const inbox = this.inbound.get(row.id);
      const job = this.outbound.get(row.id);
      if (row.state === 'active' && (inbox || job)) {
        this.pause(row.id);
        continue;
      }
      if (inbox) {
        this.inbound.delete(row.id);
        void this.ports.abortSink?.(inbox.token).catch(() => undefined);
      }
      this.outbound.delete(row.id);
      this.patch(row.id, { state: 'failed', error: 'peer-left', endedAt: Date.now(), rate: 0 });
      this.wake(row.id);
    }
  }

  /**
   * Park a transfer that is still intact but has no channel.
   *
   * The bytes on disk stay, the sender keeps its `File`, and the pump's serial
   * moves on so a loop that was in flight cannot write into the resumed stream.
   */
  private pause(id: string): void {
    const row = this.rows.get(id);
    if (!row || isFinishedTransfer(row) || row.state === 'paused') return;
    const job = this.outbound.get(id);
    if (job) {
      job.serial += 1;
      job.peerId = '';
      job.credits = 0;
      job.running = false;
    }
    this.patch(id, {
      state: 'paused',
      rate: 0,
      // The panel counts down from here, so the row states its own deadline
      // rather than each view guessing one from the moment it first noticed.
      pausedUntil: Date.now() + (this.ports.pauseTimeoutMs ?? TRANSFER_PAUSE_MS),
    });
    this.wake(id);
    this.armPauseTimeout(id);
  }

  /**
   * Ask the room to continue every paused transfer this client was sending.
   *
   * The sender is the side that can restart one: it still holds the whole file,
   * and the receiver still holds the bytes it wrote. The sender re-states the
   * offer; whoever answers with `resume-accept` says how far the file got, and
   * the stream continues from that offset. Re-asking is cheap and idempotent,
   * so a join can announce twice without a transfer starting twice.
   */
  announceResume(): number {
    if (this.disposed) return 0;
    let sent = 0;
    for (const row of this.list()) {
      if (row.state !== 'paused' || row.direction !== 'send') continue;
      const job = this.outbound.get(row.id);
      if (!job) continue;
      void this.ports
        .control(control('resume', row.id, { name: row.name, size: row.size, chunks: job.total }), '')
        .catch(() => undefined);
      sent += 1;
    }
    return sent;
  }

  dispose(): void {
    this.disposed = true;
    for (const id of [...this.pauseTimers.keys()]) this.clearPauseTimeout(id);
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
      job.accepted = true;
      job.credits = Math.max(1, Math.min(TRANSFER_WINDOW, payload.credits || TRANSFER_WINDOW));
      this.patch(payload.id, { state: 'active', peerId, startedAt: Date.now() });
      void this.pump(payload.id);
      return;
    }

    // A sender came back and still holds the file: say where this one stopped.
    if (payload.kind === 'resume') {
      const inbox = this.inbound.get(payload.id);
      if (row.direction !== 'receive' || row.state !== 'paused' || !inbox) return;
      // Only the same file continues; a different size or name is a new offer.
      if (payload.size !== row.size || sanitizeTransferName(payload.name) !== row.name) return;
      if (inbox.bytes > row.size) return;
      // Every byte is already on disk and only the end frame was lost.
      if (inbox.bytes === row.size) {
        void this.finishInbound(payload.id, peerId);
        return;
      }
      // Chunks are written whole, so the sender can only seek to a boundary.
      if (inbox.bytes % TRANSFER_CHUNK_BYTES !== 0) return;
      this.patch(payload.id, { state: 'active', peerId, startedAt: Date.now(), rate: 0 });
      void this.ports
        .control(
          control('resume-accept', payload.id, { have: inbox.bytes, credits: TRANSFER_WINDOW }),
          peerId,
        )
        .catch(() => undefined);
      return;
    }

    if (payload.kind === 'resume-accept') {
      if (row.direction !== 'send' || row.state !== 'paused') return;
      const job = this.outbound.get(payload.id);
      if (!job) return;
      const have = payload.have;
      if (!Number.isSafeInteger(have) || have < 0 || have > row.size) return;
      if (have % TRANSFER_CHUNK_BYTES !== 0) return;
      if (job.peerId && job.peerId !== peerId) return;
      job.peerId = peerId;
      job.accepted = true;
      job.seq = Math.floor(have / TRANSFER_CHUNK_BYTES);
      job.credits = Math.max(1, Math.min(TRANSFER_WINDOW, payload.credits || TRANSFER_WINDOW));
      this.patch(payload.id, {
        state: 'active',
        peerId,
        done: have,
        startedAt: Date.now(),
        rate: 0,
      });
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
      // A credit that cannot be delivered means this channel is gone. Those
      // bytes are already on disk, so park the transfer instead of discarding
      // a half-written file: the sender can ask to continue later.
      this.pause(meta.id);
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

  /**
   * Sender loop: one chunk at a time while the receiver keeps crediting.
   *
   * `serial` is captured at the start and a pause bumps it, so a loop that is
   * still unwinding can never write a byte, or an end frame, into a stream that
   * has already been resumed on another channel.
   */
  private async pump(id: string): Promise<void> {
    const job = this.outbound.get(id);
    if (!job || job.running) return;
    job.running = true;
    const serial = job.serial;
    const stale = (): boolean => this.disposed || job.serial !== serial;
    try {
      while (job.seq < job.total) {
        const row = this.rows.get(id);
        if (!row || row.state !== 'active' || stale()) return;
        while (job.credits <= 0) {
          await this.waitForCredit(id);
          const waiting = this.rows.get(id);
          if (!waiting || waiting.state !== 'active' || stale()) return;
        }
        const start = job.seq * TRANSFER_CHUNK_BYTES;
        const end = Math.min(job.file.size, start + TRANSFER_CHUNK_BYTES);
        const bytes = new Uint8Array(await job.file.slice(start, end).arrayBuffer());
        if (stale()) return;
        job.credits -= 1;
        await this.ports.chunk(bytes, { id, seq: job.seq }, job.peerId);
        if (stale() || this.rows.get(id)?.state !== 'active') return;
        job.seq += 1;
        this.patch(id, { done: end, rate: this.rateOf(row, end) });
      }
      // Every byte went out, but a pause can land between the last frame and
      // this one; the receiver says how far it got, and only it knows that.
      if (stale() || this.rows.get(id)?.state !== 'active') return;
      await this.ports.control(control('end', id, { chunks: job.total }), job.peerId);
    } catch {
      // A closed channel is what a peer leaving looks like from here. The pause
      // path already owns that case, so it is not a failure.
      if (stale() || this.rows.get(id)?.state === 'paused') return;
      this.patch(id, { state: 'failed', error: 'send-failed', endedAt: Date.now(), rate: 0 });
      void this.ports
        .control(control('fail', id, { reason: 'send-failed' }), job.peerId)
        .catch(() => undefined);
    } finally {
      if (job.serial === serial) {
        job.running = false;
        // A loop that exits on a pause that has already been lifted is restarted
        // rather than left to stall the stream it was about to give up on.
        if (!this.disposed && job.seq < job.total && this.rows.get(id)?.state === 'active') {
          void this.pump(id);
        }
      }
    }
  }
}
