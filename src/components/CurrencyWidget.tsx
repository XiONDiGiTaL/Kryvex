import { useEffect, useMemo, useState } from 'react';
import type { HomeSettings } from '../types';
import { useI18n } from '../lib/i18n';
import {
  CURRENCIES,
  convertCurrency,
  formatCurrencyAmount,
  parseCurrencyAmount,
  type ExchangeRate,
} from '../lib/currency';
import { Icon } from './ui';

/**
 * ECB reference rates through Frankfurter. The card only asks for the two
 * selected currency codes; the amount never leaves the renderer.
 *
 * The host is `api.frankfurter.dev`, not the older `api.frankfurter.app`: the
 * old host answers 301 without CORS headers, so a cross-origin fetch from the
 * renderer fails before the redirect is followed.
 */
export function CurrencyWidget({
  home,
  onUpdate,
}: {
  home: HomeSettings;
  onUpdate: (patch: Partial<HomeSettings>) => void;
}) {
  const { t, locale } = useI18n();
  const [amount, setAmount] = useState('100');
  const [rate, setRate] = useState<ExchangeRate | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const from = home.currencyFrom;
  const to = home.currencyTo;

  useEffect(() => {
    if (from === to) {
      setRate({ ok: true, base: from, quote: to, rate: 1 });
      setBusy(false);
      return;
    }
    let active = true;
    let controller: AbortController | null = null;
    setBusy(true);
    setRate(null);

    const load = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch(
          `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`,
          { signal: request.signal, cache: 'no-store' },
        );
        if (!response.ok) throw new Error('status');
        const payload: unknown = await response.json();
        const data =
          payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
        const rates =
          data.rates && typeof data.rates === 'object'
            ? (data.rates as Record<string, unknown>)
            : {};
        const value = Number(rates[to]);
        if (!Number.isFinite(value) || value <= 0) throw new Error('rate');
        if (active) {
          setRate({
            ok: true,
            base: from,
            quote: to,
            rate: value,
            date: typeof data.date === 'string' ? data.date : undefined,
          });
        }
      } catch (error) {
        if (!active || (error as { name?: string } | null)?.name === 'AbortError') return;
        setRate({ ok: false, error: 'offline', base: from, quote: to });
      } finally {
        if (active) setBusy(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 15 * 60 * 1000);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [from, to, refresh]);

  const numericAmount = parseCurrencyAmount(amount);
  const converted = useMemo(() => {
    if (numericAmount === null || !rate?.ok || !rate.rate) return null;
    return convertCurrency(numericAmount, rate.rate);
  }, [numericAmount, rate]);

  const date = rate?.date
    ? new Date(`${rate.date}T00:00:00`).toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
      })
    : '';

  return (
    <div className="home-currency">
      <div className="home-card-head">
        <span className="mono">{t('CURRENCY')}</span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setRefresh(value => value + 1)}
          aria-label={t('Refresh rates')}
          title={t('Refresh rates')}
          disabled={busy}
        >
          <Icon name="reload" size={12} />
        </button>
      </div>

      <div className="home-currency-row">
        <label className="home-currency-amount">
          <span className="mono">{t('AMOUNT')}</span>
          <input
            value={amount}
            onChange={event => setAmount(event.target.value.slice(0, 24))}
            inputMode="decimal"
            aria-label={t('Amount to convert')}
          />
        </label>
        <label>
          <span className="mono">{t('FROM')}</span>
          <select
            value={from}
            onChange={event => onUpdate({ currencyFrom: event.target.value })}
            aria-label={t('From currency')}
          >
            {CURRENCIES.map(currency => (
              <option key={currency.code} value={currency.code}>
                {currency.code}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="icon-btn home-currency-swap"
          onClick={() =>
            onUpdate({ currencyFrom: to, currencyTo: from })
          }
          aria-label={t('Swap currencies')}
          title={t('Swap currencies')}
        >
          <Icon name="repeat" size={13} />
        </button>
        <label>
          <span className="mono">{t('TO')}</span>
          <select
            value={to}
            onChange={event => onUpdate({ currencyTo: event.target.value })}
            aria-label={t('To currency')}
          >
            {CURRENCIES.map(currency => (
              <option key={currency.code} value={currency.code}>
                {currency.code}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="home-currency-result" aria-live="polite">
        {numericAmount === null ? (
          <span className="home-currency-error">{t('Enter a valid amount.')}</span>
        ) : !rate ? (
          <span className="mono">{t('Converting…')}</span>
        ) : converted === null ? (
          <span className="home-currency-error">
            {rate?.error === 'offline'
              ? t('Rates are unavailable right now.')
              : t('That pair is not available.')}
          </span>
        ) : (
          <>
            <strong>{formatCurrencyAmount(converted, to, locale)}</strong>
            <span className="mono">
              {formatCurrencyAmount(numericAmount, from, locale)} ={' '}
              {formatCurrencyAmount(converted, to, locale)}
            </span>
          </>
        )}
      </div>

      <div className="home-currency-foot mono">
        <span>
          {rate?.ok && rate.rate
            ? `1 ${from} = ${rate.rate.toPrecision(5)} ${to}`
            : t('EUROPEAN CENTRAL BANK')}
        </span>
        <span>{date || t('DAILY REFERENCE')}</span>
      </div>
    </div>
  );
}
