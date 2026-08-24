import type { BatchTarget, FunctionPoint, MultivariatePoint } from './types';

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

/** Exact Pythagorean samples for F(C1,C2)=sqrt(C1^2+C2^2). */
export const DEFAULT_MULTIVARIATE_DATASET = [
  '3, 4, 5',
  '5, 12, 13',
  '8, 15, 17',
  '7, 24, 25',
  '9, 40, 41',
  '20, 21, 29',
].join('\n');

export interface MultipleDatasetParseResult {
  readonly targets: BatchTarget[];
  readonly error: string | null;
}

export interface FunctionDatasetParseResult {
  readonly points: FunctionPoint[];
  readonly error: string | null;
}

export interface MultivariateDatasetParseResult {
  readonly points: MultivariatePoint[];
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

/** Parse one scientific data row per line: C1, C2, y[, dy]. */
export function parseMultivariateDataset(source: string): MultivariateDatasetParseResult {
  const points: MultivariatePoint[] = [];
  const seenInputs = new Set<string>();
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index].trim();
    if (!raw || raw.startsWith('#')) continue;
    const columns = raw.split(/[\s,;]+/).filter(Boolean);
    if (columns.length < 3 || columns.length > 4) {
      return { points: [], error: `Line ${index + 1}: expected C1, C2, y[, dy].` };
    }

    const [c1, c2, y, dy = 0] = columns.map(Number);
    if (![c1, c2, y, dy].every(Number.isFinite) || dy < 0) {
      return { points: [], error: `Line ${index + 1}: values must be finite and dy must be non-negative.` };
    }
    const key = `${Object.is(c1, -0) ? 0 : c1}|${Object.is(c2, -0) ? 0 : c2}`;
    if (seenInputs.has(key)) {
      return { points: [], error: `Line ${index + 1}: duplicate (C1, C2) input pair.` };
    }
    seenInputs.add(key);
    points.push({ c1, c2, y, dy });
  }

  if (points.length < 3) {
    return { points: [], error: 'Two-variable recognition requires at least three distinct data points.' };
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

/** Match the CPU/GPU multivariate metric: optional dy scales each residual. */
export function multivariateMeanSquaredError(
  values: readonly number[],
  points: readonly MultivariatePoint[],
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
