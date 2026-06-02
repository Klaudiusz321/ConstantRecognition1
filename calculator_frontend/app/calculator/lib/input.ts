import type { ErrorMode, Precision } from './types';

export interface ComplexValue {
  real: number;
  imag: number;
}

export interface ParsedSearchInput extends ComplexValue {
  source: string;
  isComplex: boolean;
}

const SYMBOLIC_NAMES: Record<string, ComplexValue> = {
  pi: { real: Math.PI, imag: 0 },
  p: { real: Math.PI, imag: 0 },
  e: { real: Math.E, imag: 0 },
  phi: { real: (1 + Math.sqrt(5)) / 2, imag: 0 },
  goldenratio: { real: (1 + Math.sqrt(5)) / 2, imag: 0 },
  i: { real: 0, imag: 1 },
};

const add = (a: ComplexValue, b: ComplexValue): ComplexValue => ({
  real: a.real + b.real,
  imag: a.imag + b.imag,
});

const sub = (a: ComplexValue, b: ComplexValue): ComplexValue => ({
  real: a.real - b.real,
  imag: a.imag - b.imag,
});

const mul = (a: ComplexValue, b: ComplexValue): ComplexValue => ({
  real: a.real * b.real - a.imag * b.imag,
  imag: a.real * b.imag + a.imag * b.real,
});

const div = (a: ComplexValue, b: ComplexValue): ComplexValue => {
  const denom = b.real * b.real + b.imag * b.imag;
  return {
    real: (a.real * b.real + a.imag * b.imag) / denom,
    imag: (a.imag * b.real - a.real * b.imag) / denom,
  };
};

const expComplex = (z: ComplexValue): ComplexValue => {
  const scale = Math.exp(z.real);
  return {
    real: scale * Math.cos(z.imag),
    imag: scale * Math.sin(z.imag),
  };
};

const logComplex = (z: ComplexValue): ComplexValue => ({
  real: Math.log(Math.hypot(z.real, z.imag)),
  imag: Math.atan2(z.imag, z.real),
});

const pow = (a: ComplexValue, b: ComplexValue): ComplexValue => expComplex(mul(b, logComplex(a)));

const sqrtComplex = (z: ComplexValue): ComplexValue => {
  const r = Math.hypot(z.real, z.imag);
  const real = Math.sqrt((r + z.real) / 2);
  const imag = Math.sign(z.imag || 1) * Math.sqrt(Math.max(0, (r - z.real) / 2));
  return { real, imag };
};

const sinComplex = (z: ComplexValue): ComplexValue => ({
  real: Math.sin(z.real) * Math.cosh(z.imag),
  imag: Math.cos(z.real) * Math.sinh(z.imag),
});

const cosComplex = (z: ComplexValue): ComplexValue => ({
  real: Math.cos(z.real) * Math.cosh(z.imag),
  imag: -Math.sin(z.real) * Math.sinh(z.imag),
});

const tanComplex = (z: ComplexValue): ComplexValue => div(sinComplex(z), cosComplex(z));

const normalizeMathInput = (input: string) =>
  input
    .trim()
    .replace(/\u2212/g, '-')
    .replace(/\u03c0/gi, 'pi')
    .replace(/\u03c6/gi, 'phi')
    .replace(/\s+/g, '');

const trimFormattedNumber = (value: number, digits: number) => {
  const formatted = Number(value).toPrecision(digits);
  if (!formatted.includes('.')) return formatted;
  const [mantissa, exponent] = formatted.split('e');
  const trimmed = mantissa.replace(/\.?0+$/u, '');
  return exponent === undefined ? trimmed : `${trimmed}e${exponent}`;
};

const NUMBER_PATTERN = String.raw`[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:e[+-]?\d+)?`;
const SIGNED_NUMBER_PATTERN = String.raw`[+-](?:(?:\d+\.?\d*)|(?:\.\d+))(?:e[+-]?\d+)?`;

const numericLiteralUncertainty = (raw: string) => {
  const normalized = raw.replace(/^\+/u, '');
  const [mantissa, exponentPart] = normalized.split(/e/i);
  const exponent = exponentPart === undefined ? 0 : Number.parseInt(exponentPart, 10);
  const unsignedMantissa = mantissa.replace(/^[+-]/u, '');
  const decimalIndex = unsignedMantissa.indexOf('.');

  if (decimalIndex === -1) {
    return 0.5 * Math.pow(10, exponent);
  }

  const fractionalDigits = unsignedMantissa.length - decimalIndex - 1;
  return 0.5 * Math.pow(10, exponent - fractionalDigits);
};

const simpleComplexLiteralUncertainty = (normalized: string) => {
  const realOnly = new RegExp(`^(${NUMBER_PATTERN})$`, 'u').exec(normalized);
  if (realOnly) return numericLiteralUncertainty(realOnly[1]);

  const pureImag = new RegExp(`^(${NUMBER_PATTERN})i$`, 'u').exec(normalized);
  if (pureImag) return numericLiteralUncertainty(pureImag[1]);

  const complex = new RegExp(`^(${NUMBER_PATTERN})(${SIGNED_NUMBER_PATTERN})i$`, 'u').exec(normalized);
  if (complex) {
    return Math.hypot(
      numericLiteralUncertainty(complex[1]),
      numericLiteralUncertainty(complex[2]),
    );
  }

  const unitImag = new RegExp(`^(${NUMBER_PATTERN})([+-])i$`, 'u').exec(normalized);
  if (unitImag) return numericLiteralUncertainty(unitImag[1]);

  return null;
};

class ComplexExpressionParser {
  private readonly text: string;
  private pos = 0;

  constructor(input: string) {
    this.text = normalizeMathInput(input).toLowerCase();
  }

  parse(): ComplexValue {
    if (!this.text) throw new Error('Input is empty.');
    const value = this.parseExpression();
    if (this.pos !== this.text.length) {
      throw new Error(`Unexpected token at position ${this.pos + 1}.`);
    }
    if (!Number.isFinite(value.real) || !Number.isFinite(value.imag)) {
      throw new Error('Input evaluates to a non-finite value.');
    }
    return value;
  }

  private parseExpression(): ComplexValue {
    let value = this.parseTerm();
    while (this.peek() === '+' || this.peek() === '-') {
      const op = this.consume();
      const right = this.parseTerm();
      value = op === '+' ? add(value, right) : sub(value, right);
    }
    return value;
  }

  private parseTerm(): ComplexValue {
    let value = this.parsePower();
    while (true) {
      const next = this.peek();
      if (next === '*') {
        this.consume();
        value = mul(value, this.parsePower());
      } else if (next === '/') {
        this.consume();
        value = div(value, this.parsePower());
      } else if (this.startsPrimary(next)) {
        value = mul(value, this.parsePower());
      } else {
        break;
      }
    }
    return value;
  }

  private parsePower(): ComplexValue {
    let value = this.parseUnary();
    if (this.peek() === '^') {
      this.consume();
      value = pow(value, this.parsePower());
    }
    return value;
  }

  private parseUnary(): ComplexValue {
    const next = this.peek();
    if (next === '+') {
      this.consume();
      return this.parseUnary();
    }
    if (next === '-') {
      this.consume();
      const value = this.parseUnary();
      return { real: -value.real, imag: -value.imag };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ComplexValue {
    const next = this.peek();
    if (next === '(') {
      this.consume();
      const value = this.parseExpression();
      if (this.consume() !== ')') throw new Error('Missing closing parenthesis.');
      return value;
    }

    if (this.isDigit(next) || next === '.') return this.parseNumber();
    if (this.isNameStart(next)) return this.parseNameOrFunction();
    throw new Error(`Unexpected token at position ${this.pos + 1}.`);
  }

  private parseNumber(): ComplexValue {
    const start = this.pos;
    if (this.peek() === '.') this.consume();
    while (this.isDigit(this.peek())) this.consume();
    if (this.peek() === '.') {
      this.consume();
      while (this.isDigit(this.peek())) this.consume();
    }
    if (this.peek() === 'e') {
      const mark = this.pos;
      this.consume();
      if (this.peek() === '+' || this.peek() === '-') this.consume();
      const digitStart = this.pos;
      while (this.isDigit(this.peek())) this.consume();
      if (digitStart === this.pos) this.pos = mark;
    }
    const raw = this.text.slice(start, this.pos);
    const real = Number(raw);
    if (!Number.isFinite(real)) throw new Error(`Invalid number "${raw}".`);
    return { real, imag: 0 };
  }

  private parseNameOrFunction(): ComplexValue {
    const start = this.pos;
    while (this.isNameStart(this.peek()) || this.isDigit(this.peek())) this.consume();
    const name = this.text.slice(start, this.pos);

    if (this.peek() === '(') {
      this.consume();
      const arg = this.parseExpression();
      if (this.consume() !== ')') throw new Error(`Missing closing parenthesis after ${name}.`);
      return this.applyFunction(name, arg);
    }

    const symbol = SYMBOLIC_NAMES[name];
    if (!symbol) throw new Error(`Unknown symbol "${name}".`);
    return symbol;
  }

  private applyFunction(name: string, arg: ComplexValue): ComplexValue {
    switch (name) {
      case 'exp':
        return expComplex(arg);
      case 'log':
      case 'ln':
        return logComplex(arg);
      case 'sqrt':
        return sqrtComplex(arg);
      case 'sin':
        return sinComplex(arg);
      case 'cos':
        return cosComplex(arg);
      case 'tan':
        return tanComplex(arg);
      default:
        throw new Error(`Unknown function "${name}".`);
    }
  }

  private startsPrimary(value: string) {
    return value === '(' || value === '.' || this.isDigit(value) || this.isNameStart(value);
  }

  private peek() {
    return this.text[this.pos] ?? '';
  }

  private consume() {
    return this.text[this.pos++] ?? '';
  }

  private isDigit(value: string) {
    return value >= '0' && value <= '9';
  }

  private isNameStart(value: string) {
    return value >= 'a' && value <= 'z';
  }
}

export function parseSearchInput(input: string): ParsedSearchInput {
  const parsed = new ComplexExpressionParser(input).parse();
  const imag = Math.abs(parsed.imag) < 1e-15 ? 0 : parsed.imag;
  return {
    source: input,
    real: parsed.real,
    imag,
    isComplex: imag !== 0 || /\bi\b/i.test(normalizeMathInput(input)),
  };
}

export function parseComplexLiteral(input: string): ComplexValue {
  const parsed = parseSearchInput(input);
  return { real: parsed.real, imag: parsed.imag };
}

export function parseFunctionInput(inputValue: string) {
  const pairs = inputValue.split(/[\n;]/).map((p) => p.trim()).filter(Boolean);
  const x_arr: number[] = [];
  const y_arr: number[] = [];
  pairs.forEach((pair) => {
    const parts = pair.split(/[:,]/);
    if (parts.length >= 2) {
      try {
        const x = parseSearchInput(parts[0]);
        const y = parseSearchInput(parts[1]);
        if (x.imag === 0 && y.imag === 0) {
          x_arr.push(x.real);
          y_arr.push(y.real);
        }
      } catch {
        // Invalid pairs are ignored, matching the worker's permissive parsing.
      }
    }
  });
  return { x_arr, y_arr };
}

export function parseMultipleConstants(inputValue: string) {
  return inputValue
    .split(/[,;\n]/)
    .map((value) => {
      try {
        const parsed = parseSearchInput(value.trim());
        return parsed.imag === 0 ? parsed.real : Number.NaN;
      } catch {
        return Number.NaN;
      }
    })
    .filter((value) => !Number.isNaN(value));
}

export function extractInputPrecision(inputString: string): Precision {
  const z = inputString;
  const normalized = normalizeMathInput(inputString);

  const literalUncertainty = simpleComplexLiteralUncertainty(normalized);
  if (literalUncertainty === null) {
    return { z, deltaZ: '0', relDeltaZ: '0' };
  }

  const parsed = parseSearchInput(inputString);
  const magnitude = Math.hypot(parsed.real, parsed.imag);
  const relDeltaZ = magnitude !== 0 ? literalUncertainty / magnitude : 0;

  return {
    z,
    deltaZ: literalUncertainty.toExponential(2),
    relDeltaZ: relDeltaZ.toExponential(2),
  };
}

export function resolveInputUncertainty(
  inputValue: string,
  errorMode: ErrorMode,
  manualError: string,
  targetMagnitude: number,
) {
  if (errorMode === 'zero') return 0;
  if (errorMode === 'manual') {
    const manual = Number(manualError);
    return Number.isFinite(manual) && manual >= 0 ? manual : 0;
  }
  if (errorMode === 'large_errors') {
    const auto = Number(extractInputPrecision(inputValue).deltaZ);
    const magnitude = Math.max(targetMagnitude, 1);
    return Math.max(Number.isFinite(auto) ? auto : 0, magnitude * 0.05);
  }
  return Number(extractInputPrecision(inputValue).deltaZ);
}

export function formatComplexValue(value: ComplexValue, digits = 16) {
  const real = Math.abs(value.real) < 1e-15 ? 0 : value.real;
  const imag = Math.abs(value.imag) < 1e-15 ? 0 : value.imag;
  if (imag === 0) return trimFormattedNumber(real, digits);
  if (real === 0) return `${trimFormattedNumber(imag, digits)}i`;
  const sign = imag >= 0 ? '+' : '-';
  return `${trimFormattedNumber(real, digits)}${sign}${trimFormattedNumber(Math.abs(imag), digits)}i`;
}
