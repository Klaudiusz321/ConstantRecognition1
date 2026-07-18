import type { CompiledCalculator } from './calculator';
import { FormTokenKind, MAX_GPU_K, type RpnForm } from './types';

function radixFor(kind: FormTokenKind, calculator: CompiledCalculator): number {
  switch (kind) {
    case FormTokenKind.Constant:
      return calculator.constCodes.length;
    case FormTokenKind.Unary:
      return calculator.unaryCodes.length;
    case FormTokenKind.Binary:
      return calculator.binaryCodes.length;
  }
}

function validateK(K: number): void {
  if (!Number.isInteger(K) || K < 1 || K > MAX_GPU_K) {
    throw new RangeError(`K must be an integer in [1, ${MAX_GPU_K}], received ${K}.`);
  }
}

/**
 * Count valid RPN structures without materializing them. This is used for
 * progress reporting; the search itself streams forms one at a time.
 */
export function countValidForms(K: number, calculator: CompiledCalculator): number {
  validateK(K);
  const hasUnary = calculator.unaryCodes.length > 0;
  const hasBinary = calculator.binaryCodes.length > 0;
  const memo = new Map<string, number>();

  const count = (position: number, stackDepth: number): number => {
    if (position === K) return stackDepth === 1 ? 1 : 0;

    const key = `${position}:${stackDepth}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    const remainingAfter = K - position - 1;
    let total = 0;

    const canStillReachOne = (nextStack: number): boolean => {
      const maximumFutureReductions = hasBinary ? remainingAfter : 0;
      return nextStack - maximumFutureReductions <= 1;
    };

    if (canStillReachOne(stackDepth + 1)) {
      total += count(position + 1, stackDepth + 1);
    }
    if (hasUnary && stackDepth >= 1 && canStillReachOne(stackDepth)) {
      total += count(position + 1, stackDepth);
    }
    if (hasBinary && stackDepth >= 2 && canStillReachOne(stackDepth - 1)) {
      total += count(position + 1, stackDepth - 1);
    }

    memo.set(key, total);
    return total;
  };

  return count(0, 0);
}

/**
 * Stream valid RPN structures. K is the number of RPN tokens, never a CPU or
 * GPU thread count. The structure ID uses the same big-endian ternary
 * convention as vsearch_RPN_core.c: 0=constant, 1=unary, 2=binary.
 *
 * Streaming is important for deep searches: K=16 already has 310,572 valid
 * full-CALC4 structures, so retaining every typed array at once is wasteful.
 */
export function* iterateValidForms(
  K: number,
  calculator: CompiledCalculator,
): Generator<RpnForm, void, void> {
  validateK(K);

  const hasUnary = calculator.unaryCodes.length > 0;
  const hasBinary = calculator.binaryCodes.length > 0;
  const kinds = new Uint32Array(K);

  function* visit(
    position: number,
    stackDepth: number,
    structureId: bigint,
  ): Generator<RpnForm, void, void> {
    if (position === K) {
      if (stackDepth !== 1) return;

      const frozenKinds = kinds.slice();
      const radices = new Uint32Array(K);
      let total = BigInt(1);

      for (let i = 0; i < K; i++) {
        const radix = radixFor(frozenKinds[i] as FormTokenKind, calculator);
        if (radix === 0) return;
        radices[i] = radix;
        total *= BigInt(radix);
      }

      yield {
        K,
        structureId,
        kinds: frozenKinds,
        radices,
        totalCombinations: total,
      };
      return;
    }

    const remainingAfter = K - position - 1;
    const canStillReachOne = (nextStack: number): boolean => {
      const maximumFutureReductions = hasBinary ? remainingAfter : 0;
      return nextStack - maximumFutureReductions <= 1;
    };

    const tryChoice = function* (
      kind: FormTokenKind,
      nextStack: number,
    ): Generator<RpnForm, void, void> {
      if (!canStillReachOne(nextStack)) return;
      kinds[position] = kind;
      yield* visit(
        position + 1,
        nextStack,
        structureId * BigInt(3) + BigInt(kind),
      );
    };

    yield* tryChoice(FormTokenKind.Constant, stackDepth + 1);
    if (hasUnary && stackDepth >= 1) {
      yield* tryChoice(FormTokenKind.Unary, stackDepth);
    }
    if (hasBinary && stackDepth >= 2) {
      yield* tryChoice(FormTokenKind.Binary, stackDepth - 1);
    }
  }

  yield* visit(0, 0, BigInt(0));
}

/** Convenience helper for tests and shallow searches. */
export function generateValidForms(
  K: number,
  calculator: CompiledCalculator,
): RpnForm[] {
  return [...iterateValidForms(K, calculator)];
}

export function countLevelCombinations(forms: Iterable<RpnForm>): bigint {
  let total = BigInt(0);
  for (const form of forms) total += form.totalCombinations;
  return total;
}
