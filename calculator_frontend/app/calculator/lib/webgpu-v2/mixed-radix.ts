import {
  CALC4_BINARY,
  CALC4_CONSTANTS,
  CALC4_UNARY,
  type CalculatorToken,
  type CompiledCalculator,
} from './calculator';
import { FormTokenKind, type RpnForm } from './types';

/** Last RPN position is the least-significant mixed-radix digit. */
export function indexToDigits(index: bigint, radices: Uint32Array): Uint32Array {
  if (index < BigInt(0)) throw new RangeError('Mixed-radix index cannot be negative.');

  const digits = new Uint32Array(radices.length);
  let remaining = index;

  for (let i = radices.length - 1; i >= 0; i--) {
    const radix = BigInt(radices[i]);
    if (radix <= BigInt(0)) throw new RangeError(`Invalid radix at position ${i}.`);
    digits[i] = Number(remaining % radix);
    remaining /= radix;
  }

  if (remaining !== BigInt(0)) {
    throw new RangeError('Mixed-radix index is outside the form range.');
  }
  return digits;
}

export function digitsToIndex(digits: Uint32Array, radices: Uint32Array): bigint {
  if (digits.length !== radices.length) {
    throw new RangeError('Digit and radix arrays must have equal lengths.');
  }

  let index = BigInt(0);
  for (let i = 0; i < digits.length; i++) {
    if (digits[i] >= radices[i]) {
      throw new RangeError(`Digit ${i} is outside its radix.`);
    }
    index = index * BigInt(radices[i]) + BigInt(digits[i]);
  }
  return index;
}

export function decodeCombination(
  form: RpnForm,
  calculator: CompiledCalculator,
  combinationIndex: bigint,
): CalculatorToken[] {
  if (combinationIndex < BigInt(0) || combinationIndex >= form.totalCombinations) {
    throw new RangeError('Combination index outside form range.');
  }

  const digits = indexToDigits(combinationIndex, form.radices);
  const tokens: CalculatorToken[] = [];

  for (let i = 0; i < form.K; i++) {
    const digit = digits[i];
    switch (form.kinds[i] as FormTokenKind) {
      case FormTokenKind.Constant: {
        const canonicalCode = calculator.constCodes[digit];
        tokens.push(CALC4_CONSTANTS[canonicalCode]);
        break;
      }
      case FormTokenKind.Unary: {
        const canonicalCode = calculator.unaryCodes[digit];
        tokens.push(CALC4_UNARY[canonicalCode]);
        break;
      }
      case FormTokenKind.Binary: {
        const canonicalCode = calculator.binaryCodes[digit];
        tokens.push(CALC4_BINARY[canonicalCode]);
        break;
      }
    }
  }
  return tokens;
}

/**
 * CPU reference for the carry algorithm used by the WGSL shader. The offset
 * must fit u32 because one WebGPU dispatch is bounded by u32 invocation IDs.
 */
export function addU32OffsetToDigits(
  baseDigits: Uint32Array,
  radices: Uint32Array,
  offset: number,
): Uint32Array {
  if (baseDigits.length !== radices.length) {
    throw new RangeError('Base digit and radix arrays must have equal lengths.');
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 0xffff_ffff) {
    throw new RangeError('Offset must be an unsigned 32-bit integer.');
  }

  const result = baseDigits.slice();
  let carry = offset;
  for (let position = result.length - 1; position >= 0; position--) {
    const radix = radices[position];
    if (radix === 0) throw new RangeError(`Invalid radix at position ${position}.`);

    const addend = carry % radix;
    carry = Math.floor(carry / radix);
    const sum = result[position] + addend;
    if (sum >= radix) {
      result[position] = sum - radix;
      carry += 1;
    } else {
      result[position] = sum;
    }
  }

  if (carry !== 0) {
    throw new RangeError('Offset crosses the end of the mixed-radix range.');
  }
  return result;
}
