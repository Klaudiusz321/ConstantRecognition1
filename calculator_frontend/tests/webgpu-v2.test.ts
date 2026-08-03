import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CALC4_BINARY,
  CALC4_CONSTANTS,
  CALC4_UNARY,
  compileCalculator,
} from '../app/calculator/lib/webgpu-v2/calculator';
import {
  evaluateCoreRPN,
  gamma,
} from '../app/calculator/lib/webgpu-v2/cpu-verifier';
import {
  countLevelCombinations,
  countValidForms,
  generateValidForms,
} from '../app/calculator/lib/webgpu-v2/forms';
import {
  getCompressionRatio,
  isAcceptedCandidate,
} from '../app/calculator/lib/webgpu-v2/metrics';
import {
  addU32OffsetToDigits,
  digitsToIndex,
  indexToDigits,
} from '../app/calculator/lib/webgpu-v2/mixed-radix';
import { assertGPUSelfTestEvidence } from '../app/calculator/lib/webgpu-v2/webgpu-engine';
import { FormTokenKind } from '../app/calculator/lib/webgpu-v2/types';

const EXPECTED_FORM_COUNTS = [1, 1, 2, 4, 9, 21, 51, 127, 323];
const EXPECTED_LEVEL_COMBINATIONS = [
  '13',
  '234',
  '5057',
  '121446',
  '3117218',
  '83731284',
  '2324451337',
  '66161005326',
  '1920391343078',
];

describe('WebGPU v2 RPN form generation', () => {
  const calculator = compileCalculator();

  it('matches the valid CALC4 structure counts for K=1..9', () => {
    for (let K = 1; K <= 9; K++) {
      const forms = generateValidForms(K, calculator);
      expect(forms).toHaveLength(EXPECTED_FORM_COUNTS[K - 1]);
      expect(countLevelCombinations(forms).toString())
        .toBe(EXPECTED_LEVEL_COMBINATIONS[K - 1]);
    }
  });

  it('generates structures that are stack-valid and instantiate the selected calculator', () => {
    const restricted = compileCalculator({
      consts: ['PI', 'TWO'],
      funcs: ['LOG'],
      ops: [],
    });
    const forms = generateValidForms(6, restricted);

    for (const form of forms) {
      let stack = 0;
      for (let i = 0; i < form.K; i++) {
        const kind = form.kinds[i] as FormTokenKind;
        if (kind === FormTokenKind.Constant) stack++;
        if (kind === FormTokenKind.Unary) expect(stack).toBeGreaterThanOrEqual(1);
        if (kind === FormTokenKind.Binary) {
          expect.fail('A form requiring a disabled binary operator was generated.');
        }
      }
      expect(stack).toBe(1);
      expect(form.totalCombinations).toBe(
        BigInt(2) * BigInt(1) ** BigInt(form.K - 1),
      );
    }
  });

  it('counts deep levels without materializing hundreds of thousands of forms', () => {
    expect(countValidForms(16, calculator)).toBe(310572);
  });

  it('exposes why a u32 global formula index is insufficient from K=8', () => {
    const K8 = generateValidForms(8, calculator);
    const largest = K8.reduce(
      (best, form) => form.totalCombinations > best ? form.totalCombinations : best,
      BigInt(0),
    );
    expect(largest).toBe(BigInt('7958860416'));
    expect(largest).toBeGreaterThan(BigInt('4294967295'));
  });
});

describe('BigInt mixed-radix tiling', () => {
  it('round-trips indices beyond u32 without losing precision', () => {
    const radices = Uint32Array.from([13, 18, 18, 18, 18, 18, 18, 18]);
    const index = BigInt('7000000000');
    const digits = indexToDigits(index, radices);
    expect(digitsToIndex(digits, radices)).toBe(index);
  });

  it('matches the WGSL carry algorithm across mixed-radix boundaries', () => {
    const radices = Uint32Array.from([13, 18, 18, 18, 18, 18, 18, 18]);
    const start = BigInt('6000000000');
    const offset = 1_234_567;
    const base = indexToDigits(start, radices);
    const advanced = addU32OffsetToDigits(base, radices, offset);
    expect(digitsToIndex(advanced, radices)).toBe(start + BigInt(offset));
  });

  it('rejects an index outside the form range', () => {
    expect(() => indexToDigits(BigInt(12), Uint32Array.from([2, 3])))
      .toThrow(/outside the form range/i);
  });
});

describe('CPU verifier matches the professor C core', () => {
  it('uses func(top, below) for non-commutative binary operators', () => {
    expect(evaluateCoreRPN(['TWO', 'THREE', 'SUBTRACT'])).toBe(1);
    expect(evaluateCoreRPN(['TWO', 'THREE', 'DIVIDE'])).toBe(1.5);
    expect(evaluateCoreRPN(['TWO', 'THREE', 'POWER'])).toBe(9);
  });

  it('allows a later operation to recover from a non-finite intermediate', () => {
    // exp(9^4) overflows in JS double, then INV turns +Infinity into 0.
    expect(evaluateCoreRPN(['NINE', 'SQR', 'SQR', 'EXP', 'INV'])).toBe(0);
  });

  it('implements Gamma instead of treating it as the identity function', () => {
    expect(gamma(5)).toBeCloseTo(24, 12);
    expect(evaluateCoreRPN(['FIVE', 'GAMMA'])).toBeCloseTo(24, 12);
  });
});

describe('identification criteria', () => {
  it('computes CR from the active calculator size', () => {
    const cr36 = getCompressionRatio(1e-12, 6, 36);
    const cr10 = getCompressionRatio(1e-12, 6, 10);
    expect(cr10).toBeGreaterThan(cr36);
  });

  it('requires both measurement agreement and CR for tolerance acceptance', () => {
    expect(isAcceptedCandidate({
      relativeError: 1e-6,
      absoluteError: 1e-8,
      compressionRatio: 0.8,
      exactRelativeTolerance: 16 * Number.EPSILON,
      absoluteTolerance: 1e-8,
      compressionRatioThreshold: 0.9,
    })).toBe(false);

    expect(isAcceptedCandidate({
      relativeError: 1e-6,
      absoluteError: 1e-8,
      compressionRatio: 1.1,
      exactRelativeTolerance: 16 * Number.EPSILON,
      absoluteTolerance: 1e-8,
      compressionRatioThreshold: 0.9,
    })).toBe(true);
  });
});

describe('calculator selection', () => {
  it('preserves canonical opcode numbers while allowing subsets', () => {
    const calculator = compileCalculator({
      consts: ['TWO', 'PI', 'TWO'],
      funcs: ['GAMMA', 'LOG'],
      ops: ['POWER', 'SUBTRACT'],
    });

    expect([...calculator.constCodes]).toEqual([
      CALC4_CONSTANTS.indexOf('TWO'),
      CALC4_CONSTANTS.indexOf('PI'),
    ]);
    expect([...calculator.unaryCodes]).toEqual([
      CALC4_UNARY.indexOf('GAMMA'),
      CALC4_UNARY.indexOf('LOG'),
    ]);
    expect([...calculator.binaryCodes]).toEqual([
      CALC4_BINARY.indexOf('POWER'),
      CALC4_BINARY.indexOf('SUBTRACT'),
    ]);
  });
});

describe('WGSL regression guards', () => {
  const shader = readFileSync(
    new URL('../public/wasm/constant-recognition-v2.wgsl', import.meta.url),
    'utf8',
  );

  it('contains a real Gamma screening implementation', () => {
    expect(shader).toContain('fn gamma_lanczos');
    expect(shader).toContain('case 3u: { return gamma_lanczos(x); }');
    expect(shader).not.toMatch(/case\s+3u:\s*\{\s*return\s+x;\s*\}/);
  });

  it('matches the C-core operand order', () => {
    expect(shader).toContain('case 2u: { return top - below; }');
    expect(shader).toContain('case 3u: { return top / below; }');
    expect(shader).toContain('case 4u: { return pow(top, below); }');
  });

  it('reports candidate-buffer overflow instead of silently truncating', () => {
    expect(shader).toContain('atomicStore(&state.overflow, 1u)');
  });
});

describe('WebGPU readiness self-test', () => {
  it('requires proof of dispatch, readback and the expected PI result', () => {
    expect(assertGPUSelfTestEvidence({
      uniqueEvaluations: BigInt(1),
      dispatchedEvaluations: BigInt(1),
      results: [{
        rpn: 'PI',
        accepted: true,
        value: Math.PI,
        gpuValue: Math.fround(Math.PI),
        gpuRelativeError: 0,
      }],
    })).toBe(Math.PI);

    expect(() => assertGPUSelfTestEvidence({
      uniqueEvaluations: BigInt(1),
      dispatchedEvaluations: BigInt(0),
      results: [{
        rpn: 'PI',
        accepted: true,
        value: Math.PI,
        gpuValue: Math.fround(Math.PI),
        gpuRelativeError: 0,
      }],
    })).toThrow(/unexpected readback/i);

    expect(() => assertGPUSelfTestEvidence({
      uniqueEvaluations: BigInt(1),
      dispatchedEvaluations: BigInt(1),
      results: [],
    })).toThrow(/cpu=missing/i);

    expect(() => assertGPUSelfTestEvidence({
      uniqueEvaluations: BigInt(1),
      dispatchedEvaluations: BigInt(1),
      results: [{
        rpn: 'PI',
        accepted: true,
        value: Math.PI,
        gpuValue: 0,
        gpuRelativeError: 1,
      }],
    })).toThrow(/gpu=0/i);
  });
});
