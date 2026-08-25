import { describe, expect, it } from 'vitest';
import {
  GPU_PROGRAM_BUDGET,
  buildSearchComplexityPlan,
  countRpnProgramsByK,
  deepestCompleteK,
} from '../app/calculator/lib/search-complexity';
import { structureWeight } from '../app/calculator/lib/taskQueue';

describe('scientific K and search-space accounting', () => {
  it('counts the full CALC4 RPN program space exactly', () => {
    const counts = countRpnProgramsByK(7, { terminals: 13, unary: 18, binary: 5 });
    expect(counts).toEqual([
      BigInt(13),
      BigInt(234),
      BigInt(5_057),
      BigInt(121_446),
      BigInt(3_117_218),
      BigInt(83_731_284),
      BigInt(2_324_451_337),
    ]);
  });

  it('matches the independent ternary-structure enumerator at every UI level', () => {
    const counts = countRpnProgramsByK(9, { terminals: 13, unary: 18, binary: 5 });
    for (let K = 1; K <= 9; K++) {
      let enumerated = BigInt(0);
      for (let structure = 0; structure < Math.pow(3, K); structure++) {
        enumerated += BigInt(structureWeight(structure, K));
      }
      expect(counts[K - 1], `K=${K}`).toBe(enumerated);
    }
  });

  it('adapts workload to terminals, functions and operators without changing K', () => {
    const small = buildSearchComplexityPlan(7, { terminals: 2, unary: 1, binary: 1 });
    const full = buildSearchComplexityPlan(7, { terminals: 13, unary: 18, binary: 5 });
    expect(small.selected.K).toBe(7);
    expect(full.selected.K).toBe(7);
    expect(small.selected.programs).toBe(BigInt(382));
    expect(full.selected.programs).toBe(BigInt(2_324_451_337));
    expect(small.descriptionBits).toBeCloseTo(14);
    expect(full.descriptionBits).toBeCloseTo(7 * Math.log2(36));
  });

  it('separates data size from the number of candidate programs', () => {
    const onePoint = buildSearchComplexityPlan(5, { terminals: 3, unary: 2, binary: 1 }, 1);
    const sixPoints = buildSearchComplexityPlan(5, { terminals: 3, unary: 2, binary: 1 }, 6);
    expect(sixPoints.selected.cumulativePrograms).toBe(onePoint.selected.cumulativePrograms);
    expect(sixPoints.selected.scalarEvaluations).toBe(
      onePoint.selected.scalarEvaluations * BigInt(6),
    );
  });

  it('reports the deepest exhaustive level for a separate compute budget', () => {
    const counts = countRpnProgramsByK(9, { terminals: 13, unary: 18, binary: 5 });
    expect(deepestCompleteK(counts, GPU_PROGRAM_BUDGET)).toBe(6);
    expect(deepestCompleteK(counts, BigInt(12))).toBe(0);
  });

  it('removes unreachable structures when an instruction arity is unavailable', () => {
    expect(countRpnProgramsByK(4, { terminals: 2, unary: 0, binary: 0 })).toEqual([
      BigInt(2), BigInt(0), BigInt(0), BigInt(0),
    ]);
    expect(countRpnProgramsByK(4, { terminals: 0, unary: 10, binary: 10 })).toEqual([
      BigInt(0), BigInt(0), BigInt(0), BigInt(0),
    ]);
  });
});
