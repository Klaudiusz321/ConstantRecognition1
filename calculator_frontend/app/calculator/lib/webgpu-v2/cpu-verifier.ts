import type { CalculatorToken } from './calculator';

const CONSTANTS: Readonly<Record<string, number>> = {
  PI: Math.PI,
  EULER: Math.E,
  NEG: -1,
  GOLDENRATIO: (1 + Math.sqrt(5)) / 2,
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
  SEVEN: 7,
  EIGHT: 8,
  NINE: 9,
};

/** Real-valued Lanczos approximation used only for CPU candidate verification. */
export function gamma(z: number): number {
  if (!Number.isFinite(z)) return Number.NaN;
  if (Number.isInteger(z) && z <= 0) return Number.NaN;

  if (z < 0.5) {
    const denominator = Math.sin(Math.PI * z) * gamma(1 - z);
    return denominator === 0 ? Number.NaN : Math.PI / denominator;
  }

  const coefficients = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ] as const;

  const shifted = z - 1;
  let x = coefficients[0];
  for (let i = 1; i < coefficients.length; i++) {
    x += coefficients[i] / (shifted + i);
  }
  const t = shifted + 7.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, shifted + 0.5) * Math.exp(-t) * x;
}

function applyUnary(token: string, x: number): number {
  switch (token) {
    case 'LOG': return Math.log(x);
    case 'EXP': return Math.exp(x);
    case 'INV': return 1 / x;
    case 'GAMMA': return gamma(x);
    case 'SQRT': return Math.sqrt(x);
    case 'SQR': return x * x;
    case 'SIN': return Math.sin(x);
    case 'ARCSIN': return Math.asin(x);
    case 'COS': return Math.cos(x);
    case 'ARCCOS': return Math.acos(x);
    case 'TAN': return Math.tan(x);
    case 'ARCTAN': return Math.atan(x);
    case 'SINH': return Math.sinh(x);
    case 'ARCSINH': return Math.asinh(x);
    case 'COSH': return Math.cosh(x);
    case 'ARCCOSH': return Math.acosh(x);
    case 'TANH': return Math.tanh(x);
    case 'ARCTANH': return Math.atanh(x);
    default: return Number.NaN;
  }
}

/**
 * Match vsearch_RPN_core.c exactly. The core pops `top`, then `below`, and
 * calls the binary function as func(top, below). This is intentionally not the
 * conventional RPN order for SUBTRACT, DIVIDE and POWER.
 */
function applyBinaryCoreOrder(token: string, top: number, below: number): number {
  switch (token) {
    case 'PLUS': return top + below;
    case 'TIMES': return top * below;
    case 'SUBTRACT': return top - below;
    case 'DIVIDE': return top / below;
    case 'POWER': return Math.pow(top, below);
    default: return Number.NaN;
  }
}

export function evaluateCoreRPN(tokens: readonly CalculatorToken[], xValue = 0): number {
  const stack: number[] = [];

  for (const token of tokens) {
    if (token === 'x') {
      stack.push(xValue);
      continue;
    }
    const constant = CONSTANTS[token];
    if (constant !== undefined) {
      stack.push(constant);
      continue;
    }

    if (
      token === 'LOG' || token === 'EXP' || token === 'INV' || token === 'GAMMA' ||
      token === 'SQRT' || token === 'SQR' || token === 'SIN' || token === 'ARCSIN' ||
      token === 'COS' || token === 'ARCCOS' || token === 'TAN' || token === 'ARCTAN' ||
      token === 'SINH' || token === 'ARCSINH' || token === 'COSH' || token === 'ARCCOSH' ||
      token === 'TANH' || token === 'ARCTANH'
    ) {
      if (stack.length < 1) return Number.NaN;
      const value = applyUnary(token, stack.pop()!);
      // Match the C core: non-finite intermediate values are allowed because a
      // later operation (for example INV after an overflowing EXP) can recover.
      stack.push(value);
      continue;
    }

    if (stack.length < 2) return Number.NaN;
    const top = stack.pop()!;
    const below = stack.pop()!;
    const value = applyBinaryCoreOrder(token, top, below);
    stack.push(value);
  }

  return stack.length === 1 && Number.isFinite(stack[0]) ? stack[0] : Number.NaN;
}

export function absoluteError(value: number, target: number): number {
  return Math.abs(value - target);
}

export function relativeError(value: number, target: number): number {
  return target === 0 ? Math.abs(value) : Math.abs(value / target - 1);
}
