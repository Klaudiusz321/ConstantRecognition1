import { describe, expect, it } from 'vitest';
import { hasBlockingDatasetError } from '../app/calculator/components/InputBar';

describe('InputBar mode validation', () => {
  it('ignores errors belonging to hidden recognition modes', () => {
    expect(hasBlockingDatasetError('constant', 'invalid function data', 'invalid batch data')).toBe(false);
    expect(hasBlockingDatasetError('function', null, 'invalid batch data')).toBe(false);
    expect(hasBlockingDatasetError('multiple', 'invalid function data', null)).toBe(false);
    expect(hasBlockingDatasetError('multivariate', null, null, null)).toBe(false);
  });

  it('blocks submission only for the active dataset mode', () => {
    expect(hasBlockingDatasetError('function', 'invalid function data', null)).toBe(true);
    expect(hasBlockingDatasetError('multiple', null, 'invalid batch data')).toBe(true);
    expect(hasBlockingDatasetError('multivariate', null, null, 'invalid two-variable data')).toBe(true);
  });
});
