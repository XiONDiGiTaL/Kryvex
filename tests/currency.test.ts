import { describe, expect, it } from 'vitest';
import {
  convertCurrency,
  formatCurrencyAmount,
  isCurrencyCode,
  parseCurrencyAmount,
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
});
