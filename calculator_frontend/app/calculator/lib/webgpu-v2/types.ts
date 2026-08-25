import type { CalculatorSelection, CalculatorToken, CompiledCalculator } from './calculator';
import type { FunctionPoint, MultivariatePoint } from '../types';

export const MAX_GPU_K = 16;
export const MAX_OPS_PER_KIND = 32;
export const MAX_GROUP_BEST_TO_VERIFY = 64;
export const RESULT_WORDS = 4;
export const RESULT_BYTES = RESULT_WORDS * 4;

/** Stable 16-byte record copied from WGSL storage into CPU-readable staging memory. */
export const GPU_INTERMEDIATE_RESULT_FORMAT = Object.freeze({
  byteLength: RESULT_BYTES,
  localIndexOffset: 0,
  gpuRelativeErrorOffset: 4,
  gpuValueOffset: 8,
  flagsOffset: 12,
  validFlag: 1,
} as const);

/** Stable 16-byte atomic counter/overflow record written once per GPU tile. */
export const GPU_SEARCH_STATE_FORMAT = Object.freeze({
  byteLength: 16,
  candidateCountOffset: 0,
  overflowOffset: 4,
} as const);

export const enum FormTokenKind {
  Constant = 0,
  Unary = 1,
  Binary = 2,
}

export interface RpnForm {
  readonly K: number;
  readonly structureId: bigint;
  readonly kinds: Uint32Array;
  readonly radices: Uint32Array;
  readonly totalCombinations: bigint;
}

export interface GPURecognizerInfo {
  readonly supported: boolean;
  readonly adapterName: string;
  /** True only after a real compute dispatch and readback succeeded. */
  readonly selfTestPassed: boolean;
  /** True only after a deliberately overflowing result tile was recovered. */
  readonly overflowRecoveryPassed: boolean;
  /** True only after constants, every operator kind and both function modes pass. */
  readonly scientificParityPassed: boolean;
  readonly selfTestElapsedMs: number;
  readonly workgroupSize: number;
  readonly maxWorkgroupsPerDimension: number;
  readonly maxStorageBufferBindingSize: number;
  readonly maxBufferSize: number;
  readonly error?: string;
}

export interface GPUSelfTestSummary {
  readonly elapsedMs: number;
  readonly uniqueEvaluations: bigint;
  readonly dispatchedEvaluations: bigint;
  readonly overflowRecoveryDispatchedEvaluations: bigint;
  readonly overflowRetries: number;
  readonly resultValue: number;
  readonly parityCases: number;
}

export type SearchStopReason =
  | 'completed'
  | 'accepted-at-minimal-k'
  | 'aborted'
  | 'time-limit'
  | 'evaluation-limit';

export type GPURanking = 'relative-error' | 'compression-ratio';

export interface VerifiedGPUResult {
  readonly tokens: readonly CalculatorToken[];
  readonly rpn: string;
  readonly K: number;
  readonly structureId: bigint;
  readonly combinationIndex: bigint;
  readonly value: number;
  readonly absoluteError: number;
  readonly relativeError: number;
  readonly compressionRatio: number;
  readonly gpuValue: number;
  readonly gpuRelativeError: number;
  readonly source: 'threshold' | 'group-best';
  readonly accepted: boolean;
}

export interface GPUProgress {
  readonly K: number;
  readonly formIndex: number;
  readonly formCount: number;
  readonly structureId: bigint;
  readonly formCombinations: bigint;
  readonly formCompleted: bigint;
  readonly uniqueEvaluations: bigint;
  readonly dispatchedEvaluations: bigint;
  readonly elapsedMs: number;
  readonly verifiedCandidates: number;
  /** Number of full candidate-buffer tiles that were safely split and rerun. */
  readonly overflowRetries: number;
}

export interface GPUSearchRequest {
  readonly target: number;
  readonly minK?: number;
  readonly maxK?: number;
  readonly calculator?: CalculatorSelection;
  /** When present, recognize one expression containing x against these points. */
  readonly functionPoints?: readonly FunctionPoint[];
  /** When present, recognize one expression containing both C1 and C2. */
  readonly multivariatePoints?: readonly MultivariatePoint[];
  /** Accepted weighted MSE for function recognition. */
  readonly functionErrorTolerance?: number;

  /** GPU screening threshold. Final ranking always uses CPU FP64 verification. */
  readonly screeningRelativeError?: number;
  /** Measurement uncertainty of the target. */
  readonly absoluteTolerance?: number;
  readonly exactRelativeTolerance?: number;
  /** Required CR for tolerance-based early acceptance, matching the C core. */
  readonly compressionRatioThreshold?: number;
  readonly ranking?: GPURanking;

  readonly topN?: number;
  /** Per-tile ceiling; actual capacity is also capped by that tile's invocation count. */
  readonly candidateCapacity?: number;
  /** Total persistent storage + staging-buffer budget for this search. */
  readonly maxDeviceBufferBytes?: number;
  readonly tileInvocations?: number;
  readonly groupBestToVerify?: number;
  readonly maxEvaluations?: bigint;
  readonly maxDurationMs?: number;
  readonly stopAfterFirstAcceptedK?: boolean;

  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: GPUProgress) => void;
  readonly verify?: (tokens: readonly CalculatorToken[]) => number;
}

export interface GPUSearchSummary {
  readonly stopReason: SearchStopReason;
  readonly target: number;
  readonly calculator: CompiledCalculator;
  readonly results: readonly VerifiedGPUResult[];
  readonly uniqueEvaluations: bigint;
  readonly dispatchedEvaluations: bigint;
  readonly elapsedMs: number;
  readonly completedThroughK: number;
  /** Number of full candidate-buffer tiles that were safely split and rerun. */
  readonly overflowRetries: number;
  readonly transfers: GPUTransferMetrics;
  readonly buffers: GPUBufferMetrics;
}

/** Measured host/device traffic and the largest persistent allocation in one search. */
export interface GPUTransferMetrics {
  readonly dispatches: number;
  readonly dataUploads: number;
  readonly candidateReadbacks: number;
  readonly cpuToGpuBytes: bigint;
  readonly gpuToCpuBytes: bigint;
  readonly peakStorageBytes: number;
  readonly peakReadbackBytes: number;
  readonly peakAllocatedBytes: number;
}

/** Bounded-buffer evidence returned with every search. */
export interface GPUBufferMetrics {
  readonly intermediateRecordBytes: number;
  readonly configuredCandidateCapacity: number;
  readonly peakTileCandidateCapacity: number;
  readonly peakThresholdCandidates: number;
  readonly forwardedCandidates: number;
  readonly verifiedCandidates: number;
  readonly retainedResults: number;
  readonly discardedVerifiedResults: number;
  readonly maxDeviceBufferBytes: number;
}

export interface RawGPUCandidate {
  readonly localIndex: number;
  readonly gpuRelativeError: number;
  readonly gpuValue: number;
  readonly source: 'threshold' | 'group-best';
}
