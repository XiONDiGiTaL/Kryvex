/**
 * Currency converter rules: the list the picker offers, a tolerant amount
 * parser, and formatting. Rates themselves come from Frankfurter, which mirrors
 * the European Central Bank's daily reference rates and needs no key.
 *
 * The list is exactly what that source quotes. Offering a currency the provider
 * cannot price would only produce a picker entry that always fails, so the two
 * stay in step: `CURRENCIES` is the ECB set, including the Turkish lira.
 */

export const CURRENCIES = [
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'NZD', name: 'New Zealand dollar' },
  { code: 'CNY', name: 'Chinese yuan' },
  { code: 'HKD', name: 'Hong Kong dollar' },
  { code: 'SGD', name: 'Singapore dollar' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'IDR', name: 'Indonesian rupiah' },
  { code: 'KRW', name: 'South Korean won' },
  { code: 'MYR', name: 'Malaysian ringgit' },
  { code: 'PHP', name: 'Philippine peso' },
  { code: 'THB', name: 'Thai baht' },
  { code: 'TRY', name: 'Turkish lira' },
  { code: 'ILS', name: 'Israeli new shekel' },
  { code: 'BRL', name: 'Brazilian real' },
  { code: 'MXN', name: 'Mexican peso' },
  { code: 'ZAR', name: 'South African rand' },
  { code: 'PLN', name: 'Polish złoty' },
  { code: 'CZK', name: 'Czech koruna' },
  { code: 'HUF', name: 'Hungarian forint' },
  { code: 'RON', name: 'Romanian leu' },
  { code: 'BGN', name: 'Bulgarian lev' },
  { code: 'DKK', name: 'Danish krone' },
  { code: 'NOK', name: 'Norwegian krone' },
  { code: 'SEK', name: 'Swedish krona' },
  { code: 'ISK', name: 'Icelandic króna' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && CURRENCIES.some(currency => currency.code === value);
}

/**
 * Where the numbers come from, in the words the card shows. Frankfurter is only
 * a mirror: the rate itself is the ECB's daily reference rate, which is a
 * policy reference and not what a bank or a card charges.
 */
export const RATE_SOURCE = {
  provider: 'European Central Bank',
  mirror: 'Frankfurter',
  kind: 'reference' as const,
  /** The ECB quotes once per working day around 16:00 CET. */
  refreshMinutes: 60,
  /** Consecutive days a quoted date may miss before the card calls it stale. */
  staleDays: 4,
};

export function currencyName(code: string): string {
  return CURRENCIES.find(currency => currency.code === code)?.name ?? code;
}

/**
 * Case-insensitive match on the code or the English name, so "try", "lira" and
 * "TUR" all find the Turkish lira. An empty query returns the whole list, which
 * keeps the picker's initial state simple.
 */
export function filterCurrencies(query: string): typeof CURRENCIES[number][] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...CURRENCIES];
  return CURRENCIES.filter(
    currency =>
      currency.code.toLowerCase().startsWith(needle) ||
      currency.name.toLowerCase().includes(needle),
  );
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

/**
 * Whole days between the rate's quotation date and today, or null when the
 * source did not send a usable date. The ECB quotes on working days, so a
 * Friday rate read on Monday is three days old and perfectly current; only a
 * gap longer than `staleDays` means the mirror did not refresh.
 */
export function rateAgeDays(date: string | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  const quoted = new Date(`${date}T00:00:00`);
  if (Number.isNaN(quoted.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const difference = today.getTime() - quoted.getTime();
  return Math.max(0, Math.round(difference / 86_400_000));
}

export function isRateStale(date: string | undefined, now: Date = new Date()): boolean {
  const age = rateAgeDays(date, now);
  return age !== null && age > RATE_SOURCE.staleDays;
}

export interface ExchangeRate {
  ok: boolean;
  error?: 'offline' | 'unsupported' | 'invalid';
  base?: string;
  quote?: string;
  rate?: number;
  /** Quotation date reported by the source, `YYYY-MM-DD`. */
  date?: string;
  /** When the renderer last received this rate. */
  fetchedAt?: number;
}
