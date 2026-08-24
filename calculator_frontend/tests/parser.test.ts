import { describe, expect, it } from 'vitest';
import {
  parseFunctionDataset,
  parseMultipleConstantsDataset,
  parseMultivariateDataset,
} from '../app/calculator/lib/search-contract';

describe('scientific input contracts', () => {
  describe('function recognition', () => {
    it('parses x, y and optional dy from one observation per line', () => {
      expect(parseFunctionDataset('1, 1\n2 4 0.1\n3;9').points).toEqual([
        { x: 1, y: 1, dy: 0 },
        { x: 2, y: 4, dy: 0.1 },
        { x: 3, y: 9, dy: 0 },
      ]);
    });

    it('rejects malformed rows instead of silently dropping scientific data', () => {
      expect(parseFunctionDataset('1,1\ninvalid\n3,9').error).toMatch(/line 2/i);
      expect(parseFunctionDataset('1,1\n2,4,-0.1').error).toMatch(/non-negative/i);
    });
  });

  describe('two-variable function recognition', () => {
    it('parses C1, C2, y and optional dy', () => {
      expect(parseMultivariateDataset('3,4,5\n5 12 13 0.1\n8;15;17').points).toEqual([
        { c1: 3, c2: 4, y: 5, dy: 0 },
        { c1: 5, c2: 12, y: 13, dy: 0.1 },
        { c1: 8, c2: 15, y: 17, dy: 0 },
      ]);
    });

    it('requires three distinct finite input pairs', () => {
      expect(parseMultivariateDataset('3,4,5\n5,12,13').error).toMatch(/at least three/i);
      expect(parseMultivariateDataset('3,4,5\n3,4,5\n8,15,17').error).toMatch(/duplicate/i);
      expect(parseMultivariateDataset('3,4,5\n5,12,13,-1\n8,15,17').error).toMatch(/non-negative/i);
    });
  });

  describe('multiple-constant recognition', () => {
    it('assigns stable row IDs and parses optional absolute uncertainty', () => {
      expect(parseMultipleConstantsDataset('3.14159\n2.71828, 1e-8\n1.61803').targets).toEqual([
        { id: 1, value: 3.14159, dy: 0 },
        { id: 2, value: 2.71828, dy: 1e-8 },
        { id: 3, value: 1.61803, dy: 0 },
      ]);
    });

    it('accepts comments but requires at least two finite targets', () => {
      expect(parseMultipleConstantsDataset('# reference set\n3.14159\n2.71828').error).toBeNull();
      expect(parseMultipleConstantsDataset('3.14159').error).toMatch(/at least two/i);
      expect(parseMultipleConstantsDataset('3.14159\nnot-a-number').error).toMatch(/line 2/i);
      expect(parseMultipleConstantsDataset('3.14159\n2.71828, -1').error).toMatch(/non-negative/i);
    });
  });
});
