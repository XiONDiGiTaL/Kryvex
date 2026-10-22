import { describe, expect, it } from 'vitest';
import {
  STEAM_SESSION_DAYS,
  isSteamCookieDomain,
  isSteamSessionUrl,
  steamCookieExpiry,
} from '../electron/steam-session-rules';

describe('isSteamSessionUrl', () => {
  it('matches the Steam web chat and Steam store', () => {
    expect(isSteamSessionUrl('https://steamcommunity.com/chat/')).toBe(true);
    expect(isSteamSessionUrl('https://steamcommunity.com/login/home/')).toBe(true);
    expect(isSteamSessionUrl('https://store.steampowered.com/')).toBe(true);
  });

  it('rejects lookalike hosts, other schemes and junk', () => {
    expect(isSteamSessionUrl('https://steamcommunity.com.evil.example/chat/')).toBe(false);
    expect(isSteamSessionUrl('https://notsteampowered.com/')).toBe(false);
    expect(isSteamSessionUrl('http://steamcommunity.com/chat/')).toBe(false);
    expect(isSteamSessionUrl('not a url')).toBe(false);
    expect(isSteamSessionUrl(undefined)).toBe(false);
  });
});

describe('isSteamCookieDomain', () => {
  it('accepts host-only and domain-wide Steam cookies', () => {
    expect(isSteamCookieDomain('steamcommunity.com')).toBe(true);
    expect(isSteamCookieDomain('.steamcommunity.com')).toBe(true);
    expect(isSteamCookieDomain('.steampowered.com')).toBe(true);
  });

  it('rejects unrelated and lookalike domains', () => {
    expect(isSteamCookieDomain('example.com')).toBe(false);
    expect(isSteamCookieDomain('.evilsteamcommunity.com')).toBe(false);
    expect(isSteamCookieDomain('')).toBe(false);
  });
});

describe('steamCookieExpiry', () => {
  it('returns a whole-second expiry one year out', () => {
    const now = 1_700_000_000_000;
    expect(steamCookieExpiry(now)).toBe(1_700_000_000 + STEAM_SESSION_DAYS * 86_400);
  });

  it('never emits a past expiry for a non-positive duration', () => {
    expect(steamCookieExpiry(0, 0)).toBe(86_400);
  });
});
