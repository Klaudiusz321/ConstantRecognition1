import type { Domain, RecognitionTarget } from '../types';
import { ComplexValue, formatComplexValue, parseSearchInput } from '../input';
import type { ComplexNumber } from '../webgpu';

export interface RecognitionPoint {
  x: ComplexValue;
  y: ComplexValue;
  label: string;
}

export interface ParsedRecognitionInput {
  primaryInput: string;
  primaryValue: ComplexValue;
  targetMagnitude: number;
  precisionLabel: string;
  constantTargets: ComplexValue[];
  functionPoints: RecognitionPoint[];
}

const splitValues = (input: string) =>
  input
    .split(/[,;\n]/)
    .map((value) => value.trim())
    .filter(Boolean);

const splitFunctionPairs = (input: string) =>
  input
    .split(/[\n;]/)
    .map((pair) => pair.trim())
    .filter(Boolean);

const parseValue = (raw: string, domain: Domain): ComplexValue => {
  const parsed = parseSearchInput(raw);
  if (domain === 'real' && Math.abs(parsed.imag) > 1e-12) {
    throw new Error('This target has an imaginary part. Switch Domain to Complex.');
  }
  return { real: parsed.real, imag: parsed.imag };
};

const magnitudeOf = (value: ComplexValue) => Math.hypot(value.real, value.imag);

const maxMagnitude = (values: ComplexValue[]) =>
  Math.max(1, ...values.map((value) => magnitudeOf(value)));

export const toGpuValue = (value: ComplexValue, domain: Domain): number | ComplexNumber =>
  domain === 'complex' ? { real: value.real, imag: value.imag } : value.real;

export function parseRecognitionInput(
  inputValue: string,
  recognitionTarget: RecognitionTarget,
  domain: Domain,
): ParsedRecognitionInput {
  const trimmed = inputValue.trim();
  if (!trimmed) throw new Error('Input is empty.');

  if (recognitionTarget === 'constant') {
    const value = parseValue(trimmed, domain);
    return {
      primaryInput: trimmed,
      primaryValue: value,
      targetMagnitude: Math.max(magnitudeOf(value), 1),
      precisionLabel: formatComplexValue(value),
      constantTargets: [value],
      functionPoints: [],
    };
  }

  if (recognitionTarget === 'multiple') {
    const constantTargets = splitValues(trimmed).map((value) => parseValue(value, domain));
    if (constantTargets.length === 0) throw new Error('Enter at least one constant.');

    return {
      primaryInput: splitValues(trimmed)[0] ?? trimmed,
      primaryValue: constantTargets[0],
      targetMagnitude: maxMagnitude(constantTargets),
      precisionLabel: constantTargets.map((value) => formatComplexValue(value)).join(', '),
      constantTargets,
      functionPoints: [],
    };
  }

  if (recognitionTarget === 'sequence') {
    const values = splitValues(trimmed).map((value) => parseValue(value, domain));
    if (values.length < 2) throw new Error('Enter at least two sequence values.');

    const functionPoints = values.map((value, index) => ({
      x: { real: index + 1, imag: 0 },
      y: value,
      label: `n=${index + 1}`,
    }));

    return {
      primaryInput: splitValues(trimmed)[0] ?? trimmed,
      primaryValue: values[0],
      targetMagnitude: maxMagnitude(values),
      precisionLabel: values.map((value) => formatComplexValue(value)).join(', '),
      constantTargets: [],
      functionPoints,
    };
  }

  const functionPoints = splitFunctionPairs(trimmed).map((pair) => {
    const separator = pair.includes(':') ? ':' : ',';
    const [xRaw, yRaw] = pair.split(separator);
    if (!xRaw || !yRaw) throw new Error(`Could not parse pair "${pair}".`);
    return {
      x: parseValue(xRaw, domain),
      y: parseValue(yRaw, domain),
      label: xRaw.trim(),
    };
  });

  if (functionPoints.length < 2) throw new Error('Enter at least two x:y samples.');

  return {
    primaryInput: splitFunctionPairs(trimmed)[0]?.split(/[:,]/)[1]?.trim() ?? trimmed,
    primaryValue: functionPoints[0].y,
    targetMagnitude: maxMagnitude(functionPoints.map((point) => point.y)),
    precisionLabel: trimmed,
    constantTargets: [],
    functionPoints,
  };
}
