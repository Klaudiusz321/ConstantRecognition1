import type { ComputeEngine, SearchBackend, SearchPhase } from './types';
import type { SearchStopReason } from './webgpu-v2';

export type AccelerationTone = 'active' | 'positive' | 'neutral' | 'warning';

export interface AccelerationStatus {
  label: string;
  description: string;
  tone: AccelerationTone;
}

interface AccelerationStatusInput {
  checked: boolean;
  supported: boolean;
  engine: ComputeEngine;
  phase: SearchPhase;
  backend: SearchBackend | null;
  adapterName: string | null;
  error?: string | null;
}

export function formatGPUAdapterName(adapterName: string | null): string | null {
  if (!adapterName) return null;
  const trimmed = adapterName.trim();
  if (!trimmed) return null;
  if (/^nvidia$/i.test(trimmed)) return 'NVIDIA GPU';
  if (/^amd$/i.test(trimmed)) return 'AMD GPU';
  if (/^intel$/i.test(trimmed)) return 'Intel GPU';
  return trimmed;
}

export function formatGPUError(error: string | null | undefined): string | null {
  if (!error) return null;
  const normalized = error.replace(/\s+/g, ' ').trim();
  return normalized || null;
}

/**
 * GPU screening stores inputs in FP32. Refuse values that would become an
 * infinity or silently collapse to zero; CPU/WASM can still process them as
 * FP64 without changing the global GPU readiness state.
 */
export function getGPUInputCompatibilityError(values: readonly number[]): string | null {
  for (const value of values) {
    if (!Number.isFinite(value)) {
      return 'GPU screening requires finite numerical inputs.';
    }
    const fp32 = Math.fround(value);
    if (!Number.isFinite(fp32)) {
      return `Input value ${value.toExponential(6)} is outside the finite FP32 range used for GPU screening.`;
    }
    if (value !== 0 && fp32 === 0) {
      return `Input value ${value.toExponential(6)} would round to zero during FP32 GPU screening.`;
    }
  }
  return null;
}

export function getGPUInputFallbackNotice(reason: string): string {
  return `${reason} This search is using CPU/WASM FP64 instead; GPU readiness is unchanged.`;
}

export function getAccelerationStatus({
  checked,
  supported,
  engine,
  phase,
  backend,
  adapterName,
  error,
}: AccelerationStatusInput): AccelerationStatus {
  const friendlyAdapter = formatGPUAdapterName(adapterName);

  if (phase === 'running' && backend === 'gpu') {
    return {
      label: 'Searching with GPU',
      description: friendlyAdapter
        ? `${friendlyAdapter} is screening candidates. Every result is verified on the CPU.`
        : 'GPU acceleration is screening candidates. Every result is verified on the CPU.',
      tone: 'active',
    };
  }

  if (phase === 'running' && backend === 'cpu') {
    return {
      label: 'Searching with CPU',
      description: 'The search is running in the compatible CPU/WASM mode.',
      tone: 'active',
    };
  }

  if ((phase === 'complete' || phase === 'partial') && backend === 'gpu') {
    return {
      label: 'GPU accelerated',
      description: 'Candidates were screened on the GPU and verified on the CPU.',
      tone: phase === 'partial' ? 'warning' : 'positive',
    };
  }

  if (engine === 'cpu') {
    return {
      label: 'CPU mode',
      description: 'GPU acceleration is turned off in the Compute engine setting.',
      tone: 'neutral',
    };
  }

  if (!checked) {
    return {
      label: 'Testing GPU acceleration',
      description: 'The calculator is running a short shader, dispatch and readback self-test.',
      tone: 'neutral',
    };
  }

  if (supported) {
    return {
      label: '',
      description: '',
      tone: 'positive',
    };
  }

  return {
    label: 'GPU unavailable',
    description: formatGPUError(error) ?? 'GPU acceleration is unavailable, so Auto mode will use the CPU.',
    tone: 'warning',
  };
}

interface GPUCompletionInput {
  stopReason: SearchStopReason;
  completedThroughK: number;
  evaluationCount: string;
  resultCount: number;
  overflowRetries?: number;
}

export function describeGPUCompletion({
  stopReason,
  completedThroughK,
  evaluationCount,
  resultCount,
  overflowRetries = 0,
}: GPUCompletionInput): { phase: SearchPhase; detail: string } {
  const resultLabel = `${resultCount} verified result${resultCount === 1 ? '' : 's'}`;
  const recoveryLabel = overflowRetries > 0
    ? ` The candidate buffer filled ${overflowRetries} time${overflowRetries === 1 ? '' : 's'}; every affected tile was split and reprocessed.`
    : '';

  if (stopReason === 'evaluation-limit') {
    return {
      phase: 'partial',
      detail: `${resultLabel} found. The results remain valid, but the full search space was not explored after ${evaluationCount} candidates.${recoveryLabel}`,
    };
  }

  if (stopReason === 'time-limit') {
    return {
      phase: 'partial',
      detail: `${resultLabel} found. The results remain valid, but the search stopped at the 30 second safety limit.${recoveryLabel}`,
    };
  }

  if (stopReason === 'aborted') {
    return {
      phase: 'aborted',
      detail: 'Search stopped. You can adjust the settings and try again.',
    };
  }

  if (stopReason === 'accepted-at-minimal-k') {
    return {
      phase: 'complete',
      detail: `${resultLabel} found at the lowest accepted complexity, K=${completedThroughK}.${recoveryLabel}`,
    };
  }

  return {
    phase: 'complete',
    detail: `${resultLabel} found after completing the search through K=${completedThroughK}.${recoveryLabel}`,
  };
}

export function getGPUFallbackNotice(): string {
  return 'GPU acceleration became unavailable, so this search continued safely on the CPU.';
}
