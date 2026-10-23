/**
 * Currency converter rules: the list the picker offers, a tolerant amount
 * parser, and formatting. Rates themselves come from Frankfurter, which mirrors
 * the European Central Bank's daily reference rates and needs no key.
 */

export const CURRENCIES = [
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'CNY', name: 'Chinese yuan' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'BRL', name: 'Brazilian real' },
  { code: 'MXN', name: 'Mexican peso' },
  { code: 'ZAR', name: 'South African rand' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && CURRENCIES.some(currency => currency.code === value);
}

/** Accepts a comma decimal separator and strips ordinary grouping spaces. */
export function parseCurrencyAmount(value: string): number | null {
  let cleaned = value.replace(/\s/g, '');
  if (cleaned.includes('.') && cleaned.includes(',')) {
    cleaned = cleaned.replace(/,/g, '');
  } else {
    cleaned = cleaned.replace(',', '.');
  }
  if (!cleaned || !/^-?\d*(?:\.\d*)?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

export function convertCurrency(amount: number, rate: number): number | null {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0) return null;
  const converted = amount * rate;
  return Number.isFinite(converted) ? converted : null;
}

export function formatCurrencyAmount(
  amount: number,
  code: string,
  locale: string,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

export interface ExchangeRate {
  ok: boolean;
  error?: 'offline' | 'unsupported' | 'invalid';
  base?: string;
  quote?: string;
  rate?: number;
  date?: string;
}
