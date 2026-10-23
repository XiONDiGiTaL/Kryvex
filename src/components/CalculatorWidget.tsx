import { useState } from 'react';
import { useT } from '../lib/i18n';
import {
  evaluateCalculator,
  formatCalculatorValue,
  pressCalculatorKey,
} from '../lib/calculator';

const KEYS: Array<{ key: string; label: string; tone?: 'operator' | 'action' | 'equals' }> = [
  { key: 'AC', label: 'AC', tone: 'action' },
  { key: 'DEL', label: '⌫', tone: 'action' },
  { key: '(', label: '(', tone: 'action' },
  { key: ')', label: ')', tone: 'action' },
  { key: '7', label: '7' },
  { key: '8', label: '8' },
  { key: '9', label: '9' },
  { key: '÷', label: '÷', tone: 'operator' },
  { key: '4', label: '4' },
  { key: '5', label: '5' },
  { key: '6', label: '6' },
  { key: '×', label: '×', tone: 'operator' },
  { key: '1', label: '1' },
  { key: '2', label: '2' },
  { key: '3', label: '3' },
  { key: '−', label: '−', tone: 'operator' },
  { key: '±', label: '±', tone: 'action' },
  { key: '0', label: '0' },
  { key: '.', label: '.' },
  { key: '+', label: '+', tone: 'operator' },
];

function keyLabel(key: string, t: (value: string) => string): string {
  if (key === 'AC') return t('Clear');
  if (key === 'DEL') return t('Backspace');
  if (key === '±') return t('Change sign');
  if (key === '×') return t('Multiply');
  if (key === '÷') return t('Divide');
  if (key === '−') return t('Subtract');
  if (key === '+') return t('Add');
  if (key === '.') return t('Decimal point');
  if (key === '(') return t('Open parenthesis');
  if (key === ')') return t('Close parenthesis');
  return key;
}

/** One local card: a safe arithmetic parser behind a compact keypad. */
export function CalculatorWidget() {
  const t = useT();
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  function press(key: string) {
    if (key === 'AC') {
      setExpression('');
      setResult(null);
      setFailed(false);
      return;
    }
    if (key === '=') {
      const evaluated = evaluateCalculator(expression);
      if (evaluated.ok) {
        setResult(formatCalculatorValue(evaluated.value));
        setFailed(false);
      } else {
        setResult(null);
        setFailed(true);
      }
      return;
    }
    const isDigit = /^[0-9.]$/.test(key);
    let base = expression;
    if (result !== null) {
      base = isDigit ? '' : result;
      setResult(null);
    }
    if (failed) {
      base = '';
      setFailed(false);
    }
    const next = pressCalculatorKey(base, key);
    setExpression(next.expression);
  }

  const shown = failed ? t('Error') : (result ?? expression) || '0';

  return (
    <div className="home-calculator">
      <div className="home-card-head">
        <span className="mono">{t('CALCULATOR')}</span>
        <span className="mono">{t('LOCAL')}</span>
      </div>
      <div className="home-calc-display" aria-live="polite">
        {result !== null || failed ? (
          <span className="mono home-calc-expression">{expression || '0'}</span>
        ) : null}
        <strong className={failed ? 'is-error' : ''}>{shown}</strong>
      </div>
      <div className="home-calc-keys">
        {KEYS.map(item => (
          <button
            key={item.key}
            type="button"
            className={`home-calc-key ${item.tone ? `is-${item.tone}` : ''}`}
            onClick={() => press(item.key)}
            aria-label={keyLabel(item.key, t)}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className="home-calc-key is-equals"
          onClick={() => press('=')}
          aria-label={t('Equals')}
        >
          =
        </button>
      </div>
    </div>
  );
}
