import { describe, expect, it } from 'vitest';
import {
  MAX_RECORD_MS,
  MAX_SCREEN_CAPTURES,
  addScreenCapture,
  byteLabel,
  captureFileName,
  durationLabel,
  groupSources,
  pickMimeType,
  removeScreenCapture,
  sanitizeScreenCaptures,
} from '../src/lib/screen-capture';
import type { PartySource, ScreenCapture } from '../src/types';

const shot = (id: string, at: number): ScreenCapture => ({
  id,
  kind: 'shot',
  name: `${id}.png`,
  path: `C:\\Users\\xiond\\Downloads\\Kryvex Captures\\${id}.png`,
  bytes: 2048,
  width: 1280,
  height: 720,
  target: 'Gmail',
  createdAt: at,
});

describe('screen capture', () => {
  it('names a file so a folder sorts by time, with the right extension', () => {
    const at = new Date(2026, 9, 26, 9, 15, 7);
    expect(captureFileName('shot', 'Gmail', at)).toBe('kryvex-gmail-20261026-091507.png');
    expect(captureFileName('clip', 'Kryvex', at)).toBe('kryvex-kryvex-20261026-091507.webm');
    // Accents and spaces are flattened rather than dropped or escaped.
    expect(captureFileName('shot', 'İzmir Şehir', at)).toBe('kryvex-izmir-sehir-20261026-091507.png');
    expect(captureFileName('shot', '   ', at)).toBe('kryvex-capture-20261026-091507.png');
  });

  it('offers services first, then Kryvex’s own window, then the rest', () => {
    const sources: PartySource[] = [
      { id: 'screen:1', kind: 'screen', name: 'Display 1' },
      { id: 'window:9', kind: 'window', name: 'Visual Studio Code' },
      { id: 'app:3', kind: 'app', name: 'Gmail' },
      { id: 'window:2', kind: 'window', name: 'Kryvex' },
      { id: 'app:4', kind: 'app', name: 'YouTube' },
    ];
    const grouped = groupSources(sources);
    expect(grouped.services.map(item => item.name)).toEqual(['Gmail', 'YouTube']);
    expect(grouped.windows.map(item => item.name)).toEqual(['Kryvex', 'Visual Studio Code']);
    expect(grouped.screens.map(item => item.name)).toEqual(['Display 1']);
  });

  it('asks for a codec Chromium has, and nothing when it has none', () => {
    expect(pickMimeType(type => type === 'video/webm')).toBe('video/webm');
    expect(pickMimeType(type => type === 'video/webm;codecs=vp9' || type === 'video/webm')).toBe(
      'video/webm;codecs=vp9',
    );
    expect(pickMimeType(() => false)).toBe('');
  });

  it('keeps a bounded, newest-first list and drops malformed rows', () => {
    const rows = Array.from({ length: MAX_SCREEN_CAPTURES + 4 }, (_, index) => shot(`c-${index}`, index));
    const list = sanitizeScreenCaptures([
      ...rows,
      { id: 'no-name' },
      { name: 'no-id.png' },
      { id: 'bad', name: '   ' },
      'nonsense',
      null,
    ]);
    expect(list).toHaveLength(MAX_SCREEN_CAPTURES);
    expect(list[0]?.id).toBe(`c-${MAX_SCREEN_CAPTURES + 3}`);
    // A row keeps its path when there is one, and survives without one.
    expect(list[0]?.path).toContain('Kryvex Captures');
    expect(sanitizeScreenCaptures([{ id: 'x', name: 'x.png', bytes: -4 }])[0]).toMatchObject({
      bytes: 0,
      kind: 'shot',
      path: '',
    });
  });

  it('adds at the top, never twice, and forgets by id', () => {
    const first = shot('a', 1);
    expect(addScreenCapture([], first)).toHaveLength(1);
    expect(addScreenCapture([first], first)).toHaveLength(1);
    const list = addScreenCapture([first], shot('b', 2));
    expect(list.map(item => item.id)).toEqual(['b', 'a']);
    expect(removeScreenCapture(list, 'a').map(item => item.id)).toEqual(['b']);
  });

  it('labels bytes, durations and the recording ceiling', () => {
    expect(byteLabel(0)).toBe('0 B');
    expect(byteLabel(2048)).toBe('2 KB');
    expect(byteLabel(5 * 1024 * 1024)).toBe('5 MB');
    expect(durationLabel(0)).toBe('0:00');
    expect(durationLabel(4000)).toBe('0:04');
    expect(durationLabel(67_000)).toBe('1:07');
    expect(MAX_RECORD_MS).toBe(180_000);
  });
});
