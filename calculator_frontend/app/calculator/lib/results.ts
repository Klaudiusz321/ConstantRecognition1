import type { Domain, RecognitionTarget, SearchResult } from './types';
import { formatComplexValue } from './input';
import { evaluateRPNDisplay } from './rpn';

export interface WorkerResultPayload {
  K?: number | string;
  RPN?: string;
  REL_ERR?: number | string;
  result?: string;
  status?: string;
  cpuId?: number;
  COMPRESSION_RATIO?: number | string;
  computed?: number | string;
  computed_real?: number | string;
  computed_imag?: number | string;
  target_id?: number;
  target?: number | string;
  target_imag?: number | string;
  target_label?: string;
  targetLabel?: string;
  targetIndex?: number;
  candidates?: WorkerResultPayload[];
  results?: WorkerResultPayload[];
  error?: string;
}

const asFiniteNumber = (value: unknown) => {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

export const getResultTargetLabel = (result: WorkerResultPayload) => {
  if (result.target_label) return result.target_label;
  if (result.targetLabel) return result.targetLabel;

  const target = asFiniteNumber(result.target);
  if (target !== null) {
    const targetImag = asFiniteNumber(result.target_imag);
    if (targetImag !== null && Math.abs(targetImag) > 1e-15) {
      return formatComplexValue({ real: target, imag: targetImag });
    }
    return target.toPrecision(12);
  }

  if (typeof result.targetIndex === 'number') return `#${result.targetIndex + 1}`;
  if (typeof result.target_id === 'number') return `#${result.target_id + 1}`;
  return undefined;
};

export const getDisplayValue = (
  result: WorkerResultPayload,
  recognitionTarget: RecognitionTarget,
  domain: Domain,
) => {
  const relErr = asFiniteNumber(result.REL_ERR);
  if ((recognitionTarget === 'function' || recognitionTarget === 'sequence') && relErr !== null) {
    return `MSE ${relErr.toExponential(2)}`;
  }

  if (domain === 'complex') {
    const real = asFiniteNumber(result.computed_real);
    const imag = asFiniteNumber(result.computed_imag);
    if (real !== null && imag !== null) {
      return formatComplexValue({ real, imag });
    }
  } else {
    const computed = asFiniteNumber(result.computed);
    if (computed !== null) return computed.toString();
  }

  return result.RPN ? evaluateRPNDisplay(result.RPN, domain) : 'N/A';
};

const normalizeStatus = (result: WorkerResultPayload, fallback = 'K_BEST') => {
  if (result.result === 'INTERMEDIATE') return 'SEARCHING';
  return result.result || result.status || fallback;
};

const isTransientMultipleResult = (result: WorkerResultPayload) => {
  const state = result.result || result.status;
  return state === 'INTERMEDIATE' || state === 'K_BEST' || state === 'RUNNING';
};

const toSearchResult = (
  result: WorkerResultPayload,
  fallbackCpuId: number,
  recognitionTarget: RecognitionTarget,
  domain: Domain,
  fallbackStatus?: string,
): SearchResult | null => {
  const K = asFiniteNumber(result.K);
  const REL_ERR = asFiniteNumber(result.REL_ERR);
  const RPN = typeof result.RPN === 'string' ? result.RPN : '';
  if (K === null || REL_ERR === null || !RPN) return null;

  let numericValue: string;
  try {
    numericValue = getDisplayValue(result, recognitionTarget, domain);
  } catch {
    numericValue = 'N/A';
  }

  const compressionRatio = asFiniteNumber(result.COMPRESSION_RATIO);

  return {
    cpuId: result.cpuId ?? fallbackCpuId,
    K,
    RPN,
    result: numericValue,
    REL_ERR,
    status: normalizeStatus(result, fallbackStatus),
    targetIndex: typeof result.target_id === 'number' ? result.target_id : result.targetIndex,
    targetLabel: getResultTargetLabel(result),
    compressionRatio: compressionRatio ?? undefined,
  };
};

export function mapWorkerResultPayload(
  data: WorkerResultPayload,
  fallbackCpuId: number,
  recognitionTarget: RecognitionTarget,
  domain: Domain,
) {
  const mappedResults: SearchResult[] = [];
  const candidateResults = Array.isArray(data.candidates)
    ? data.candidates
    : Array.isArray(data.results)
      ? data.results
      : [];

  for (const candidate of candidateResults) {
    if (recognitionTarget === 'multiple' && isTransientMultipleResult(candidate)) continue;
    const mapped = toSearchResult(candidate, data.cpuId ?? fallbackCpuId, recognitionTarget, domain);
    if (mapped) mappedResults.push(mapped);
  }

  if (recognitionTarget !== 'multiple' && data.result && data.RPN) {
    const mapped = toSearchResult(
      data,
      data.cpuId ?? fallbackCpuId,
      recognitionTarget,
      domain,
      data.status || data.result,
    );
    if (mapped) mappedResults.push(mapped);
  }

  return mappedResults;
}
