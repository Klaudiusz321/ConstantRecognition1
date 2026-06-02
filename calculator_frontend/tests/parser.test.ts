import { describe, it, expect } from 'vitest';
import {
  extractInputPrecision,
  parseComplexLiteral,
  parseFunctionInput,
  parseMultipleConstants,
  parseSearchInput,
  resolveInputUncertainty,
} from '../app/calculator/lib/input';
import { evaluateRPNComplex, evaluateRPNDisplay } from '../app/calculator/lib/rpn';
import { evaluateShortRPNComplex, indexToRPN } from '../app/calculator/lib/webgpu';

describe('Frontend Input Parsing Logic', () => {
  describe('parseFunctionInput (MODE_FUNCTION)', () => {
    it('parses semi-colon separated pairs', () => {
      const input = '1:1; 2:4; 3:9';
      const { x_arr, y_arr } = parseFunctionInput(input);
      expect(x_arr).toEqual([1, 2, 3]);
      expect(y_arr).toEqual([1, 4, 9]);
    });

    it('parses newline separated comma pairs', () => {
      const input = `
        1,1
        2,4
        3,9
      `;
      const { x_arr, y_arr } = parseFunctionInput(input);
      expect(x_arr).toEqual([1, 2, 3]);
      expect(y_arr).toEqual([1, 4, 9]);
    });

    it('ignores invalid pairs', () => {
      const input = '1:1; invalid; 3:9';
      const { x_arr, y_arr } = parseFunctionInput(input);
      expect(x_arr).toEqual([1, 3]);
      expect(y_arr).toEqual([1, 9]);
    });
  });

  describe('parseMultipleConstants (MODE_BATCH)', () => {
    it('parses comma-separated constants', () => {
      const input = '3.14159, 2.71828, 1.61803';
      const vals = parseMultipleConstants(input);
      expect(vals).toEqual([3.14159, 2.71828, 1.61803]);
    });

    it('parses symbolic constants', () => {
      const vals = parseMultipleConstants('Pi; e; phi');
      expect(vals[0]).toBeCloseTo(Math.PI, 15);
      expect(vals[1]).toBeCloseTo(Math.E, 15);
      expect(vals[2]).toBeCloseTo((1 + Math.sqrt(5)) / 2, 15);
    });

    it('ignores NaN values', () => {
      const input = '3.14159, abc, 2.71828';
      const vals = parseMultipleConstants(input);
      expect(vals).toEqual([3.14159, 2.71828]);
    });
  });

  describe('Complex Parsing Logic', () => {
    it('parses real numbers', () => {
      expect(parseComplexLiteral('3.14')).toEqual({ real: 3.14, imag: 0 });
      expect(parseComplexLiteral('-2.5')).toEqual({ real: -2.5, imag: 0 });
    });

    it('parses pure imaginary numbers', () => {
      expect(parseComplexLiteral('3i')).toEqual({ real: 0, imag: 3 });
      expect(parseComplexLiteral('-2.5i')).toEqual({ real: 0, imag: -2.5 });
    });

    it('parses complex numbers with scientific notation', () => {
      expect(parseComplexLiteral('3.14+2i')).toEqual({ real: 3.14, imag: 2 });
      expect(parseComplexLiteral('-2.5-1.5i')).toEqual({ real: -2.5, imag: -1.5 });
      expect(parseComplexLiteral('1e-3+2e-4i')).toEqual({ real: 0.001, imag: 0.0002 });
    });

    it('evaluates symbolic i^i on the principal branch', () => {
      const parsed = parseSearchInput('i^i');
      expect(parsed.real).toBeCloseTo(Math.exp(-Math.PI / 2), 15);
      expect(parsed.imag).toBeCloseTo(0, 15);
      expect(parsed.isComplex).toBe(true);
    });

    it('parses a negative pure-imaginary decimal target', () => {
      const parsed = parseSearchInput('-0.86602540378443864676372317075294i');
      expect(parsed.real).toBe(0);
      expect(parsed.imag).toBeCloseTo(-Math.sqrt(3) / 2, 15);
      expect(parsed.isComplex).toBe(true);
    });
  });

  describe('Precision modes', () => {
    it('extracts precision from scientific notation', () => {
      const precision = extractInputPrecision('1e-6');
      expect(precision.deltaZ).toBe('5.00e-7');
    });

    it('uses a broad tolerance for large-error mode', () => {
      const uncertainty = resolveInputUncertainty('100', 'large_errors', '', 100);
      expect(uncertainty).toBe(5);
    });

    it('treats symbolic exact inputs as zero automatic display uncertainty', () => {
      const precision = extractInputPrecision('Pi');
      expect(precision.deltaZ).toBe('0');
      expect(precision.relDeltaZ).toBe('0');
    });

    it('extracts precision from pure imaginary decimal targets', () => {
      const precision = extractInputPrecision('0.86602540378443864676372317075294i');
      expect(precision.deltaZ).toBe('5.00e-33');
      expect(Number(precision.relDeltaZ)).toBeGreaterThan(0);
    });
  });

  describe('Complex RPN display', () => {
    it('evaluates I I POWER as i^i', () => {
      const result = evaluateRPNComplex('I, I, POWER');
      expect(result.real).toBeCloseTo(Math.exp(-Math.PI / 2), 15);
      expect(result.imag).toBeCloseTo(0, 15);
      expect(evaluateRPNDisplay('I, I, POWER', 'complex')).toBe('0.2078795763507619');
    });

    it('keeps the negative branch for tan(arccos(2))', () => {
      const result = evaluateRPNComplex('TWO, ARCCOS, TAN');
      expect(result.real).toBeCloseTo(0, 15);
      expect(result.imag).toBeCloseTo(-Math.sqrt(3) / 2, 15);
      expect(evaluateRPNDisplay('TWO, ARCCOS, TAN', 'complex')).toMatch(/^-0\.866025403784438[56]i$/);
    });

    it('keeps the positive branch for sinh(arccosh(1/2))', () => {
      const result = evaluateRPNComplex('TWO, INV, ARCCOSH, SINH');
      expect(result.real).toBeCloseTo(0, 15);
      expect(result.imag).toBeCloseTo(Math.sqrt(3) / 2, 15);
      expect(evaluateRPNDisplay('TWO, INV, ARCCOSH, SINH', 'complex')).toMatch(/^0\.866025403784438[56]i$/);
    });
  });

  describe('Complex WebGPU short RPN helpers', () => {
    it('maps complex constant slots with I as the 37th CALC4 button', () => {
      expect(indexToRPN(4, [0], [14], 1, 'complex')).toBe('I');
      const result = evaluateShortRPNComplex('IIz');
      expect(result.real).toBeCloseTo(Math.exp(-Math.PI / 2), 15);
      expect(result.imag).toBeCloseTo(0, 15);
      expect(evaluateRPNDisplay('IIz', 'complex')).toBe('0.2078795763507619');
    });

    it('evaluates a short-RPN formula for -sqrt(3)/2 i', () => {
      const result = evaluateShortRPNComplex('qapyI277');
      expect(result.real).toBeCloseTo(0, 15);
      expect(result.imag).toBeCloseTo(-Math.sqrt(3) / 2, 15);
    });

    it('keeps the negative arccos branch in short RPN', () => {
      const result = evaluateShortRPNComplex('pfg');
      expect(result.real).toBeCloseTo(0, 15);
      expect(result.imag).toBeCloseTo(-Math.sqrt(3) / 2, 15);
    });
  });
});
