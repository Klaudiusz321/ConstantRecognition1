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
import {
  assertGPUOverflowRecoveryEvidence,
  assertGPUSelfTestEvidence,
  estimateGPUResourceFootprint,
} from '../app/calculator/lib/webgpu-v2/webgpu-engine';
import {
  FormTokenKind,
  MAX_GROUP_BEST_TO_VERIFY,
} from '../app/calculator/lib/webgpu-v2/types';
import {
  functionMeanSquaredError,
  multivariateMeanSquaredError,
  parseFunctionDataset,
  parseMultivariateDataset,
} from '../app/calculator/lib/search-contract';

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

  it('keeps every unary calculator opcode in the real domain for its reference case', () => {
    const references = [
      ['TWO', 'LOG'], ['TWO', 'EXP'], ['TWO', 'INV'], ['FIVE', 'GAMMA'],
      ['FOUR', 'SQRT'], ['THREE', 'SQR'], ['ONE', 'SIN'], ['ONE', 'ARCSIN'],
      ['ONE', 'COS'], ['ONE', 'ARCCOS'], ['ONE', 'TAN'], ['ONE', 'ARCTAN'],
      ['ONE', 'SINH'], ['ONE', 'ARCSINH'], ['ONE', 'COSH'], ['TWO', 'ARCCOSH'],
      ['ONE', 'TANH'], ['TWO', 'INV', 'ARCTANH'],
    ] as const;
    expect(references).toHaveLength(CALC4_UNARY.length);
    for (const tokens of references) {
      expect(Number.isFinite(evaluateCoreRPN(tokens))).toBe(true);
    }
  });

  it('evaluates the variable x with the same RPN operand order', () => {
    expect(evaluateCoreRPN(['x'], 3)).toBe(3);
    expect(evaluateCoreRPN(['TWO', 'x', 'POWER'], 3)).toBe(9);
    expect(evaluateCoreRPN(['TWO', 'x', 'SUBTRACT'], 3)).toBe(1);
  });

  it('evaluates C1 and C2 as independent terminals', () => {
    const tokens = ['C1', 'SQR', 'C2', 'SQR', 'PLUS', 'SQRT'] as const;
    expect(evaluateCoreRPN(tokens, { C1: 3, C2: 4 })).toBe(5);
    expect(evaluateCoreRPN(tokens, { C1: 5, C2: 12 })).toBe(13);
  });
});

describe('scientific two-variable search contract', () => {
  it('parses rows and computes dy-weighted MSE', () => {
    const points = parseMultivariateDataset('3,4,5\n5,12,13,0.1\n8,15,17').points;
    expect(points).toHaveLength(3);
    expect(multivariateMeanSquaredError([5, 13.1, 17], points)).toBeCloseTo(1 / 3, 12);
  });
});

describe('scientific function-search contract', () => {
  it('parses x, y and optional dy rows', () => {
    expect(parseFunctionDataset('0, 0\n1 1 0.1\n2;4').points).toEqual([
      { x: 0, y: 0, dy: 0 },
      { x: 1, y: 1, dy: 0.1 },
      { x: 2, y: 4, dy: 0 },
    ]);
  });

  it('rejects invalid uncertainty and computes dy-weighted MSE', () => {
    expect(parseFunctionDataset('0,0\n1,1,-0.1').error).toMatch(/non-negative/i);
    expect(functionMeanSquaredError(
      [0, 1.1],
      [{ x: 0, y: 0, dy: 0 }, { x: 1, y: 1, dy: 0.1 }],
    )).toBeCloseTo(0.5, 12);
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

  it('adds x as a terminal without changing constant opcodes', () => {
    const calculator = compileCalculator({
      consts: ['PI'],
      funcs: [],
      ops: ['TIMES'],
      variables: ['x'],
    });

    expect(calculator.variableNames).toEqual(['x']);
    expect(calculator.constCodes.length + calculator.variableNames.length).toBe(2);
    expect([...calculator.constCodes]).toEqual([CALC4_CONSTANTS.indexOf('PI')]);
  });

  it('adds C1 and C2 as two distinct terminals', () => {
    const calculator = compileCalculator({
      consts: [],
      funcs: ['SQR', 'SQRT'],
      ops: ['PLUS'],
      variables: ['C1', 'C2'],
    });
    expect(calculator.variableNames).toEqual(['C1', 'C2']);
    expect(calculator.constCodes.length + calculator.variableNames.length).toBe(2);
  });
});

describe('WGSL regression guards', () => {
  const shader = readFileSync(
    new URL('../public/wasm/constant-recognition-v2.wgsl', import.meta.url),
    'utf8',
  );
  const engine = readFileSync(
    new URL('../app/calculator/lib/webgpu-v2/webgpu-engine.ts', import.meta.url),
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

  it('screens function candidates across all data points and requires all variables', () => {
    expect(shader).toContain('contains_all_variables');
    expect(shader).toContain('variable_count == 1u || found.y == 1u');
    expect(shader).toContain('point.xy');
    expect(shader).toContain('params.search.y');
    expect(shader).toContain('total_error / f32(max(params.search.y, 1u))');
  });

  it('reduces workgroup winners on the GPU before the CPU readback', () => {
    expect(MAX_GROUP_BEST_TO_VERIFY).toBe(64);
    expect(shader).toContain('@compute @workgroup_size(1)');
    expect(shader).toContain('fn reduce_group_best()');
    expect(shader).toContain('reduced_best.values[rank] = best[rank]');
    expect(engine).toContain("entryPoint: 'reduce_group_best'");
    expect(engine).toContain('bestCount * RESULT_BYTES');
    expect(engine).not.toContain('workgroupCount * RESULT_BYTES)\n          .mapAsync');
  });

  it('uploads function data only when the persistent buffer has stale contents', () => {
    expect(engine).toContain('resources.dataUploadId !== context.dataUploadId');
    expect(engine.match(/writeBuffer\(resources\.dataPoints/g)).toHaveLength(1);
  });
});

describe('GPU memory accounting', () => {
  it('accounts separately for storage and CPU-readable staging buffers', () => {
    const footprint = estimateGPUResourceFootprint(8, 4, 3, 2);
    expect(footprint).toEqual({
      storageBytes: 928,
      readbackBytes: 176,
      allocatedBytes: 1_104,
    });
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

  it('requires every candidate to survive a forced buffer overflow and rerun', () => {
    const completeEvidence = {
      uniqueEvaluations: BigInt(13),
      dispatchedEvaluations: BigInt(63),
      overflowRetries: 12,
      results: Array.from({ length: 13 }, (_, index) => ({
        combinationIndex: BigInt(index),
      })),
    };
    expect(() => assertGPUOverflowRecoveryEvidence(completeEvidence)).not.toThrow();

    expect(() => assertGPUOverflowRecoveryEvidence({
      ...completeEvidence,
      results: completeEvidence.results.slice(0, 12),
    })).toThrow(/recovered=12\/13/i);

    expect(() => assertGPUOverflowRecoveryEvidence({
      ...completeEvidence,
      dispatchedEvaluations: BigInt(13),
      overflowRetries: 0,
    })).toThrow(/overflow recovery failed/i);
  });
});
