import type { ComputeMode, Domain, RecognitionTarget } from '../types';
import { generateValidForms } from './form-generator';

export const GPU_AUTO_EVALUATION_BUDGET = 5_000_000;
export const GPU_EXPLICIT_EVALUATION_BUDGET = 100_000_000;

export interface GPUWorkloadEstimate {
  estimatedEvaluations: number;
  allowed: boolean;
  reason?: string;
}

interface EstimateOptions {
  recognitionTarget: RecognitionTarget;
  domain: Domain;
  minK: number;
  maxK: number;
  targetCount?: number;
  pointCount?: number;
}

interface DecisionOptions extends EstimateOptions {
  computeMode: ComputeMode;
}

const targetMultiplier = (options: EstimateOptions) => {
  if (options.recognitionTarget === 'multiple') {
    return Math.max(1, options.targetCount ?? 1);
  }
  if (options.recognitionTarget === 'function' || options.recognitionTarget === 'sequence') {
    return Math.max(2, options.pointCount ?? 2);
  }
  return 1;
};

export function estimateGpuEvaluations(options: EstimateOptions) {
  const includeVariable =
    options.recognitionTarget === 'function' ||
    options.recognitionTarget === 'sequence';

  let combinations = 0;
  for (let K = options.minK; K <= options.maxK; K++) {
    combinations += generateValidForms(K, options.domain, { includeVariable })
      .reduce((sum, form) => sum + form.totalCombinations, 0);
  }

  return combinations * targetMultiplier(options);
}

export function decideGpuWorkload(options: DecisionOptions): GPUWorkloadEstimate {
  const estimatedEvaluations = estimateGpuEvaluations(options);
  const budget = options.computeMode === 'auto'
    ? GPU_AUTO_EVALUATION_BUDGET
    : GPU_EXPLICIT_EVALUATION_BUDGET;

  if (estimatedEvaluations > budget) {
    return {
      estimatedEvaluations,
      allowed: false,
      reason: `GPU workload estimate ${estimatedEvaluations.toLocaleString()} exceeds ${budget.toLocaleString()} safe evaluations.`,
    };
  }

  return {
    estimatedEvaluations,
    allowed: true,
  };
}
