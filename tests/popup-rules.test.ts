import { describe, expect, it } from 'vitest';
import {
  isPopupTabCandidate,
  isPopupTabUrl,
  popupLabel,
  popupPlacement,
} from '../electron/popup-rules';

const base = {
  type: 'webview',
  service: false,
  url: 'https://accounts.google.com/o/oauth2/auth',
  disposition: 'new-window',
};

describe('popup tab candidate', () => {
  it('routes a browser tab popup into the tab strip', () => {
    expect(isPopupTabCandidate(base)).toBe(true);
  });

  it('keeps service sign-in in its own window', () => {
    expect(isPopupTabCandidate({ ...base, service: true })).toBe(false);
  });

  it('refuses hidden pop-unders', () => {
    expect(isPopupTabCandidate({ ...base, disposition: 'background-tab' })).toBe(false);
  });

  it('allows a popup spawned from another popup', () => {
    expect(isPopupTabCandidate({ ...base, type: 'window' })).toBe(true);
  });

  it('never claims the trusted shell', () => {
    expect(isPopupTabCandidate({ ...base, type: 'backgroundPage' })).toBe(false);
  });

  it('rejects schemes that are not web content', () => {
    expect(isPopupTabCandidate({ ...base, url: 'javascript:alert(1)' })).toBe(false);
    expect(isPopupTabCandidate({ ...base, url: 'file:///C:/Windows/win.ini' })).toBe(false);
    expect(isPopupTabCandidate({ ...base, url: 'magnet:?xt=urn:btih:abc' })).toBe(false);
    expect(isPopupTabCandidate({ ...base, url: 'not a url' })).toBe(false);
  });

  it('allows the blank window some providers write into afterwards', () => {
    expect(isPopupTabCandidate({ ...base, url: 'about:blank' })).toBe(true);
  });

  it('caps the URL it inspects', () => {
    expect(isPopupTabUrl(`https://example.com/${'a'.repeat(3000)}`)).toBe(false);
    expect(isPopupTabUrl('')).toBe(false);
    expect(isPopupTabUrl(42)).toBe(false);
  });
});

const content = { x: 100, y: 50, width: 1200, height: 800 };

describe('popup placement', () => {
  it('covers the canvas, offset by the content area', () => {
    expect(
      popupPlacement({ x: 12, y: 96, width: 900, height: 640 }, content, {
        width: 520,
        height: 720,
      }),
    ).toEqual({ x: 112, y: 146, width: 900, height: 640 });
  });

  it('centres the fallback size when the renderer has not reported a canvas', () => {
    const rect = popupPlacement(null, content, { width: 520, height: 720 });
    expect(rect).toEqual({ x: 440, y: 90, width: 520, height: 720 });
  });

  it('falls back for a collapsed canvas rather than showing a sliver', () => {
    const rect = popupPlacement({ x: 0, y: 0, width: 40, height: 30 }, content, {
      width: 520,
      height: 720,
    });
    expect(rect.width).toBe(520);
    expect(rect.height).toBe(720);
    expect(rect.x).toBe(440);
  });

  it('clamps a canvas that reaches past the content area', () => {
    const rect = popupPlacement({ x: 0, y: 0, width: 5000, height: 5000 }, content, {
      width: 520,
      height: 720,
    });
    expect(rect).toEqual({ x: 100, y: 50, width: 1200, height: 800 });
  });

  it('never returns a zero-sized window', () => {
    const rect = popupPlacement({ x: 0, y: 0, width: 500, height: 500 }, { x: 0, y: 0, width: 1, height: 1 }, { width: 520, height: 720 });
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });

  it('ignores non-finite geometry', () => {
    const rect = popupPlacement(
      { x: Number.NaN, y: 10, width: 800, height: 600 },
      content,
      { width: 520, height: 720 },
    );
    expect(rect.width).toBe(520);
  });
});

describe('popup label', () => {
  it('prefers the page title', () => {
    expect(popupLabel('Sign in – Google Accounts', 'https://accounts.google.com/')).toBe(
      'Sign in – Google Accounts',
    );
  });

  it('falls back to the host while a title is pending', () => {
    expect(popupLabel('', 'https://login.microsoftonline.com/common/oauth2')).toBe(
      'login.microsoftonline.com',
    );
  });

  it('has no label for a blank window', () => {
    expect(popupLabel('', 'about:blank')).toBe('');
  });

  it('strips control characters and collapses whitespace', () => {
    expect(popupLabel('\u0000Sign\n\n in\tnow', 'https://example.com')).toBe('Sign in now');
  });

  it('caps a runaway title', () => {
    expect(popupLabel('x'.repeat(400), 'https://example.com').length).toBe(100);
  });
});
