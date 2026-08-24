import type { BatchTarget, FunctionPoint } from './types';

export const DEFAULT_FUNCTION_DATASET = [
  '0, 0',
  '1, 1',
  '2, 4',
  '3, 9',
].join('\n');

export const DEFAULT_MULTIPLE_DATASET = [
  '3.141592653589793',
  '2.718281828459045',
  '1.618033988749895',
].join('\n');

export interface MultipleDatasetParseResult {
  readonly targets: BatchTarget[];
  readonly error: string | null;
}

export interface FunctionDatasetParseResult {
  readonly points: FunctionPoint[];
  readonly error: string | null;
}

/** Parse one target per line: value[, absolute uncertainty]. */
export function parseMultipleConstantsDataset(source: string): MultipleDatasetParseResult {
  const targets: BatchTarget[] = [];
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index].trim();
    if (!raw || raw.startsWith('#')) continue;
    const columns = raw.split(/[\s,;]+/).filter(Boolean);
    if (columns.length < 1 || columns.length > 2) {
      return { targets: [], error: `Line ${index + 1}: expected value[, dz].` };
    }

    const [value, dy = 0] = columns.map(Number);
    if (![value, dy].every(Number.isFinite) || dy < 0) {
      return {
        targets: [],
        error: `Line ${index + 1}: value and dz must be finite, and dz must be non-negative.`,
      };
    }
    targets.push({ id: targets.length + 1, value, dy });
  }

  if (targets.length < 2) {
    return { targets: [], error: 'Multiple-constant recognition requires at least two targets.' };
  }
  return { targets, error: null };
}

/** Parse one scientific data point per line: x, y[, dy]. */
export function parseFunctionDataset(source: string): FunctionDatasetParseResult {
  const points: FunctionPoint[] = [];
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index].trim();
    if (!raw || raw.startsWith('#')) continue;
    const columns = raw.split(/[\s,;]+/).filter(Boolean);
    if (columns.length < 2 || columns.length > 3) {
      return { points: [], error: `Line ${index + 1}: expected x, y[, dy].` };
    }

    const [x, y, dy = 0] = columns.map(Number);
    if (![x, y, dy].every(Number.isFinite) || dy < 0) {
      return { points: [], error: `Line ${index + 1}: values must be finite and dy must be non-negative.` };
    }
    points.push({ x, y, dy });
  }

  if (points.length < 2) {
    return { points: [], error: 'Function recognition requires at least two data points.' };
  }
  return { points, error: null };
}

/** Match the CPU function metric: optional dy scales the residual before MSE. */
export function functionMeanSquaredError(
  values: readonly number[],
  points: readonly FunctionPoint[],
): number {
  if (values.length !== points.length || points.length === 0) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let index = 0; index < points.length; index++) {
    const value = values[index];
    if (!Number.isFinite(value)) {
      total += 1e10;
      continue;
    }
    const scale = points[index].dy > 0 ? points[index].dy : 1;
    const residual = (value - points[index].y) / scale;
    total += residual * residual;
  }
  return total / points.length;
}
