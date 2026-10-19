import { describe, expect, it } from 'vitest';
import { MAX_DOWNLOAD_RECORDS, sanitizeDownloadRecords } from '../electron/download-rules';

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dl-1',
    filename: 'file.zip',
    url: 'https://example.com/file.zip',
    savePath: 'C:\\Users\\me\\Downloads\\file.zip',
    receivedBytes: 10,
    totalBytes: 20,
    state: 'completed',
    startedAt: 100,
    updatedAt: 200,
    ...overrides,
  };
}

describe('sanitizeDownloadRecords', () => {
  it('returns an empty library for malformed input', () => {
    expect(sanitizeDownloadRecords(null)).toEqual([]);
    expect(sanitizeDownloadRecords('nope')).toEqual([]);
    expect(sanitizeDownloadRecords([])).toEqual([]);
  });

  it('keeps completed records and restores their metadata', () => {
    expect(sanitizeDownloadRecords([makeRecord()])).toEqual([
      {
        id: 'dl-1',
        filename: 'file.zip',
        url: 'https://example.com/file.zip',
        savePath: 'C:\\Users\\me\\Downloads\\file.zip',
        receivedBytes: 10,
        totalBytes: 20,
        state: 'completed',
        startedAt: 100,
        updatedAt: 200,
      },
    ]);
  });

  it('turns in-flight records into interrupted rows', () => {
    const records = sanitizeDownloadRecords([
      makeRecord({ id: 'dl-a', state: 'progressing' }),
      makeRecord({ id: 'dl-b', state: 'paused' }),
    ]);
    expect(records.map(record => record.state)).toEqual(['interrupted', 'interrupted']);
  });

  it('drops unsafe ids, duplicates and nameless records', () => {
    const records = sanitizeDownloadRecords([
      makeRecord({ id: '../dl-evil' }),
      makeRecord({ id: 'dl-1' }),
      makeRecord({ id: 'dl-1', filename: 'duplicate.zip' }),
      makeRecord({ id: 'dl-2', filename: '  ' }),
      makeRecord({ id: 'dl-3' }),
    ]);
    expect(records.map(record => record.id)).toEqual(['dl-1', 'dl-3']);
  });

  it('normalises bad byte counts and timestamps', () => {
    const [record] = sanitizeDownloadRecords([
      makeRecord({
        receivedBytes: -5,
        totalBytes: 'nope',
        startedAt: 'yesterday',
        updatedAt: Number.NaN,
      }),
    ]);
    expect(record?.receivedBytes).toBe(0);
    expect(record?.totalBytes).toBe(0);
    expect(record?.startedAt).toBeTypeOf('number');
    expect(record?.updatedAt).toBeTypeOf('number');
  });

  it('caps the restored history', () => {
    const records = Array.from({ length: MAX_DOWNLOAD_RECORDS + 10 }, (_, index) =>
      makeRecord({ id: `dl-${index}` }),
    );
    expect(sanitizeDownloadRecords(records)).toHaveLength(MAX_DOWNLOAD_RECORDS);
  });
});
