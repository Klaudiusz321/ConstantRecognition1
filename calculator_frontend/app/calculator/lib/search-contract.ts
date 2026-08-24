import type { FunctionPoint } from './types';

export const DEFAULT_FUNCTION_DATASET = [
  '0, 0',
  '1, 1',
  '2, 4',
  '3, 9',
].join('\n');

export interface FunctionDatasetParseResult {
  readonly points: FunctionPoint[];
  readonly error: string | null;
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
