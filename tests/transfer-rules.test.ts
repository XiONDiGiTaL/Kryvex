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
import { TransferEngine } from '../src/lib/transfer';

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

  it('ends every transfer when the other peer leaves', () => {
    const engine = new TransferEngine({
      control: async () => undefined,
      chunk: async () => undefined,
    });
    engine.onControl({ kind: 'offer', id: 't1', name: 'a.bin', size: 10, chunks: 1 }, 'peer-b');
    engine.peerLeft('peer-b');
    expect(engine.list()[0]!.state).toBe('failed');
    expect(engine.list()[0]!.error).toBe('peer-left');
  });
});
