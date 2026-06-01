/**
 * RPN Evaluator for short-form RPN codes.
 * Provides FP64 CPU verification for WebGPU candidates.
 */

export type SearchDomain = 'real' | 'complex';

export interface ComplexNumber {
  real: number;
  imag: number;
}

// Number of opcodes per type.
export const N_CONST = 13;
export const N_CONST_COMPLEX = 14;
export const N_UNARY = 18;
export const N_BINARY = 5;

// Character mappings for short-form RPN.
export const CONST_CHARS = '0123opqrstuvw';
export const CONST_CHARS_COMPLEX = '0123Iopqrstuvw';
export const UNARY_CHARS = '4589abcdefghijklmn';
export const BINARY_CHARS = '67xyz';

const FP64_CONSTANTS: number[] = [
  Math.PI,
  Math.E,
  -1,
  (1 + Math.sqrt(5)) / 2,
  1, 2, 3, 4, 5, 6, 7, 8, 9,
];

const FP64_COMPLEX_CONSTANTS: ComplexNumber[] = [
  { real: Math.PI, imag: 0 },
  { real: Math.E, imag: 0 },
  { real: -1, imag: 0 },
  { real: (1 + Math.sqrt(5)) / 2, imag: 0 },
  { real: 0, imag: 1 },
  { real: 1, imag: 0 },
  { real: 2, imag: 0 },
  { real: 3, imag: 0 },
  { real: 4, imag: 0 },
  { real: 5, imag: 0 },
  { real: 6, imag: 0 },
  { real: 7, imag: 0 },
  { real: 8, imag: 0 },
  { real: 9, imag: 0 },
];

const gamma = (z: number): number => {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  let x = c[0];
  const shifted = z - 1;
  for (let i = 1; i < c.length; i++) x += c[i] / (shifted + i);
  const t = shifted + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, shifted + 0.5) * Math.exp(-t) * x;
};

const FP64_UNARY: ((x: number) => number)[] = [
  Math.log,
  Math.exp,
  x => 1 / x,
  gamma,
  Math.sqrt,
  x => x * x,
  Math.sin,
  Math.asin,
  Math.cos,
  Math.acos,
  Math.tan,
  Math.atan,
  Math.sinh,
  Math.asinh,
  Math.cosh,
  Math.acosh,
  Math.tanh,
  Math.atanh,
];

const FP64_BINARY: ((a: number, b: number) => number)[] = [
  (a, b) => a + b,
  (a, b) => a * b,
  (a, b) => a - b,
  (a, b) => a / b,
  Math.pow,
];

const cadd = (a: ComplexNumber, b: ComplexNumber): ComplexNumber => ({
  real: a.real + b.real,
  imag: a.imag + b.imag,
});

const csub = (a: ComplexNumber, b: ComplexNumber): ComplexNumber => ({
  real: a.real - b.real,
  imag: a.imag - b.imag,
});

const cmul = (a: ComplexNumber, b: ComplexNumber): ComplexNumber => ({
  real: a.real * b.real - a.imag * b.imag,
  imag: a.real * b.imag + a.imag * b.real,
});

const cdiv = (a: ComplexNumber, b: ComplexNumber): ComplexNumber => {
  const denom = b.real * b.real + b.imag * b.imag;
  return {
    real: (a.real * b.real + a.imag * b.imag) / denom,
    imag: (a.imag * b.real - a.real * b.imag) / denom,
  };
};

const cexp = (z: ComplexNumber): ComplexNumber => {
  const scale = Math.exp(z.real);
  return { real: scale * Math.cos(z.imag), imag: scale * Math.sin(z.imag) };
};

const clog = (z: ComplexNumber): ComplexNumber => ({
  real: Math.log(Math.hypot(z.real, z.imag)),
  imag: Math.atan2(z.imag, z.real),
});

const cpow = (a: ComplexNumber, b: ComplexNumber): ComplexNumber => cexp(cmul(b, clog(a)));

const csqrt = (z: ComplexNumber): ComplexNumber => {
  const r = Math.hypot(z.real, z.imag);
  const sign = z.imag < 0 || Object.is(z.imag, -0) ? -1 : 1;
  return {
    real: Math.sqrt(Math.max(0, (r + z.real) / 2)),
    imag: sign * Math.sqrt(Math.max(0, (r - z.real) / 2)),
  };
};

const csin = (z: ComplexNumber): ComplexNumber => ({
  real: Math.sin(z.real) * Math.cosh(z.imag),
  imag: Math.cos(z.real) * Math.sinh(z.imag),
});

const ccos = (z: ComplexNumber): ComplexNumber => ({
  real: Math.cos(z.real) * Math.cosh(z.imag),
  imag: -Math.sin(z.real) * Math.sinh(z.imag),
});

const ctan = (z: ComplexNumber): ComplexNumber => cdiv(csin(z), ccos(z));

const csinh = (z: ComplexNumber): ComplexNumber => ({
  real: Math.sinh(z.real) * Math.cos(z.imag),
  imag: Math.cosh(z.real) * Math.sin(z.imag),
});

const ccosh = (z: ComplexNumber): ComplexNumber => ({
  real: Math.cosh(z.real) * Math.cos(z.imag),
  imag: Math.sinh(z.real) * Math.sin(z.imag),
});

const ctanh = (z: ComplexNumber): ComplexNumber => cdiv(csinh(z), ccosh(z));

const casin = (z: ComplexNumber): ComplexNumber => {
  const iz = { real: -z.imag, imag: z.real };
  const z2 = cmul(z, z);
  const term = cadd(iz, csqrt({ real: 1 - z2.real, imag: -z2.imag }));
  const lnTerm = clog(term);
  return { real: lnTerm.imag, imag: -lnTerm.real };
};

const cacos = (z: ComplexNumber): ComplexNumber => {
  const asin = casin(z);
  return { real: Math.PI / 2 - asin.real, imag: -asin.imag };
};

const catan = (z: ComplexNumber): ComplexNumber => {
  const num = { real: z.real, imag: 1 + z.imag };
  const den = { real: -z.real, imag: 1 - z.imag };
  const lnTerm = clog(cdiv(num, den));
  return { real: -lnTerm.imag / 2, imag: lnTerm.real / 2 };
};

const casinh = (z: ComplexNumber): ComplexNumber => {
  const z2 = cmul(z, z);
  return clog(cadd(z, csqrt({ real: z2.real + 1, imag: z2.imag })));
};

const cacosh = (z: ComplexNumber): ComplexNumber => {
  const zMinus1 = { real: z.real - 1, imag: z.imag };
  const zPlus1 = { real: z.real + 1, imag: z.imag };
  return clog(cadd(z, cmul(csqrt(zMinus1), csqrt(zPlus1))));
};

const catanh = (z: ComplexNumber): ComplexNumber => {
  const t1 = clog({ real: 1 + z.real, imag: z.imag });
  const t2 = clog({ real: 1 - z.real, imag: -z.imag });
  const diff = csub(t1, t2);
  return { real: diff.real / 2, imag: diff.imag / 2 };
};

const cgamma = (z: ComplexNumber): ComplexNumber =>
  Math.abs(z.imag) < 1e-12 ? { real: gamma(z.real), imag: 0 } : { real: NaN, imag: NaN };

const FP64_COMPLEX_UNARY: ((x: ComplexNumber) => ComplexNumber)[] = [
  clog,
  cexp,
  x => cdiv({ real: 1, imag: 0 }, x),
  cgamma,
  csqrt,
  x => cmul(x, x),
  csin,
  casin,
  ccos,
  cacos,
  ctan,
  catan,
  csinh,
  casinh,
  ccosh,
  cacosh,
  ctanh,
  catanh,
];

const FP64_COMPLEX_BINARY: ((a: ComplexNumber, b: ComplexNumber) => ComplexNumber)[] = [
  cadd,
  cmul,
  csub,
  cdiv,
  cpow,
];

export function evaluateShortRPN(rpn: string): number {
  const stack: number[] = [];

  for (const char of rpn) {
    const constIdx = CONST_CHARS.indexOf(char);
    const unaryIdx = UNARY_CHARS.indexOf(char);
    const binaryIdx = BINARY_CHARS.indexOf(char);

    if (constIdx >= 0) {
      stack.push(FP64_CONSTANTS[constIdx]);
    } else if (unaryIdx >= 0) {
      if (stack.length < 1) return NaN;
      const x = stack.pop()!;
      stack.push(FP64_UNARY[unaryIdx](x));
    } else if (binaryIdx >= 0) {
      if (stack.length < 2) return NaN;
      const b = stack.pop()!;
      const a = stack.pop()!;
      stack.push(FP64_BINARY[binaryIdx](a, b));
    }
  }

  return stack.length === 1 ? stack[0] : NaN;
}

export function evaluateShortRPNComplex(rpn: string): ComplexNumber {
  const stack: ComplexNumber[] = [];

  for (const char of rpn) {
    const constIdx = CONST_CHARS_COMPLEX.indexOf(char);
    const unaryIdx = UNARY_CHARS.indexOf(char);
    const binaryIdx = BINARY_CHARS.indexOf(char);

    if (constIdx >= 0) {
      stack.push(FP64_COMPLEX_CONSTANTS[constIdx]);
    } else if (unaryIdx >= 0) {
      if (stack.length < 1) return { real: NaN, imag: NaN };
      const x = stack.pop()!;
      stack.push(FP64_COMPLEX_UNARY[unaryIdx](x));
    } else if (binaryIdx >= 0) {
      if (stack.length < 2) return { real: NaN, imag: NaN };
      const b = stack.pop()!;
      const a = stack.pop()!;
      stack.push(FP64_COMPLEX_BINARY[binaryIdx](a, b));
    }
  }

  return stack.length === 1 ? stack[0] : { real: NaN, imag: NaN };
}

export function indexToRPN(
  idx: number,
  form: number[],
  radix: number[],
  K: number,
  domain: SearchDomain = 'real',
): string {
  let result = '';
  let remaining = idx;
  const constChars = domain === 'complex' ? CONST_CHARS_COMPLEX : CONST_CHARS;

  for (let i = 0; i < K; i++) {
    const slot = remaining % radix[i];
    remaining = Math.floor(remaining / radix[i]);

    switch (form[i]) {
      case 0: result += constChars[slot]; break;
      case 1: result += UNARY_CHARS[slot]; break;
      case 2: result += BINARY_CHARS[slot]; break;
    }
  }

  return result;
}
