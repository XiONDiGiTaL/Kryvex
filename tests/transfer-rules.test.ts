import { describe, expect, it } from 'vitest';
import {
  MAX_TRANSFER_NAME,
  TRANSFER_CHUNK_BYTES,
  clampTransferSize,
  formatTransferEta,
  formatTransferRate,
  formatTransferSize,
  isFinishedTransfer,
  sanitizeTransferName,
  transferChunks,
  transferErrorText,
  transferPercent,
  type TransferRow,
} from '../src/lib/transfer-rules';
import { TransferEngine, type TransferPorts } from '../src/lib/transfer';

function row(patch: Partial<TransferRow> = {}): TransferRow {
  return {
    id: 'x1',
    direction: 'send',
    peerId: '',
    name: 'a.bin',
    size: 10,
    done: 0,
    state: 'offered',
    rate: 0,
    startedAt: 0,
    ...patch,
  };
}

describe('transfer names', () => {
  it('keeps a plain name', () => {
    expect(sanitizeTransferName('holiday photo.jpg')).toBe('holiday photo.jpg');
  });

  it('drops the directory from a path a peer chose', () => {
    expect(sanitizeTransferName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeTransferName('C:\\Users\\Ada\\secret.txt')).toBe('secret.txt');
  });

  it('removes characters Windows cannot store', () => {
    expect(sanitizeTransferName('a<b>c:d"e|f?g*h.txt')).toBe('abcdefgh.txt');
  });

  it('does not hand the filesystem a device name', () => {
    expect(sanitizeTransferName('CON.txt')).toBe('_CON.txt');
    expect(sanitizeTransferName('lpt1')).toBe('_lpt1');
  });

  it('keeps the extension when the name has to be shortened', () => {
    const name = sanitizeTransferName(`${'a'.repeat(400)}.pdf`);
    expect(name.length).toBeLessThanOrEqual(MAX_TRANSFER_NAME);
    expect(name.endsWith('.pdf')).toBe(true);
  });

  it('falls back when nothing usable is left', () => {
    expect(sanitizeTransferName('...')).toBe('file');
    expect(sanitizeTransferName(42)).toBe('file');
    expect(sanitizeTransferName('   ')).toBe('file');
  });
});

describe('transfer chunk plan', () => {
  it('counts the chunks a size needs', () => {
    expect(transferChunks(0)).toBe(0);
    expect(transferChunks(1)).toBe(1);
    expect(transferChunks(TRANSFER_CHUNK_BYTES)).toBe(1);
    expect(transferChunks(TRANSFER_CHUNK_BYTES + 1)).toBe(2);
  });

  it('never reports a bar past the file', () => {
    expect(transferPercent(0, 0)).toBe(0);
    expect(transferPercent(0, 100)).toBe(0);
    expect(transferPercent(50, 100)).toBe(50);
    expect(transferPercent(100, 100)).toBe(100);
    expect(transferPercent(200, 100)).toBe(100);
  });

  it('only trusts a plain non-negative size from the wire', () => {
    expect(clampTransferSize(-1)).toBeNull();
    expect(clampTransferSize('abc')).toBeNull();
    expect(clampTransferSize(undefined)).toBeNull();
    expect(clampTransferSize(1.7)).toBe(1);
    expect(clampTransferSize(5)).toBe(5);
  });
});

describe('transfer labels', () => {
  it('formats sizes and rates', () => {
    expect(formatTransferSize(0)).toBe('0 B');
    expect(formatTransferSize(1024)).toBe('1.00 KiB');
    expect(formatTransferSize(1536)).toBe('1.50 KiB');
    expect(formatTransferSize(1024 ** 2)).toBe('1.00 MiB');
    expect(formatTransferRate(0)).toBe('0 B/s');
    expect(formatTransferRate(1024)).toBe('1.00 KiB/s');
  });

  it('formats the time left', () => {
    expect(formatTransferEta(0)).toBe('');
    expect(formatTransferEta(45)).toBe('45s');
    expect(formatTransferEta(90)).toBe('1m 30s');
    expect(formatTransferEta(3700)).toBe('1h 01m');
  });

  it('turns a stable failure code into a catalogue key', () => {
    expect(transferErrorText('busy')).toBe('The other side is busy with another transfer.');
    expect(transferErrorText('something-new')).toBe('The transfer failed.');
  });

  it('knows which rows are over', () => {
    expect(isFinishedTransfer(row({ state: 'active' }))).toBe(false);
    expect(isFinishedTransfer(row({ state: 'saved' }))).toBe(true);
    expect(isFinishedTransfer(row({ state: 'cancelled' }))).toBe(true);
  });
});

/**
 * Two engines wired to each other, with an in-memory sink on the receiving
 * side. This is the whole protocol: offer, accept, credit, chunks, end, done.
 */
describe('transfer engine', () => {
  it('moves a file chunk by chunk and credits every write', async () => {
    const payload = new Uint8Array(TRANSFER_CHUNK_BYTES * 2 + 1234);
    for (let index = 0; index < payload.length; index += 1) payload[index] = index % 251;

    const sink = new Map<string, Uint8Array[]>();
    let receiver: TransferEngine;
    const sender = new TransferEngine({
      control: async (frame, peerId) => receiver.onControl(frame, peerId),
      chunk: async (bytes, meta, peerId) => receiver.onChunk(bytes, meta, peerId),
    });
    receiver = new TransferEngine({
      control: async (frame, peerId) => sender.onControl(frame, peerId),
      chunk: async () => {
        throw new Error('the receiver never sends chunks');
      },
      openSink: async ({ name }) => ({ token: 'sink-1', path: `/tmp/${name}` }),
      writeSink: async (token, bytes) => {
        const list = sink.get(token) ?? [];
        list.push(bytes.slice());
        sink.set(token, list);
        return bytes.byteLength;
      },
      finishSink: async token => {
        const list = sink.get(token) ?? [];
        return `/saved/${list.reduce((total, part) => total + part.byteLength, 0)}`;
      },
      abortSink: async token => {
        sink.delete(token);
      },
    });

    const file = new File([payload], 'payload.bin');
    expect(sender.offer([file])).toBe(1);
    const id = sender.list()[0]!.id;

    // The offer reached the receiver before anything was accepted.
    expect(receiver.list()[0]).toMatchObject({ id, direction: 'receive', state: 'offered' });
    expect(await receiver.accept(id)).toBe(true);

    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (sender.list()[0]?.state === 'done') break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    expect(sender.list()[0]!.state).toBe('done');
    expect(sender.list()[0]!.done).toBe(payload.byteLength);
    expect(receiver.list()[0]!.state).toBe('saved');
    expect(receiver.list()[0]!.done).toBe(payload.byteLength);

    const written = (sink.get('sink-1') ?? []).reduce<number[]>(
      (all, part) => all.concat(Array.from(part)),
      [],
    );
    expect(written.length).toBe(payload.byteLength);
    expect(written).toEqual(Array.from(payload));
  });

  it('keeps chunks in order when a frame arrives before the last write finished', async () => {
    // The transport hands frames over without waiting for the previous one to be
    // written, and the sender keeps a window of them in the air. Each write here
    // takes a turn of the event loop, so the second frame lands mid-write — the
    // exact shape that once made every real transfer fail as out of order.
    const size = TRANSFER_CHUNK_BYTES * 2;
    const first = new Uint8Array(TRANSFER_CHUNK_BYTES).fill(7);
    const second = new Uint8Array(TRANSFER_CHUNK_BYTES).fill(9);
    const frames: string[] = [];
    let kept = 0;
    const engine = new TransferEngine({
      control: async frame => {
        frames.push(frame.kind);
      },
      chunk: async () => undefined,
      openSink: async ({ name }) => ({ token: 'sink-1', path: `/tmp/${name}` }),
      writeSink: async (_token, bytes) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        kept += bytes.byteLength;
        return bytes.byteLength;
      },
      finishSink: async () => '/saved/whole.bin',
    });

    engine.onControl({ kind: 'offer', id: 't1', name: 'a.bin', size, chunks: 2 }, 'peer-a');
    const id = engine.list()[0]!.id;
    expect(await engine.accept(id)).toBe(true);

    await Promise.all([
      engine.onChunk(first, { id, seq: 0 }, 'peer-a'),
      engine.onChunk(second, { id, seq: 1 }, 'peer-a'),
    ]);

    const [row] = engine.list();
    expect(row!.state).toBe('active');
    expect(row!.error).toBeUndefined();
    expect(row!.done).toBe(size);
    expect(kept).toBe(size);
    expect(frames).not.toContain('fail');
  });

  it('waits for the last write before calling a file finished', async () => {
    // The frame that ends a transfer is handled the moment it arrives, which is
    // often while the final chunk is still being written. Finishing first would
    // report a whole file as short and throw it away.
    const size = TRANSFER_CHUNK_BYTES * 2;
    const frames: string[] = [];
    const engine = new TransferEngine({
      control: async frame => {
        frames.push(frame.kind);
      },
      chunk: async () => undefined,
      openSink: async ({ name }) => ({ token: 'sink-1', path: `/tmp/${name}` }),
      writeSink: async (_token, bytes) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return bytes.byteLength;
      },
      finishSink: async () => '/saved/whole.bin',
    });

    engine.onControl({ kind: 'offer', id: 't1', name: 'a.bin', size, chunks: 2 }, 'peer-a');
    const id = engine.list()[0]!.id;
    expect(await engine.accept(id)).toBe(true);

    // Both frames are handed over, then the end arrives immediately.
    const halves = [
      new Uint8Array(TRANSFER_CHUNK_BYTES).fill(3),
      new Uint8Array(TRANSFER_CHUNK_BYTES).fill(4),
    ];
    void engine.onChunk(halves[0]!, { id, seq: 0 }, 'peer-a');
    void engine.onChunk(halves[1]!, { id, seq: 1 }, 'peer-a');
    engine.onControl({ kind: 'end', id, chunks: 2 }, 'peer-a');

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (engine.list()[0]?.state === 'saved') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    const [row] = engine.list();
    expect(row!.state).toBe('saved');
    expect(row!.done).toBe(size);
    expect(frames).not.toContain('fail');
  });

  it('declines past the open-transfer limit instead of queueing silently', async () => {
    const frames: string[] = [];
    const engine = new TransferEngine({
      control: async frame => {
        frames.push(`${frame.kind}:${frame.id}`);
      },
      chunk: async () => undefined,
    });
    for (let index = 0; index < 12; index += 1) {
      engine.onControl(
        { kind: 'offer', id: `t${index}`, name: `f${index}.bin`, size: 10, chunks: 1 },
        'peer-b',
      );
    }
    engine.onControl({ kind: 'offer', id: 'extra', name: 'x.bin', size: 10, chunks: 1 }, 'peer-b');
    expect(engine.list()).toHaveLength(12);
    expect(frames).toContain('decline:extra');
  });

  it('pauses a started transfer, then picks it up where it stopped', async () => {
    const payload = new Uint8Array(TRANSFER_CHUNK_BYTES * 6 + 777);
    for (let index = 0; index < payload.length; index += 1) payload[index] = (index * 7) % 251;

    const sink = new Map<string, Uint8Array[]>();
    const aborted: string[] = [];
    let sender: TransferEngine;
    let receiver: TransferEngine;
    // A peer that comes back reaches the room through a new channel, so both
    // ids change; every port reads the current ones.
    let senderId = 'sender-1';
    let receiverId = 'receiver-1';
    let fed = 0;
    let limit = 3;

    sender = new TransferEngine({
      pauseTimeoutMs: 150,
      control: async (frame, peerId) => {
        void peerId;
        receiver.onControl(frame, senderId);
      },
      chunk: async (bytes, meta) => {
        if (fed >= limit) {
          // The channel died: this frame is lost and both ends notice.
          sender.peerLeft(receiverId);
          receiver.peerLeft(senderId);
          return;
        }
        fed += 1;
        await receiver.onChunk(bytes, meta, senderId);
      },
    });
    receiver = new TransferEngine({
      pauseTimeoutMs: 150,
      control: async (frame, peerId) => {
        void peerId;
        sender.onControl(frame, receiverId);
      },
      chunk: async () => {
        throw new Error('the receiver never sends chunks');
      },
      openSink: async ({ name }) => ({ token: 'sink-1', path: `/tmp/${name}` }),
      writeSink: async (token, bytes) => {
        const list = sink.get(token) ?? [];
        list.push(bytes.slice());
        sink.set(token, list);
        return bytes.byteLength;
      },
      finishSink: async token => {
        const list = sink.get(token) ?? [];
        return `/saved/${list.reduce((total, part) => total + part.byteLength, 0)}`;
      },
      abortSink: async token => {
        aborted.push(token);
        sink.delete(token);
      },
    });

    const file = new File([payload], 'long.bin');
    expect(sender.offer([file])).toBe(1);
    const id = sender.list()[0]!.id;
    expect(await receiver.accept(id)).toBe(true);

    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (receiver.list()[0]?.state === 'paused') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    const onDisk = (sink.get('sink-1') ?? []).reduce((total, part) => total + part.byteLength, 0);
    expect(sender.list()[0]!.state).toBe('paused');
    expect(receiver.list()[0]!.state).toBe('paused');
    expect(onDisk).toBe(3 * TRANSFER_CHUNK_BYTES);
    expect(receiver.list()[0]!.done).toBe(3 * TRANSFER_CHUNK_BYTES);
    // Pausing keeps the partial file: nothing is thrown away or closed.
    expect(aborted).toEqual([]);

    senderId = 'sender-2';
    receiverId = 'receiver-2';
    // The link is back: the channel works again from here on.
    fed = 0;
    limit = Number.MAX_SAFE_INTEGER;
    expect(sender.announceResume()).toBe(1);

    for (let attempt = 0; attempt < 400; attempt += 1) {
      if (receiver.list()[0]?.state === 'saved') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    expect(sender.list()[0]!.state).toBe('done');
    expect(receiver.list()[0]!.state).toBe('saved');
    expect(receiver.list()[0]!.done).toBe(payload.byteLength);

    const written = (sink.get('sink-1') ?? []).reduce<number[]>(
      (all, part) => all.concat(Array.from(part)),
      [],
    );
    expect(written.length).toBe(payload.byteLength);
    expect(written).toEqual(Array.from(payload));

    // A pause that was picked up is off the clock for good.
    expect(receiver.list()[0]!.pausedUntil).toBeUndefined();
    expect(sender.list()[0]!.pausedUntil).toBeUndefined();
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(receiver.list()[0]!.state).toBe('saved');
    expect(sender.list()[0]!.state).toBe('done');
  });

  it('gives a pause up once the other side never comes back', async () => {
    const payload = new Uint8Array(TRANSFER_CHUNK_BYTES * 4);
    const sink = new Map<string, Uint8Array[]>();
    const aborted: string[] = [];
    let sender: TransferEngine;
    let receiver: TransferEngine;
    let fed = 0;

    sender = new TransferEngine({
      pauseTimeoutMs: 40,
      control: async frame => receiver.onControl(frame, 'sender-1'),
      chunk: async (bytes, meta) => {
        if (fed >= 2) {
          sender.peerLeft('receiver-1');
          receiver.peerLeft('sender-1');
          return;
        }
        fed += 1;
        await receiver.onChunk(bytes, meta, 'sender-1');
      },
    });
    receiver = new TransferEngine({
      pauseTimeoutMs: 40,
      control: async frame => sender.onControl(frame, 'receiver-1'),
      chunk: async () => undefined,
      openSink: async ({ name }) => ({ token: 'sink-1', path: `/tmp/${name}` }),
      writeSink: async (token, bytes) => {
        const list = sink.get(token) ?? [];
        list.push(bytes.slice());
        sink.set(token, list);
        return bytes.byteLength;
      },
      finishSink: async () => '/saved/x',
      abortSink: async token => {
        aborted.push(token);
        sink.delete(token);
      },
    });

    expect(sender.offer([new File([payload], 'gone.bin')])).toBe(1);
    const id = sender.list()[0]!.id;
    expect(await receiver.accept(id)).toBe(true);

    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (receiver.list()[0]?.state === 'paused') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }    expect(receiver.list()[0]!.state).toBe('paused');
    // The row carries the deadline its panel counts down from.
    expect(receiver.list()[0]!.pausedUntil).toBeGreaterThan(Date.now());
    expect(sender.list()[0]!.pausedUntil).toBeGreaterThan(Date.now());
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (receiver.list()[0]?.state === 'failed') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    expect(receiver.list()[0]!.state).toBe('failed');
    expect(receiver.list()[0]!.error).toBe('pause-timeout');
    expect(sender.list()[0]!.state).toBe('failed');
    expect(sender.list()[0]!.error).toBe('pause-timeout');
    // The partial file is deleted, so the slot is free again.
    expect(aborted).toEqual(['sink-1']);
    expect(sink.get('sink-1')).toBeUndefined();
  });

  it('parks a transfer across a leave and continues it in the same room', async () => {
    const payload = new Uint8Array(TRANSFER_CHUNK_BYTES * 4 + 99);
    for (let index = 0; index < payload.length; index += 1) payload[index] = (index * 13) % 251;

    const sink = new Map<string, Uint8Array[]>();
    const aborted: string[] = [];
    const published: string[] = [];
    let sender!: TransferEngine;
    let receiver!: TransferEngine;
    // Leaving closes the channels, and both ends come back with new ids.
    let senderId = 'sender-1';
    let receiverId = 'receiver-1';
    let fed = 0;
    let limit = 2;

    const senderPorts: TransferPorts = {
      pauseTimeoutMs: 5000,
      control: async (frame, peerId) => {
        void peerId;
        receiver.onControl(frame, senderId);
      },
      chunk: async (bytes, meta) => {
        if (fed >= limit) {
          // The leave lands mid-stream: both ends park, neither is disposed.
          sender.detach();
          receiver.detach();
          return;
        }
        fed += 1;
        await receiver.onChunk(bytes, meta, senderId);
      },
      onChange: rows => published.push(rows.map(row => row.state).join(',')),
    };
    const receiverPorts: TransferPorts = {
      pauseTimeoutMs: 5000,
      control: async (frame, peerId) => {
        void peerId;
        sender.onControl(frame, receiverId);
      },
      chunk: async () => {
        throw new Error('the receiver never sends chunks');
      },
      openSink: async ({ name }) => ({ token: 'sink-1', path: `/tmp/${name}` }),
      writeSink: async (token, bytes) => {
        const list = sink.get(token) ?? [];
        list.push(bytes.slice());
        sink.set(token, list);
        return bytes.byteLength;
      },
      finishSink: async () => '/saved/parked.bin',
      abortSink: async token => {
        aborted.push(token);
        sink.delete(token);
      },
      onChange: rows => published.push(rows.map(row => row.state).join(',')),
    };
    sender = new TransferEngine(senderPorts);
    receiver = new TransferEngine(receiverPorts);

    expect(sender.offer([new File([payload], 'parked.bin')])).toBe(1);
    const id = sender.list()[0]!.id;
    expect(await receiver.accept(id)).toBe(true);

    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (sender.list()[0]?.state === 'paused' && receiver.list()[0]?.state === 'paused') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    // Leaving parks both ends with their bytes and their deadline; nothing is
    // thrown away and nothing is closed.
    expect(sender.list()[0]!.state).toBe('paused');
    expect(receiver.list()[0]!.state).toBe('paused');
    expect(sender.list()[0]!.pausedUntil).toBeGreaterThan(Date.now());
    expect(receiver.list()[0]!.pausedUntil).toBeGreaterThan(Date.now());
    expect(aborted).toEqual([]);

    // A detached engine reaches no room and publishes to no panel.
    const quiet = published.length;
    expect(sender.announceResume()).toBe(0);
    sender.detach();
    receiver.detach();
    expect(published.length).toBe(quiet);

    // The same room again: new channels, new ids, the same bytes on disk.
    senderId = 'sender-2';
    receiverId = 'receiver-2';
    fed = 0;
    limit = Number.MAX_SAFE_INTEGER;
    sender.attach(senderPorts);
    receiver.attach(receiverPorts);

    const onDisk = (sink.get('sink-1') ?? []).reduce((total, part) => total + part.byteLength, 0);
    expect(onDisk).toBe(2 * TRANSFER_CHUNK_BYTES);
    expect(sender.announceResume()).toBe(1);

    for (let attempt = 0; attempt < 600; attempt += 1) {
      if (receiver.list()[0]?.state === 'saved') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    expect(receiver.list()[0]!.state).toBe('saved');
    expect(sender.list()[0]!.state).toBe('done');
    expect(receiver.list()[0]!.pausedUntil).toBeUndefined();

    // Nothing arrived twice: the stream continued from the byte on disk.
    const written = (sink.get('sink-1') ?? []).reduce<number[]>(
      (all, part) => all.concat(Array.from(part)),
      [],
    );
    expect(written.length).toBe(payload.byteLength);
    expect(written).toEqual(Array.from(payload));
  });

  it('finishes a paused transfer whose last end frame was lost', async () => {
    const payload = new Uint8Array(TRANSFER_CHUNK_BYTES);
    const sink = new Map<string, Uint8Array[]>();
    let sender: TransferEngine;
    let receiver: TransferEngine;
    let senderId = 'sender-1';
    let receiverId = 'receiver-1';

    sender = new TransferEngine({
      control: async (frame, peerId) => {
        void peerId;
        if (frame.kind === 'end') {
          // The last chunk landed, the end frame did not.
          sender.peerLeft(receiverId);
          receiver.peerLeft(senderId);
          return;
        }
        receiver.onControl(frame, senderId);
      },
      chunk: async (bytes, meta) => receiver.onChunk(bytes, meta, senderId),
    });
    receiver = new TransferEngine({
      control: async (frame, peerId) => {
        void peerId;
        sender.onControl(frame, receiverId);
      },
      chunk: async () => {
        throw new Error('the receiver never sends chunks');
      },
      openSink: async ({ name }) => ({ token: 'sink-1', path: `/tmp/${name}` }),
      writeSink: async (token, bytes) => {
        const list = sink.get(token) ?? [];
        list.push(bytes.slice());
        sink.set(token, list);
        return bytes.byteLength;
      },
      finishSink: async () => '/saved/whole.bin',
      abortSink: async () => undefined,
    });

    expect(sender.offer([new File([payload], 'one.bin')])).toBe(1);
    const id = sender.list()[0]!.id;
    expect(await receiver.accept(id)).toBe(true);
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (receiver.list()[0]?.state === 'paused') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    expect(receiver.list()[0]!.state).toBe('paused');
    expect(receiver.list()[0]!.done).toBe(payload.byteLength);

    senderId = 'sender-2';
    receiverId = 'receiver-2';
    sender.announceResume();
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (receiver.list()[0]?.state === 'saved') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    expect(receiver.list()[0]!.state).toBe('saved');
    expect(sender.list()[0]!.state).toBe('done');
  });

  it('lets the receiver put a paused file somewhere else', async () => {
    const payload = new Uint8Array(TRANSFER_CHUNK_BYTES * 3 + 321);
    for (let index = 0; index < payload.length; index += 1) payload[index] = (index * 13) % 251;
    const sink = new Map<string, Uint8Array[]>();
    let sender: TransferEngine;
    let receiver: TransferEngine;
    let senderId = 'sender-1';
    let receiverId = 'receiver-1';
    let fed = 0;
    let limit = 2;

    sender = new TransferEngine({
      control: async frame => receiver.onControl(frame, senderId),
      chunk: async (bytes, meta) => {
        if (fed >= limit) {
          sender.peerLeft(receiverId);
          receiver.peerLeft(senderId);
          return;
        }
        fed += 1;
        await receiver.onChunk(bytes, meta, senderId);
      },
    });
    receiver = new TransferEngine({
      control: async frame => sender.onControl(frame, receiverId),
      chunk: async () => undefined,
      openSink: async ({ name, previousToken }) => {
        if (!previousToken) return { token: 'sink-1', path: `/tmp/${name}`, bytes: 0 };
        // The disk side moves the partial, so the new sink starts with it.
        const arrived = sink.get('sink-1') ?? [];
        const held = arrived.reduce((total, part) => total + part.byteLength, 0);
        sink.set(
          'sink-2',
          arrived.map(part => part.slice()),
        );
        return { token: 'sink-2', path: `/second/${name}`, bytes: held };
      },
      writeSink: async (token, bytes) => {
        const list = sink.get(token) ?? [];
        list.push(bytes.slice());
        sink.set(token, list);
        return bytes.byteLength;
      },
      finishSink: async token => `/saved/${token}`,
      abortSink: async token => {
        sink.delete(token);
      },
    });

    expect(sender.offer([new File([payload], 'moved.bin')])).toBe(1);
    const id = sender.list()[0]!.id;
    expect(await receiver.accept(id)).toBe(true);
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (receiver.list()[0]?.state === 'paused') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    expect(receiver.list()[0]!.state).toBe('paused');
    expect(receiver.list()[0]!.path).toBe('/tmp/moved.bin');

    // The receiver answers the new-folder dialog.
    expect(await receiver.chooseDestination(id)).toBe(true);
    expect(receiver.list()[0]!.path).toBe('/second/moved.bin');
    // What already arrived went with it, so those bytes are never sent twice.
    const held = TRANSFER_CHUNK_BYTES * 2;
    expect(receiver.list()[0]!.done).toBe(held);
    expect(
      (sink.get('sink-2') ?? []).reduce((total, part) => total + part.byteLength, 0),
    ).toBe(held);

    fed = 0;
    limit = Number.MAX_SAFE_INTEGER;
    expect(sender.announceResume()).toBe(1);
    for (let attempt = 0; attempt < 400; attempt += 1) {
      if (receiver.list()[0]?.state === 'saved') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    expect(receiver.list()[0]!.state).toBe('saved');
    expect(sender.list()[0]!.state).toBe('done');
    const written = (sink.get('sink-2') ?? []).reduce<number[]>(
      (all, part) => all.concat(Array.from(part)),
      [],
    );
    expect(written).toEqual(Array.from(payload));
  });

  it('leaves a paused file alone when the new-folder dialog is closed', async () => {
    const sink = new Map<string, Uint8Array[]>();
    let receiver: TransferEngine;

    receiver = new TransferEngine({
      control: async () => undefined,
      chunk: async (bytes, meta) => {
        receiver.onChunk(bytes, meta, 'sender-1');
      },
      openSink: async ({ name, previousToken }) =>
        previousToken ? null : { token: 'sink-1', path: `/tmp/${name}` },
      writeSink: async token => {
        sink.set(token, []);
        return 0;
      },
      finishSink: async () => '/saved/x',
      abortSink: async () => undefined,
    });

    receiver.onControl({ kind: 'offer', id: 't1', name: 'keep.bin', size: 10, chunks: 1 }, 'sender-1');
    expect(await receiver.accept('t1')).toBe(true);
    // Force the pause the way a dropped peer would, then answer nothing.
    receiver.peerLeft('sender-1');
    expect(receiver.list()[0]!.state).toBe('paused');

    expect(await receiver.chooseDestination('t1')).toBe(false);
    expect(receiver.list()[0]!.state).toBe('paused');
    expect(receiver.list()[0]!.path).toBe('/tmp/keep.bin');
  });

  it('ends a transfer that never started when the other peer leaves', () => {
    const engine = new TransferEngine({
      control: async () => undefined,
      chunk: async () => undefined,
    });
    engine.onControl({ kind: 'offer', id: 't1', name: 'a.bin', size: 10, chunks: 1 }, 'peer-b');
    engine.peerLeft('peer-b');
    expect(engine.list()[0]!.state).toBe('failed');
    expect(engine.list()[0]!.error).toBe('peer-left');
    expect(engine.announceResume()).toBe(0);
  });
});
