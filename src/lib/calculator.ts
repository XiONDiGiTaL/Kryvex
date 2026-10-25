/**
 * The Home calculator evaluates arithmetic with a tiny recursive-descent
 * parser. It never uses `eval` or `Function`, so the widget cannot execute a
 * pasted expression as code.
 */

export type CalculatorError = 'empty' | 'syntax' | 'divide-by-zero' | 'too-large';

export type CalculatorResult =
  | { ok: true; value: number }
  | { ok: false; error: CalculatorError };

type Token =
  | { type: 'number'; value: number }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' }
  | { type: 'paren'; value: '(' | ')' };

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let raw = '';
      let dots = 0;
      while (index < input.length && /[0-9.]/.test(input[index]!)) {
        if (input[index] === '.') dots += 1;
        raw += input[index];
        index += 1;
      }
      if (dots > 1 || raw === '.') return null;
      const value = Number(raw);
      if (!Number.isFinite(value)) return null;
      tokens.push({ type: 'number', value });
      continue;
    }
    if (char === '+' || char === '-' || char === '*' || char === '/') {
      tokens.push({ type: 'operator', value: char });
      index += 1;
      continue;
    }
    if (char === '×' || char === '÷' || char === '−') {
      tokens.push({
        type: 'operator',
        value: char === '×' ? '*' : char === '÷' ? '/' : '-',
      });
      index += 1;
      continue;
    }
    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char });
      index += 1;
      continue;
    }
    return null;
  }
  return tokens;
}

class ParseFailure extends Error {
  constructor(public readonly reason: CalculatorError) {
    super(reason);
  }
}

function evaluateTokens(tokens: Token[]): number {
  let position = 0;

  function expression(): number {
    let value = term();
    while (position < tokens.length) {
      const token = tokens[position];
      if (token?.type !== 'operator' || (token.value !== '+' && token.value !== '-')) break;
      position += 1;
      const right = term();
      value = token.value === '+' ? value + right : value - right;
    }
    return value;
  }

  function term(): number {
    let value = factor();
    while (position < tokens.length) {
      const token = tokens[position];
      if (token?.type !== 'operator' || (token.value !== '*' && token.value !== '/')) break;
      position += 1;
      const right = factor();
      if (token.value === '/' && right === 0) throw new ParseFailure('divide-by-zero');
      value = token.value === '*' ? value * right : value / right;
    }
    return value;
  }

  function factor(): number {
    const token = tokens[position];
    if (!token) throw new ParseFailure('syntax');
    if (token.type === 'operator' && (token.value === '+' || token.value === '-')) {
      position += 1;
      const value = factor();
      return token.value === '-' ? -value : value;
    }
    if (token.type === 'number') {
      position += 1;
      return token.value;
    }
    if (token.type === 'paren' && token.value === '(') {
      position += 1;
      const value = expression();
      const close = tokens[position];
      if (close?.type !== 'paren' || close.value !== ')') throw new ParseFailure('syntax');
      position += 1;
      return value;
    }
    throw new ParseFailure('syntax');
  }

  const result = expression();
  if (position !== tokens.length) throw new ParseFailure('syntax');
  return result;
}

export function evaluateCalculator(input: string): CalculatorResult {
  const source = input.trim();
  if (!source) return { ok: false, error: 'empty' };
  const tokens = tokenize(source);
  if (!tokens || tokens.length === 0) return { ok: false, error: 'syntax' };
  try {
    const value = evaluateTokens(tokens);
    if (!Number.isFinite(value)) return { ok: false, error: 'too-large' };
    return { ok: true, value };
  } catch (error) {
    if (error instanceof ParseFailure) return { ok: false, error: error.reason };
    return { ok: false, error: 'syntax' };
  }
}

export function formatCalculatorValue(value: number): string {
  if (!Number.isFinite(value)) return 'Error';
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e12 || magnitude < 1e-9) {
    return value.toExponential(6).replace(/\.?0+e/, 'e');
  }
  const rounded = Math.round(value * 1e10) / 1e10;
  return String(rounded);
}

/** Applies a key press to the expression shown by the widget. */
export function pressCalculatorKey(
  expression: string,
  key: string,
): { expression: string; evaluate: boolean } {
  if (key === 'AC') return { expression: '', evaluate: false };
  if (key === 'DEL') return { expression: expression.slice(0, -1), evaluate: false };
  if (key === '=') return { expression, evaluate: true };
  if (key === '±') {
    if (!expression) return { expression: '-', evaluate: false };
    if (expression.startsWith('-')) {
      return { expression: expression.slice(1), evaluate: false };
    }
    return { expression: `-(${expression})`, evaluate: false };
  }
  return { expression: expression + key, evaluate: false };
}

/**
 * Keyboard key → keypad key.
 *
 * `event.key` is already layout-independent for the numeric keypad: Num Lock
 * on or off, the digits and operators arrive as `0`–`9`, `+`, `-`, `*`, `/` and
 * `.`. The widget only listens while it has focus, so typing in a note or a
 * filter never reaches the calculator.
 */
export function calculatorKeyFor(key: string): string | null {
  if (/^[0-9]$/.test(key)) return key;
  if (key === '.' || key === ',') return '.';
  if (key === '*' || key === 'x' || key === 'X' || key === '×') return '×';
  if (key === '/' || key === '÷') return '÷';
  // A keyboard minus is ASCII; the keypad label is U+2212, and both arrive.
  if (key === '-' || key === '−' || key === '–') return '−';
  if (key === '+') return '+';
  if (key === '(' || key === ')') return key;
  if (key === '=' || key === 'Enter') return '=';
  if (key === 'Backspace') return 'DEL';
  if (key === 'Escape' || key === 'Delete') return 'AC';
  return null;
}
