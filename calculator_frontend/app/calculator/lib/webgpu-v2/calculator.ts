export const CALC4_CONSTANTS = [
  'PI', 'EULER', 'NEG', 'GOLDENRATIO', 'ONE', 'TWO', 'THREE', 'FOUR',
  'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
] as const;

export const CALC4_UNARY = [
  'LOG', 'EXP', 'INV', 'GAMMA', 'SQRT', 'SQR', 'SIN', 'ARCSIN', 'COS',
  'ARCCOS', 'TAN', 'ARCTAN', 'SINH', 'ARCSINH', 'COSH', 'ARCCOSH',
  'TANH', 'ARCTANH',
] as const;

export const CALC4_BINARY = [
  'PLUS', 'TIMES', 'SUBTRACT', 'DIVIDE', 'POWER',
] as const;

export type ConstantToken = (typeof CALC4_CONSTANTS)[number];
export type UnaryToken = (typeof CALC4_UNARY)[number];
export type BinaryToken = (typeof CALC4_BINARY)[number];
export type CalculatorToken = ConstantToken | UnaryToken | BinaryToken;

export interface CalculatorSelection {
  consts: readonly string[];
  funcs: readonly string[];
  ops: readonly string[];
}

export interface CompiledCalculator {
  readonly constCodes: Uint32Array;
  readonly unaryCodes: Uint32Array;
  readonly binaryCodes: Uint32Array;
  readonly constNames: readonly ConstantToken[];
  readonly unaryNames: readonly UnaryToken[];
  readonly binaryNames: readonly BinaryToken[];
}

export const FULL_CALC4: CalculatorSelection = {
  consts: CALC4_CONSTANTS,
  funcs: CALC4_UNARY,
  ops: CALC4_BINARY,
};

function compileKind<T extends string>(
  requested: readonly string[],
  canonical: readonly T[],
  label: string,
): { codes: Uint32Array; names: T[] } {
  const seen = new Set<string>();
  const codes: number[] = [];
  const names: T[] = [];

  for (const name of requested) {
    if (seen.has(name)) continue;
    const code = canonical.indexOf(name as T);
    if (code < 0) {
      throw new Error(`Unknown ${label} token: ${name}`);
    }
    seen.add(name);
    codes.push(code);
    names.push(canonical[code]);
  }

  return { codes: Uint32Array.from(codes), names };
}

export function compileCalculator(
  selection: CalculatorSelection = FULL_CALC4,
): CompiledCalculator {
  const constants = compileKind(selection.consts, CALC4_CONSTANTS, 'constant');
  const unary = compileKind(selection.funcs, CALC4_UNARY, 'unary function');
  const binary = compileKind(selection.ops, CALC4_BINARY, 'binary operator');

  if (constants.codes.length === 0) {
    throw new Error('At least one constant must be enabled.');
  }

  return {
    constCodes: constants.codes,
    unaryCodes: unary.codes,
    binaryCodes: binary.codes,
    constNames: constants.names,
    unaryNames: unary.names,
    binaryNames: binary.names,
  };
}
