import { describe, expect, it } from 'vitest';
import {
  evaluateCalculator,
  formatCalculatorValue,
  pressCalculatorKey,
} from '../src/lib/calculator';

describe('calculator', () => {
  it('evaluates the four operations with precedence and parentheses', () => {
    expect(evaluateCalculator('2 + 3 * 4')).toEqual({ ok: true, value: 14 });
    expect(evaluateCalculator('(2 + 3) * 4')).toEqual({ ok: true, value: 20 });
    expect(evaluateCalculator('10 / 4')).toEqual({ ok: true, value: 2.5 });
    expect(evaluateCalculator('2 × 3 − 1')).toEqual({ ok: true, value: 5 });
    expect(evaluateCalculator('-(2 + 3)')).toEqual({ ok: true, value: -5 });
    expect(evaluateCalculator('1.5 + .5')).toEqual({ ok: true, value: 2 });
  });

  it('reports malformed expressions instead of evaluating code', () => {
    expect(evaluateCalculator('')).toEqual({ ok: false, error: 'empty' });
    expect(evaluateCalculator('2 +')).toEqual({ ok: false, error: 'syntax' });
    expect(evaluateCalculator('2 ** 3')).toEqual({ ok: false, error: 'syntax' });
    expect(evaluateCalculator('alert(1)')).toEqual({ ok: false, error: 'syntax' });
    expect(evaluateCalculator('1 / 0')).toEqual({ ok: false, error: 'divide-by-zero' });
  });

  it('formats floating-point noise and very large values compactly', () => {
    expect(formatCalculatorValue(0.1 + 0.2)).toBe('0.3');
    expect(formatCalculatorValue(1 / 3)).toBe('0.3333333333');
    expect(formatCalculatorValue(1e15)).toBe('1e+15');
  });

  it('applies key presses without treating a result as a new expression', () => {
    expect(pressCalculatorKey('2+', '3').expression).toBe('2+3');
    expect(pressCalculatorKey('2+3', '=').evaluate).toBe(true);
    expect(pressCalculatorKey('2+3', 'AC')).toEqual({ expression: '', evaluate: false });
    expect(pressCalculatorKey('2+3', 'DEL').expression).toBe('2+');
    expect(pressCalculatorKey('5', '±').expression).toBe('-(5)');
  });
});
