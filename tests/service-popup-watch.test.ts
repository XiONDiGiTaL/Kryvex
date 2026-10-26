import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { followServicePopup } from '../electron/service-signin';

/**
 * The watcher is the part that actually closes a stray sign-in window, so it is
 * exercised against stand-ins that emit the same events Electron does. The
 * policy helpers have their own cases in `service-signin.test.ts`.
 */

class FakeContents extends EventEmitter {
  url: string;
  loaded: string[] = [];
  reloads = 0;
  closes = 0;
  gone = false;
  session = { cookies: new EventEmitter() };

  constructor(url: string) {
    super();
    this.url = url;
  }

  getURL(): string {
    return this.url;
  }

  loadURL(url: string): Promise<void> {
    this.loaded.push(url);
    this.url = url;
    return Promise.resolve();
  }

  reload(): void {
    this.reloads += 1;
  }

  close(): void {
    this.closes += 1;
  }

  isDestroyed(): boolean {
    return this.gone;
  }

  /** A page the popup loaded, exactly as `did-navigate` reports it. */
  visit(url: string): void {
    this.url = url;
    this.emit('did-navigate', {}, url);
  }

  /** The user closes the window. */
  closeWindow(): void {
    this.gone = true;
    this.emit('destroyed');
  }
}

function wire(openerUrl: string) {
  const opener = new FakeContents(openerUrl);
  const popup = new FakeContents('about:blank');
  followServicePopup(
    opener as unknown as Parameters<typeof followServicePopup>[0],
    popup as unknown as Parameters<typeof followServicePopup>[1],
  );
  return { opener, popup };
}

function cookie(cookies: EventEmitter, domain: string): void {
  cookies.emit(
    'changed',
    {},
    { domain, name: 'SID', value: 'x', path: '/', secure: true, httpOnly: true, session: false },
    'explicit',
    false,
  );
}

describe('followServicePopup', () => {
  it('folds the product page a Gmail sign-in returns to', () => {
    const { opener, popup } = wire('https://mail.google.com/mail/u/0/');
    popup.visit('https://accounts.google.com/v3/signin/identifier?continue=x');
    expect(opener.loaded).toEqual([]);

    popup.visit('https://mail.google.com/mail/u/0/#inbox');
    expect(opener.loaded).toEqual(['https://mail.google.com/mail/u/0/#inbox']);
    expect(popup.closes).toBe(1);

    popup.closeWindow();
    expect(opener.reloads).toBe(0);
  });

  it('folds even after Google has sent the module to its account host', () => {
    // The live URL is the account page by the time the popup comes back; the
    // anchor's `continue` target is what the fold has to compare against.
    const { opener, popup } = wire(
      'https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0%2F',
    );
    popup.visit('https://accounts.google.com/signin/v2/challenge/totp');
    popup.visit('https://mail.google.com/mail/u/0/');
    expect(opener.loaded).toEqual(['https://mail.google.com/mail/u/0/']);
    expect(popup.closes).toBe(1);
  });

  it('folds a sign-in that finishes on another Google host', () => {
    const { opener, popup } = wire('https://www.youtube.com/');
    popup.visit('https://accounts.google.com/ServiceLogin?service=youtube');
    popup.visit('https://www.google.com/accounts/CheckCookie?continue=1');
    expect(opener.loaded).toEqual(['https://www.google.com/accounts/CheckCookie?continue=1']);
    expect(popup.closes).toBe(1);
  });

  it('reloads a module whose sign-in popup closed on an account page', () => {
    const { opener, popup } = wire('https://mail.google.com/mail/u/0/');
    popup.visit('https://accounts.google.com/v3/signin/identifier');
    popup.visit('https://accounts.google.com/signin/v2/challenge/ipp');
    popup.closeWindow();
    expect(opener.loaded).toEqual([]);
    expect(opener.reloads).toBe(1);
  });

  it('reloads when the popup set a cookie the module reads', () => {
    const { opener, popup } = wire('https://www.notion.so/');
    cookie(popup.session.cookies, '.notion.so');
    popup.visit('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    popup.closeWindow();
    expect(opener.reloads).toBe(1);
  });

  it('ignores a cookie that belongs to another site', () => {
    const { opener, popup } = wire('https://www.notion.so/');
    cookie(popup.session.cookies, '.example.com');
    popup.visit('https://www.example.com/');
    popup.closeWindow();
    expect(opener.reloads).toBe(0);
  });

  it('leaves a same-site popup and its module alone', () => {
    const { opener, popup } = wire('https://mail.google.com/mail/u/0/');
    popup.visit('https://mail.google.com/mail/u/0/#compose');
    expect(opener.loaded).toEqual([]);
    expect(popup.closes).toBe(0);
    popup.closeWindow();
    expect(opener.reloads).toBe(0);
  });

  it('does nothing when the module closed first', () => {
    const { opener, popup } = wire('https://mail.google.com/');
    popup.visit('https://accounts.google.com/v3/signin/identifier');
    opener.gone = true;
    popup.closeWindow();
    expect(opener.reloads).toBe(0);
    expect(opener.loaded).toEqual([]);
  });
});
