import { useEffect, useMemo, useRef, useState } from 'react';
import type { HomeSettings } from '../types';
import { useI18n } from '../lib/i18n';
import {
  CURRENCIES,
  RATE_SOURCE,
  convertCurrency,
  currencyName,
  filterCurrencies,
  formatCurrencyAmount,
  isRateStale,
  parseCurrencyAmount,
  rateAgeDays,
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
 *
 * The card says which rate it is showing, when the source quoted it and when
 * this window fetched it, because a reference rate is not the rate a bank, a
 * card or a bureau de change will give you.
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
      setRate({ ok: true, base: from, quote: to, rate: 1, fetchedAt: Date.now() });
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
        // The mirror answers 404 for a currency it does not quote, which is a
        // different problem from being offline and deserves its own message.
        if (response.status === 404) {
          if (active) setRate({ ok: false, error: 'unsupported', base: from, quote: to });
          return;
        }
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
            fetchedAt: Date.now(),
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
    const timer = window.setInterval(() => void load(), RATE_SOURCE.refreshMinutes * 60 * 1000);
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

  const quoted = rate?.date
    ? new Date(`${rate.date}T00:00:00`).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
      })
    : '';
  const fetched = rate?.fetchedAt
    ? new Date(rate.fetchedAt).toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
  const stale = rate?.ok ? isRateStale(rate.date) : false;
  const age = rateAgeDays(rate?.date);

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
        <CurrencyPick
          label={t('FROM')}
          value={from}
          onChange={code => onUpdate({ currencyFrom: code })}
        />
        <button
          type="button"
          className="icon-btn home-currency-swap"
          onClick={() => onUpdate({ currencyFrom: to, currencyTo: from })}
          aria-label={t('Swap currencies')}
          title={t('Swap currencies')}
        >
          <Icon name="repeat" size={13} />
        </button>
        <CurrencyPick
          label={t('TO')}
          value={to}
          onChange={code => onUpdate({ currencyTo: code })}
        />
      </div>

      <div className="home-currency-result" aria-live="polite">
        {numericAmount === null ? (
          <span className="home-currency-error">{t('Enter a valid amount.')}</span>
        ) : !rate ? (
          <span className="mono">{t('Converting…')}</span>
        ) : converted === null ? (
          <span className="home-currency-error">
            {rate.error === 'unsupported'
              ? t('The reference source does not quote {code}.', { code: to })
              : t('Rates are unavailable right now. Your last conversion is not shown, because it would be out of date.')}
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
        <span>{quoted ? t('QUOTED {date}', { date: quoted }) : t('DAILY REFERENCE')}</span>
      </div>

      {rate?.ok ? (
        <p className="home-currency-source">
          <Icon name="help" size={11} />
          {t(
            'ECB reference rate via Frankfurter. Banks, cards and cash exchanges add their own spread, so their rate will differ.',
          )}
          {fetched ? ` · ${t('Fetched {time}', { time: fetched })}` : ''}
        </p>
      ) : null}

      {stale && age !== null ? (
        <p className="home-currency-stale">
          <Icon name="warning" size={11} />
          {age <= 1
            ? t('This quote is from {date}. It may be out of date.', { date: quoted })
            : t('This quote is {days} days old. It may be out of date.', { days: age })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A compact code picker with a search field. A native `<select>` with thirty
 * entries is a scroll through three-letter codes; typing "lira" or "try" here
 * lands on the currency in one keystroke. Escape and an outside click close it,
 * and the list is a real listbox so arrow keys and Enter work.
 */
function CurrencyPick({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const host = useRef<HTMLDivElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);
  const options = useMemo(() => filterCurrencies(query), [query]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const onPointer = (event: PointerEvent) => {
      if (host.current && !host.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function choose(code: string) {
    onChange(code);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className="home-currency-pick" ref={host}>
      <span className="mono">{label}</span>
      <button
        type="button"
        className="home-currency-pick-btn"
        onClick={() => setOpen(current => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${currencyName(value)}`}
        title={currencyName(value)}
      >
        <span className="mono">{value}</span>
        <Icon name="chevron" size={11} />
      </button>

      {open ? (
        <div className="home-currency-menu" role="dialog" aria-label={t('Currency')}>
          <input
            ref={search}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('Search a currency')}
            aria-label={t('Search a currency')}
            spellCheck={false}
            onKeyDown={event => {
              if (event.key === 'Enter' && options[0]) {
                event.preventDefault();
                choose(options[0].code);
              }
            }}
          />
          <ul role="listbox" aria-label={t('Currency')}>
            {options.length === 0 ? (
              <li className="home-currency-empty">{t('No currency matches that.')}</li>
            ) : (
              options.map(currency => (
                <li key={currency.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={currency.code === value}
                    className={currency.code === value ? 'is-current' : ''}
                    onClick={() => choose(currency.code)}
                  >
                    <span className="mono">{currency.code}</span>
                    <span>{currency.name}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Kept for callers that only need the code list. */
export const CURRENCY_CODES = CURRENCIES.map(currency => currency.code);
