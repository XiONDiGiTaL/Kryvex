import { describe, expect, it } from 'vitest';
import {
  isMediaPermission,
  isPrivacyPermission,
  isSafePartition,
  mediaDevices,
  normalizeHttpOrigin,
  trimCrossOriginReferrer,
  withPrivacyHeaders,
} from '../electron/privacy';

describe('isSafePartition', () => {
  it('allows persistent service modules and in-memory browser tabs', () => {
    expect(isSafePartition('persist:svc-gmail')).toBe(true);
    expect(isSafePartition('browser-t-abc123')).toBe(true);
  });

  it('rejects persistent browser tabs and arbitrary partitions', () => {
    expect(isSafePartition('persist:browser-t-abc123')).toBe(false);
    expect(isSafePartition('persist:svc-../escape')).toBe(false);
    expect(isSafePartition('default')).toBe(false);
    expect(isSafePartition('browser-')).toBe(false);
  });
});

describe('isPrivacyPermission', () => {
  it('allows only the narrow clipboard and fullscreen permissions', () => {
    expect(isPrivacyPermission('clipboard-sanitized-write')).toBe(true);
    expect(isPrivacyPermission('fullscreen')).toBe(true);
    expect(isPrivacyPermission('media')).toBe(false);
    expect(isPrivacyPermission('geolocation')).toBe(false);
    expect(isPrivacyPermission('openExternal')).toBe(false);
    expect(isPrivacyPermission('usb')).toBe(false);
  });
});

describe('media permission policy', () => {
  it('routes media through the prompt and leaves other devices denied', () => {
    expect(isMediaPermission('media')).toBe(true);
    expect(isMediaPermission('geolocation')).toBe(false);
    expect(isMediaPermission('display-capture')).toBe(false);
  });

  it('maps Chromium media types to microphone and camera', () => {
    expect(mediaDevices(['audio'])).toEqual(['microphone']);
    expect(mediaDevices(['video'])).toEqual(['camera']);
    expect(mediaDevices(['audio', 'video'])).toEqual(['microphone', 'camera']);
    expect(mediaDevices(undefined)).toEqual(['microphone', 'camera']);
    expect(mediaDevices([])).toEqual(['microphone', 'camera']);
  });

  it('canonicalises web origins and rejects non-web URLs', () => {
    expect(normalizeHttpOrigin('https://Discord.com/channels/1')).toBe('https://discord.com');
    expect(normalizeHttpOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeHttpOrigin('file:///etc/passwd')).toBeNull();
    expect(normalizeHttpOrigin('not a url')).toBeNull();
  });
});

describe('trimCrossOriginReferrer', () => {
  it('reduces cross-origin referrers to scheme, host and port', () => {
    expect(trimCrossOriginReferrer('https://news.example/story', 'https://app.example/private?q=1')).toBe(
      'https://app.example/',
    );
    expect(trimCrossOriginReferrer('http://localhost:3000/x', 'https://app.example:8443/secret')).toBe(
      'https://app.example:8443/',
    );
  });

  it('keeps same-origin paths and ignores non-http referrers', () => {
    expect(trimCrossOriginReferrer('https://app.example/next', 'https://app.example/private?q=1')).toBeUndefined();
    expect(trimCrossOriginReferrer('https://news.example/', 'about:blank')).toBeUndefined();
    expect(trimCrossOriginReferrer('not a url', 'https://app.example/')).toBeUndefined();
  });
});

describe('withPrivacyHeaders', () => {
  it('adds GPC, trims an existing cross-origin Referer and drops X-Client-Data', () => {
    const headers = {
      Referer: 'https://app.example/private?token=1',
      'X-Client-Data': 'experiment',
      Accept: 'text/html',
    };
    expect(withPrivacyHeaders(headers, 'https://news.example/story')).toEqual({
      Referer: 'https://app.example/',
      Accept: 'text/html',
      'Sec-GPC': '1',
    });
  });

  it('does not add a Referer when the site omitted it', () => {
    expect(withPrivacyHeaders({ Accept: '*/*' }, 'https://news.example/')).toEqual({
      Accept: '*/*',
      'Sec-GPC': '1',
    });
  });

  it('keeps an existing GPC value and same-origin referrer', () => {
    const headers = {
      'sec-gpc': '0',
      referer: 'https://app.example/page',
    };
    expect(withPrivacyHeaders(headers, 'https://app.example/next')).toEqual(headers);
  });
});
