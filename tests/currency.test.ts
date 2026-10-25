import { describe, expect, it } from 'vitest';
import {
  CURRENCIES,
  RATE_SOURCE,
  convertCurrency,
  currencyName,
  filterCurrencies,
  formatCurrencyAmount,
  isCurrencyCode,
  isRateStale,
  parseCurrencyAmount,
  rateAgeDays,
} from '../src/lib/currency';

describe('currency', () => {
  it('accepts plain, grouped and comma-decimal amounts', () => {
    expect(parseCurrencyAmount('100')).toBe(100);
    expect(parseCurrencyAmount('1,234.56')).toBe(1234.56);
    expect(parseCurrencyAmount('1234,56')).toBe(1234.56);
    expect(parseCurrencyAmount(' 42 ')).toBe(42);
    expect(parseCurrencyAmount('')).toBeNull();
    expect(parseCurrencyAmount('12abc')).toBeNull();
    expect(parseCurrencyAmount('1.2.3')).toBeNull();
  });

  it('converts only finite positive rates', () => {
    expect(convertCurrency(100, 0.89246)).toBeCloseTo(89.246);
    expect(convertCurrency(100, 0)).toBeNull();
    expect(convertCurrency(Number.NaN, 1)).toBeNull();
    expect(convertCurrency(10, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('accepts only offered ISO codes and formats with the locale', () => {
    expect(isCurrencyCode('USD')).toBe(true);
    expect(isCurrencyCode('usd')).toBe(false);
    expect(formatCurrencyAmount(12.5, 'USD', 'en-US')).toBe('$12.50');
    expect(formatCurrencyAmount(12.5, 'EUR', 'de-DE')).toContain('12,50');
  });

  it('offers the Turkish lira and converts it in both directions', () => {
    expect(isCurrencyCode('TRY')).toBe(true);
    expect(currencyName('TRY')).toBe('Turkish lira');
    // 100 USD → TRY, then back: the round trip returns the original amount.
    const toLira = convertCurrency(100, 34.2);
    expect(toLira).toBeCloseTo(3420);
    const back = convertCurrency(toLira!, 1 / 34.2);
    expect(back).toBeCloseTo(100);
  });

  it('lists every currency once with an ISO-shaped code', () => {
    const codes = CURRENCIES.map(currency => currency.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every(code => /^[A-Z]{3}$/.test(code))).toBe(true);
    expect(codes.length).toBeGreaterThanOrEqual(30);
  });

  it('searches by code prefix and by name', () => {
    expect(filterCurrencies('try').map(currency => currency.code)).toEqual(['TRY']);
    expect(filterCurrencies('lira').map(currency => currency.code)).toEqual(['TRY']);
    expect(filterCurrencies('').length).toBe(CURRENCIES.length);
    expect(filterCurrencies('zzz')).toEqual([]);
    // A name match is not limited to a code prefix: "dollar" finds four.
    expect(filterCurrencies('dollar').length).toBeGreaterThanOrEqual(4);
  });

  it('measures how old a quote is and when it stops counting as current', () => {
    const now = new Date(2026, 9, 25); // Sunday, 25 October 2026
    // A Friday quote read on Sunday is two days old but still the latest one.
    expect(rateAgeDays('2026-10-23', now)).toBe(2);
    expect(isRateStale('2026-10-23', now)).toBe(false);
    // Beyond the working-week gap the mirror did not refresh.
    expect(isRateStale('2026-10-19', now)).toBe(true);
    expect(rateAgeDays(undefined, now)).toBeNull();
    expect(rateAgeDays('not-a-date', now)).toBeNull();
    expect(isRateStale(undefined, now)).toBe(false);
  });

  it('states the source it quotes', () => {
    expect(RATE_SOURCE.kind).toBe('reference');
    expect(RATE_SOURCE.provider).toBe('European Central Bank');
    expect(RATE_SOURCE.refreshMinutes).toBeGreaterThan(0);
  });
});
