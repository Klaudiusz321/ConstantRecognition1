import { Precision } from './types';
import { ComplexValue, extractInputPrecision, formatComplexValue } from './input';

// RPN Interpreter and conversion functions

// Named constants for display
export const namedConstants: Record<string, string> = {
  "NEG": "-1", "ZERO": "0", "ONE": "1", "TWO": "2", "THREE": "3",
  "FOUR": "4", "FIVE": "5", "SIX": "6", "SEVEN": "7", "EIGHT": "8",
  "NINE": "9", "POL": "½", "PI": "π", "EULER": "e", "GOLDENRATIO": "φ",
  "EULER_GAMMA": "γ"  // Euler-Mascheroni constant (not in WASM yet)
};
namedConstants.I = "i";

export const namedFunctions: Record<string, string> = {
  "EXP": "exp", "LOG": "ln", "INV": "inv", "MINUS": "minus",
  "SIN": "sin", "ARCSIN": "arcsin", "COS": "cos", "ARCCOS": "arccos",
  "TAN": "tan", "ARCTAN": "arctan", "SINH": "sinh", "ARCSINH": "arsinh",
  "COSH": "cosh", "ARCCOSH": "arcosh", "TANH": "tanh", "ARCTANH": "artanh",
  "SQRT": "sqrt", "SQR": "sqr", "GAMMA": "Γ"
};

export const namedOperators: Record<string, string> = {
  "PLUS": "+", "SUBTRACT": "-", "TIMES": "*", "DIVIDE": "/", "POWER": "^"
};

// Numerical constants for evaluation
export const numConstants: Record<string, number> = {
  "NEG": -1, "ZERO": 0, "ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4, "FIVE": 5,
  "SIX": 6, "SEVEN": 7, "EIGHT": 8, "NINE": 9, "POL": 0.5,
  "PI": Math.PI, "EULER": Math.E, "GOLDENRATIO": (1 + Math.sqrt(5)) / 2
};

export const numFunctions: Record<string, (x: number) => number> = {
  "EXP": Math.exp, "LOG": Math.log, "INV": x => 1/x, "MINUS": x => -x,
  "SIN": Math.sin, "ARCSIN": Math.asin, "COS": Math.cos, "ARCCOS": Math.acos,
  "TAN": Math.tan, "ARCTAN": Math.atan, "SINH": Math.sinh, "ARCSINH": Math.asinh,
  "COSH": Math.cosh, "ARCCOSH": Math.acosh, "TANH": Math.tanh, "ARCTANH": Math.atanh,
  "SQRT": Math.sqrt, "SQR": x => x*x, "GAMMA": x => gamma(x)
};

export const numOperators: Record<string, (a: number, b: number) => number> = {
  "PLUS": (a, b) => a + b, "SUBTRACT": (a, b) => a - b,
  "TIMES": (a, b) => a * b, "DIVIDE": (a, b) => a / b,
  "POWER": (a, b) => Math.pow(a, b)
};

// Gamma function approximation (Lanczos)
export function gamma(z: number): number {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

// Short-form RPN character mappings (from WebGPU)
// CONST_CHARS = '0123opqrstuvw' (13 chars)
const SHORT_CONST_MAP: Record<string, string> = {
  '0': 'PI', '1': 'EULER', '2': 'NEG', '3': 'GOLDENRATIO',
  'I': 'I',
  'o': 'ONE', 'p': 'TWO', 'q': 'THREE', 'r': 'FOUR', 's': 'FIVE',
  't': 'SIX', 'u': 'SEVEN', 'v': 'EIGHT', 'w': 'NINE'
};

// UNARY_CHARS = '4589abcdefghijklmn' (18 chars)
const SHORT_UNARY_MAP: Record<string, string> = {
  '4': 'LOG', '5': 'EXP', '8': 'INV', '9': 'GAMMA',
  'a': 'SQRT', 'b': 'SQR', 'c': 'SIN', 'd': 'ARCSIN',
  'e': 'COS', 'f': 'ARCCOS', 'g': 'TAN', 'h': 'ARCTAN',
  'i': 'SINH', 'j': 'ARCSINH', 'k': 'COSH', 'l': 'ARCCOSH',
  'm': 'TANH', 'n': 'ARCTANH'
};

// BINARY_CHARS = '67xyz' (5 chars)
const SHORT_BINARY_MAP: Record<string, string> = {
  '6': 'PLUS', '7': 'TIMES', 'x': 'SUBTRACT', 'y': 'DIVIDE', 'z': 'POWER'
};

// All valid short-form characters
const ALL_SHORT_CHARS = new Set([
  ...Object.keys(SHORT_CONST_MAP),
  ...Object.keys(SHORT_UNARY_MAP),
  ...Object.keys(SHORT_BINARY_MAP)
]);

// Check if string is short-form RPN (from WebGPU)
function isShortFormRPN(rpn: string): boolean {
  // Short-form RPN has no delimiters and all chars are from the GPU charset
  if (rpn.includes(',') || rpn.includes(' ')) return false;
  // Must have at least one char and all chars must be valid short-form
  return rpn.length > 0 && [...rpn].every(c => ALL_SHORT_CHARS.has(c));
}

// Convert short-form RPN to long-form tokens
function expandShortRPN(rpn: string): string[] {
  const tokens: string[] = [];
  for (const char of rpn) {
    if (SHORT_CONST_MAP[char]) {
      tokens.push(SHORT_CONST_MAP[char]);
    } else if (SHORT_UNARY_MAP[char]) {
      tokens.push(SHORT_UNARY_MAP[char]);
    } else if (SHORT_BINARY_MAP[char]) {
      tokens.push(SHORT_BINARY_MAP[char]);
    }
  }
  return tokens;
}

// Convert RPN string to array
export function parseRPN(rpn: string): string[] {
  if (!rpn || rpn.length === 0) return [];
  
  // Check if this is short-form RPN from WebGPU (single chars, no delimiters)
  if (isShortFormRPN(rpn)) {
    return expandShortRPN(rpn);
  }
  
  // WASM returns format like "PI, EULER, PLUS" - comma and space separated
  if (rpn.includes(',')) {
    return rpn.split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }
  // If contains spaces but no commas, split by space
  if (rpn.includes(' ')) {
    return rpn.split(' ').filter(t => t.length > 0);
  }
  // Single token (no delimiters) - return as single element array
  // This handles cases like "PI" which should be ["PI"], not ["P", "I"]
  return [rpn];
}

// Convert RPN to infix notation for display
export function rpnToInfix(rpn: string | string[]): string {
  // Detect if this is short-form (GPU) or long-form (WASM) RPN
  // Short-form uses standard RPN order, long-form uses swapped order
  const isShort = typeof rpn === 'string' && isShortFormRPN(rpn);
  const tokens = typeof rpn === 'string' ? parseRPN(rpn) : rpn;
  const stack: string[] = [];
  
  tokens.forEach(token => {
    if (namedConstants[token]) {
      stack.push(namedConstants[token]);
    } else if (namedFunctions[token]) {
      const arg = stack.pop() || '?';
      stack.push(`${namedFunctions[token]}(${arg})`);
    } else if (namedOperators[token]) {
      const right = stack.pop() || '?';  // top of stack
      const left = stack.pop() || '?';   // second from top
      if (isShort) {
        // Standard RPN: "a b op" means op(a, b)
        stack.push(`(${left} ${namedOperators[token]} ${right})`);
      } else {
        // WASM non-standard RPN: "a b op" means op(b, a)
        stack.push(`(${right} ${namedOperators[token]} ${left})`);
      }
    } else if (token) {
      // Unknown token - push as-is
      stack.push(token);
    }
  });
  
  return stack.pop() || rpn.toString();
}

// Evaluate RPN expression numerically
export function evaluateRPN(rpn: string | string[]): number {
  // Detect if this is short-form (GPU) or long-form (WASM) RPN
  const isShort = typeof rpn === 'string' && isShortFormRPN(rpn);
  const tokens = typeof rpn === 'string' ? parseRPN(rpn) : rpn;
  const stack: number[] = [];
  tokens.forEach(token => {
    if (numConstants[token] !== undefined) {
      stack.push(numConstants[token]);
    } else if (numFunctions[token]) {
      const arg = stack.pop() || 0;
      stack.push(numFunctions[token](arg));
    } else if (numOperators[token]) {
      const right = stack.pop() || 0;  // top
      const left = stack.pop() || 0;   // second
      if (isShort) {
        // Standard RPN: "a b op" means op(a, b)
        stack.push(numOperators[token](left, right));
      } else {
        // WASM non-standard RPN: "a b op" means op(b, a)
        stack.push(numOperators[token](right, left));
      }
    }
  });
  return stack.pop() || NaN;
}

const complexConstants: Record<string, ComplexValue> = {
  "NEG": { real: -1, imag: 0 }, "ZERO": { real: 0, imag: 0 },
  "ONE": { real: 1, imag: 0 }, "TWO": { real: 2, imag: 0 },
  "THREE": { real: 3, imag: 0 }, "FOUR": { real: 4, imag: 0 },
  "FIVE": { real: 5, imag: 0 }, "SIX": { real: 6, imag: 0 },
  "SEVEN": { real: 7, imag: 0 }, "EIGHT": { real: 8, imag: 0 },
  "NINE": { real: 9, imag: 0 }, "POL": { real: 0.5, imag: 0 },
  "PI": { real: Math.PI, imag: 0 }, "EULER": { real: Math.E, imag: 0 },
  "GOLDENRATIO": { real: (1 + Math.sqrt(5)) / 2, imag: 0 },
  "I": { real: 0, imag: 1 }
};

const cadd = (a: ComplexValue, b: ComplexValue): ComplexValue => ({ real: a.real + b.real, imag: a.imag + b.imag });
const csub = (a: ComplexValue, b: ComplexValue): ComplexValue => ({ real: a.real - b.real, imag: a.imag - b.imag });
const cmul = (a: ComplexValue, b: ComplexValue): ComplexValue => ({ real: a.real * b.real - a.imag * b.imag, imag: a.real * b.imag + a.imag * b.real });
const cdiv = (a: ComplexValue, b: ComplexValue): ComplexValue => {
  const denom = b.real * b.real + b.imag * b.imag;
  return { real: (a.real * b.real + a.imag * b.imag) / denom, imag: (a.imag * b.real - a.real * b.imag) / denom };
};
const cexp = (z: ComplexValue): ComplexValue => {
  const scale = Math.exp(z.real);
  return { real: scale * Math.cos(z.imag), imag: scale * Math.sin(z.imag) };
};
const clog = (z: ComplexValue): ComplexValue => ({ real: Math.log(Math.hypot(z.real, z.imag)), imag: Math.atan2(z.imag, z.real) });
const cpow = (a: ComplexValue, b: ComplexValue): ComplexValue => cexp(cmul(b, clog(a)));
const csqrt = (z: ComplexValue): ComplexValue => {
  const r = Math.hypot(z.real, z.imag);
  let sign = 1;
  if (z.imag < 0) sign = -1;
  else if (Object.is(z.imag, -0)) sign = -1;
  return {
    real: Math.sqrt((r + z.real) / 2),
    imag: sign * Math.sqrt(Math.max(0, (r - z.real) / 2))
  };
};
const csin = (z: ComplexValue): ComplexValue => ({ real: Math.sin(z.real) * Math.cosh(z.imag), imag: Math.cos(z.real) * Math.sinh(z.imag) });
const ccos = (z: ComplexValue): ComplexValue => ({ real: Math.cos(z.real) * Math.cosh(z.imag), imag: -Math.sin(z.real) * Math.sinh(z.imag) });
const ctan = (z: ComplexValue): ComplexValue => cdiv(csin(z), ccos(z));

const carcsin = (z: ComplexValue): ComplexValue => {
  const iz = { real: -z.imag, imag: z.real };
  const z2 = cmul(z, z);
  const one_minus_z2 = { real: 1 - z2.real, imag: -z2.imag };
  const term = cadd(iz, csqrt(one_minus_z2));
  const ln_term = clog(term);
  return { real: ln_term.imag, imag: -ln_term.real };
};
const carccos = (z: ComplexValue): ComplexValue => {
  const asin = carcsin(z);
  return { real: Math.PI/2 - asin.real, imag: -asin.imag };
};
const carctan = (z: ComplexValue): ComplexValue => {
  const num = { real: z.real, imag: 1 + z.imag };
  const den = { real: -z.real, imag: 1 - z.imag };
  const frac = cdiv(num, den);
  const ln_term = clog(frac);
  return { real: -ln_term.imag / 2, imag: ln_term.real / 2 };
};
const carcsinh = (z: ComplexValue): ComplexValue => {
  const z2 = cmul(z, z);
  const z2_plus_1 = { real: z2.real + 1, imag: z2.imag };
  const term = cadd(z, csqrt(z2_plus_1));
  return clog(term);
};
const carccosh = (z: ComplexValue): ComplexValue => {
  const z_minus_1 = { real: z.real - 1, imag: z.imag };
  const z_plus_1 = { real: z.real + 1, imag: z.imag };
  const term = cadd(z, cmul(csqrt(z_minus_1), csqrt(z_plus_1)));
  return clog(term);
};
const carctanh = (z: ComplexValue): ComplexValue => {
  const t1 = clog({ real: 1 + z.real, imag: z.imag });
  const t2 = clog({ real: 1 - z.real, imag: -z.imag });
  const diff = csub(t1, t2);
  return { real: diff.real / 2, imag: diff.imag / 2 };
};

const complexFunctions: Record<string, (x: ComplexValue) => ComplexValue> = {
  "EXP": cexp, "LOG": clog, "INV": x => cdiv({ real: 1, imag: 0 }, x),
  "MINUS": x => ({ real: -x.real, imag: -x.imag }),
  "SIN": csin, "COS": ccos, "TAN": ctan, "SQRT": csqrt,
  "SQR": x => cmul(x, x),
  "ARCSIN": carcsin, "ARCCOS": carccos, "ARCTAN": carctan,
  "SINH": x => ({ real: Math.sinh(x.real) * Math.cos(x.imag), imag: Math.cosh(x.real) * Math.sin(x.imag) }),
  "COSH": x => ({ real: Math.cosh(x.real) * Math.cos(x.imag), imag: Math.sinh(x.real) * Math.sin(x.imag) }),
  "TANH": x => cdiv(
    { real: Math.sinh(x.real) * Math.cos(x.imag), imag: Math.cosh(x.real) * Math.sin(x.imag) },
    { real: Math.cosh(x.real) * Math.cos(x.imag), imag: Math.sinh(x.real) * Math.sin(x.imag) }
  ),
  "ARCSINH": carcsinh, "ARCCOSH": carccosh, "ARCTANH": carctanh,
  "GAMMA": x => x.imag === 0 ? { real: gamma(x.real), imag: 0 } : { real: NaN, imag: NaN }
};

const complexOperators: Record<string, (a: ComplexValue, b: ComplexValue) => ComplexValue> = {
  "PLUS": cadd, "SUBTRACT": csub, "TIMES": cmul, "DIVIDE": cdiv, "POWER": cpow
};

export function evaluateRPNComplex(rpn: string | string[]): ComplexValue {
  const isShort = typeof rpn === 'string' && isShortFormRPN(rpn);
  const tokens = typeof rpn === 'string' ? parseRPN(rpn) : rpn;
  const stack: ComplexValue[] = [];
  tokens.forEach(token => {
    if (complexConstants[token] !== undefined) {
      stack.push(complexConstants[token]);
    } else if (complexFunctions[token]) {
      const arg = stack.pop() || { real: 0, imag: 0 };
      stack.push(complexFunctions[token](arg));
    } else if (complexOperators[token]) {
      const right = stack.pop() || { real: 0, imag: 0 };
      const left = stack.pop() || { real: 0, imag: 0 };
      stack.push(isShort ? complexOperators[token](left, right) : complexOperators[token](right, left));
    }
  });
  return stack.pop() || { real: NaN, imag: NaN };
}

export function evaluateRPNDisplay(rpn: string | string[], domain: 'real' | 'complex' = 'real'): string {
  if (domain === 'complex') return formatComplexValue(evaluateRPNComplex(rpn));
  return evaluateRPN(rpn).toString();
}

// Extract precision info from input string
export function extractPrecision(inputString: string): Precision {
  return extractInputPrecision(inputString);
}

// Convert RPN to Mathematica syntax
export function rpnToMathematica(rpn: string | string[]): string {
  // Detect if this is short-form (GPU) or long-form (WASM) RPN
  const isShort = typeof rpn === 'string' && isShortFormRPN(rpn);
  const tokens = typeof rpn === 'string' ? parseRPN(rpn) : rpn;
  const mmaConstants: Record<string, string> = {
    "NEG": "(-1)", "ZERO": "0", "ONE": "1", "TWO": "2", "THREE": "3",
    "FOUR": "4", "FIVE": "5", "SIX": "6", "SEVEN": "7", "EIGHT": "8",
    "NINE": "9", "PI": "Pi", "EULER": "E", "GOLDENRATIO": "GoldenRatio",
    "I": "I", "EULER_GAMMA": "EulerGamma", "POL": "(1/2)"
  };
  const mmaFunctions: Record<string, string> = {
    "EXP": "Exp", "LOG": "Log", "SIN": "Sin", "ARCSIN": "ArcSin",
    "COS": "Cos", "ARCCOS": "ArcCos", "TAN": "Tan", "ARCTAN": "ArcTan",
    "SINH": "Sinh", "ARCSINH": "ArcSinh", "COSH": "Cosh", "ARCCOSH": "ArcCosh",
    "TANH": "Tanh", "ARCTANH": "ArcTanh", "SQRT": "Sqrt", "GAMMA": "Gamma",
    "MINUS": "Minus"
  };
  const mmaUnnamed: Record<string, (x: string) => string> = {
    "SQR": x => `(${x})^2`,
    "INV": x => `1/(${x})`,
    "MINUS": x => `(-${x})`
  };
  const mmaOperators: Record<string, string> = {
    "PLUS": "+", "SUBTRACT": "-", "TIMES": "*", "DIVIDE": "/", "POWER": "^"
  };

  const stack: string[] = [];
  tokens.forEach(token => {
    if (mmaConstants[token]) {
      stack.push(mmaConstants[token]);
    } else if (mmaUnnamed[token]) {
      const arg = stack.pop() || '?';
      stack.push(mmaUnnamed[token](arg));
    } else if (mmaFunctions[token]) {
      const arg = stack.pop() || '?';
      stack.push(`${mmaFunctions[token]}[${arg}]`);
    } else if (mmaOperators[token]) {
      const right = stack.pop() || '?';  // top
      const left = stack.pop() || '?';   // second
      if (isShort) {
        // Standard RPN: "a b op" means op(a, b)
        stack.push(`(${left} ${mmaOperators[token]} ${right})`);
      } else {
        // WASM non-standard RPN: "a b op" means op(b, a)
        stack.push(`(${right} ${mmaOperators[token]} ${left})`);
      }
    } else if (token) {
      // Unknown token - push as-is
      stack.push(token);
    }
  });
  return stack.pop() || rpn.toString();
}

// Create Wolfram Alpha link
export function createWolframLink(formula: string): string {
  return `https://www.wolframalpha.com/input?i=${encodeURIComponent(formula)}`;
}

// Convert RPN to LaTeX syntax for beautiful rendering
export function rpnToLatex(rpn: string | string[]): string {
  // Detect if this is short-form (GPU) or long-form (WASM) RPN
  const isShort = typeof rpn === 'string' && isShortFormRPN(rpn);
  const tokens = typeof rpn === 'string' ? parseRPN(rpn) : rpn;
  
  type LatexNode = { latex: string; precedence: number };
  const wrapWithParens = (node: LatexNode, minPrecedence: number) => {
    if (node.precedence < minPrecedence) {
      return `\\left(${node.latex}\\right)`;
    }
    return node.latex;
  };

  const latexConstants: Record<string, string> = {
    "NEG": "(-1)", "ZERO": "0", "ONE": "1", "TWO": "2", "THREE": "3",
    "FOUR": "4", "FIVE": "5", "SIX": "6", "SEVEN": "7", "EIGHT": "8",
    "NINE": "9", "PI": "\\pi", "EULER": "e", "GOLDENRATIO": "\\varphi",
    "I": "i", "EULER_GAMMA": "\\gamma"
  };
  
  const latexFunctions: Record<string, (x: string) => string> = {
    "EXP": x => `e^{${x}}`,
    "LOG": x => `\\ln(${x})`,
    "SIN": x => `\\sin(${x})`,
    "ARCSIN": x => `\\arcsin(${x})`,
    "COS": x => `\\cos(${x})`,
    "ARCCOS": x => `\\arccos(${x})`,
    "TAN": x => `\\tan(${x})`,
    "ARCTAN": x => `\\arctan(${x})`,
    "SINH": x => `\\sinh(${x})`,
    "ARCSINH": x => `\\text{arsinh}(${x})`,
    "COSH": x => `\\cosh(${x})`,
    "ARCCOSH": x => `\\text{arcosh}(${x})`,
    "TANH": x => `\\tanh(${x})`,
    "ARCTANH": x => `\\text{artanh}(${x})`,
    "SQRT": x => `\\sqrt{${x}}`,
    "SQR": x => `(${x})^2`,
    "GAMMA": x => `\\Gamma(${x})`,
    "INV": x => `\\frac{1}{${x}}`,
    "MINUS": x => `(-${x})`
  };
  
  const latexOperators = new Set(["PLUS", "SUBTRACT", "TIMES", "DIVIDE", "POWER"]);

  const stack: LatexNode[] = [];
  tokens.forEach(token => {
    if (latexConstants[token]) {
      stack.push({ latex: latexConstants[token], precedence: 5 });
    } else if (latexFunctions[token]) {
      const arg = stack.pop() || { latex: '?', precedence: 5 };
      stack.push({ latex: latexFunctions[token](arg.latex), precedence: 4 });
    } else if (latexOperators.has(token)) {
      const right = stack.pop() || { latex: '?', precedence: 5 };  // top
      const left = stack.pop() || { latex: '?', precedence: 5 };   // second
      const lhs = isShort ? left : right;
      const rhs = isShort ? right : left;

      if (token === 'PLUS') {
        const leftLatex = wrapWithParens(lhs, 1);
        const rightLatex = wrapWithParens(rhs, 1);
        stack.push({ latex: `${leftLatex} + ${rightLatex}`, precedence: 1 });
        return;
      }
      if (token === 'SUBTRACT') {
        const leftLatex = wrapWithParens(lhs, 1);
        const rightLatex = wrapWithParens(rhs, 2);
        stack.push({ latex: `${leftLatex} - ${rightLatex}`, precedence: 1 });
        return;
      }
      if (token === 'TIMES') {
        const leftLatex = wrapWithParens(lhs, 2);
        const rightLatex = wrapWithParens(rhs, 2);
        stack.push({ latex: `${leftLatex} \\cdot ${rightLatex}`, precedence: 2 });
        return;
      }
      if (token === 'DIVIDE') {
        const leftLatex = wrapWithParens(lhs, 2);
        const rightLatex = wrapWithParens(rhs, 2);
        stack.push({ latex: `\\frac{${leftLatex}}{${rightLatex}}`, precedence: 2 });
        return;
      }
      if (token === 'POWER') {
        const leftLatex = wrapWithParens(lhs, 3);
        const rightLatex = wrapWithParens(rhs, 4);
        stack.push({ latex: `{${leftLatex}}^{${rightLatex}}`, precedence: 3 });
        return;
      }
    } else if (token) {
      stack.push({ latex: token, precedence: 5 });
    }
  });
  return stack.pop()?.latex || rpn.toString();
}
