import { describe, expect, it } from 'vitest';
import {
  parseRPN,
  rpnToInfix,
  rpnToLatex,
  rpnToMathematica,
} from '../app/calculator/lib/rpn';

describe('RPN display formats', () => {
  it('treats a standalone x as the function variable, not compact subtraction', () => {
    expect(parseRPN('x')).toEqual(['x']);
    expect(rpnToInfix('x')).toBe('x');
    expect(rpnToLatex('x')).toBe('x');
    expect(rpnToMathematica('x')).toBe('x');
  });

  it('still recognizes a complete compact GPU subtraction expression', () => {
    expect(parseRPN('00x')).toEqual(['PI', 'PI', 'SUBTRACT']);
    expect(rpnToLatex('00x')).toBe('\\pi - \\pi');
    expect(rpnToMathematica('00x')).toBe('(Pi - Pi)');
  });

  it('parenthesizes a composite exponent in Mathematica output', () => {
    const rpn = 'x, COS, INV, x, POWER';
    expect(rpnToMathematica(rpn)).toBe('(x)^(1/(Cos[x]))');
  });

  it('renders the two-variable Pythagorean formula without placeholder tokens', () => {
    const rpn = 'C1, SQR, C2, SQR, PLUS, SQRT';
    expect(rpnToLatex(rpn)).toBe('\\sqrt{(C_{1})^2 + (C_{2})^2}');
    expect(rpnToMathematica(rpn)).toBe('Sqrt[((C1)^2 + (C2)^2)]');
  });
});
