import { describe, expect, it } from 'vitest';
import {
  describeGPUCompletion,
  formatGPUAdapterName,
  formatGPUError,
  getAccelerationStatus,
  getGPUFallbackNotice,
  getGPUInputCompatibilityError,
  getGPUInputFallbackNotice,
} from '../app/calculator/lib/gpu-ui';

describe('GPU interface state', () => {
  it('shows a friendly CPU mode when WebGPU is unavailable', () => {
    expect(getAccelerationStatus({
      checked: true,
      supported: false,
      engine: 'auto',
      phase: 'idle',
      backend: null,
      adapterName: null,
    })).toMatchObject({
      label: 'GPU unavailable',
      tone: 'warning',
    });
  });

  it('keeps the idle UI quiet after GPU readiness is confirmed', () => {
    expect(formatGPUAdapterName('nvidia')).toBe('NVIDIA GPU');
    expect(getAccelerationStatus({
      checked: true,
      supported: true,
      engine: 'auto',
      phase: 'idle',
      backend: null,
      adapterName: 'nvidia',
    })).toEqual({
      label: '',
      description: '',
      tone: 'positive',
    });
  });

  it('keeps explicit CPU mode neutral even when a GPU is available', () => {
    expect(getAccelerationStatus({
      checked: true,
      supported: true,
      engine: 'cpu',
      phase: 'idle',
      backend: null,
      adapterName: 'nvidia',
    })).toMatchObject({
      label: 'CPU mode',
      tone: 'neutral',
    });
  });

  it('uses the actual backend for running and completed labels', () => {
    expect(getAccelerationStatus({
      checked: true,
      supported: true,
      engine: 'auto',
      phase: 'running',
      backend: 'gpu',
      adapterName: null,
    }).label).toBe('Searching with GPU');

    expect(getAccelerationStatus({
      checked: true,
      supported: false,
      engine: 'auto',
      phase: 'running',
      backend: 'cpu',
      adapterName: null,
    }).label).toBe('Searching with CPU');

    expect(getAccelerationStatus({
      checked: true,
      supported: true,
      engine: 'auto',
      phase: 'complete',
      backend: 'gpu',
      adapterName: null,
    })).toMatchObject({
      label: 'GPU accelerated',
      tone: 'positive',
    });
  });

  it('marks evaluation and time limits as partial without invalidating results', () => {
    const evaluationLimit = describeGPUCompletion({
      stopReason: 'evaluation-limit',
      completedThroughK: 6,
      evaluationCount: '100,000,000',
      resultCount: 12,
    });
    expect(evaluationLimit.phase).toBe('partial');
    expect(evaluationLimit.detail).toContain('results remain valid');

    const timeLimit = describeGPUCompletion({
      stopReason: 'time-limit',
      completedThroughK: 5,
      evaluationCount: '50,000,000',
      resultCount: 1,
    });
    expect(timeLimit.phase).toBe('partial');
    expect(timeLimit.detail).toContain('30 second safety limit');
  });

  it('reports when full GPU candidate tiles were safely reprocessed', () => {
    const completion = describeGPUCompletion({
      stopReason: 'completed',
      completedThroughK: 4,
      evaluationCount: '1,000',
      resultCount: 2,
      overflowRetries: 3,
    });
    expect(completion.detail).toContain('buffer filled 3 times');
    expect(completion.detail).toContain('every affected tile was split and reprocessed');
  });

  it('distinguishes complete and aborted GPU outcomes', () => {
    expect(describeGPUCompletion({
      stopReason: 'completed',
      completedThroughK: 7,
      evaluationCount: '1,000',
      resultCount: 3,
    }).phase).toBe('complete');

    expect(describeGPUCompletion({
      stopReason: 'accepted-at-minimal-k',
      completedThroughK: 3,
      evaluationCount: '100',
      resultCount: 1,
    }).detail).toContain('lowest accepted complexity');

    expect(describeGPUCompletion({
      stopReason: 'aborted',
      completedThroughK: 2,
      evaluationCount: '10',
      resultCount: 0,
    }).phase).toBe('aborted');
  });

  it('keeps fallback copy friendly and non-technical', () => {
    const notice = getGPUFallbackNotice();
    expect(notice).toContain('continued safely on the CPU');
    expect(notice).not.toContain('WebGPU');
  });

  it('shows the real initialization failure instead of a generic ready state', () => {
    expect(formatGPUError('GPU compute self-test failed:\n validation error'))
      .toBe('GPU compute self-test failed: validation error');

    expect(getAccelerationStatus({
      checked: true,
      supported: false,
      engine: 'auto',
      phase: 'idle',
      backend: null,
      adapterName: 'nvidia',
      error: 'Cannot load GPU shader (404 Not Found).',
    })).toMatchObject({
      label: 'GPU unavailable',
      description: 'Cannot load GPU shader (404 Not Found).',
      tone: 'warning',
    });
  });

  it('routes values outside FP32 to CPU without invalidating a healthy GPU', () => {
    expect(getGPUInputCompatibilityError([0, Math.PI, 1e-20])).toBeNull();
    expect(getGPUInputCompatibilityError([Number.MAX_VALUE])).toMatch(/outside the finite FP32 range/i);
    expect(getGPUInputCompatibilityError([Number.MIN_VALUE])).toMatch(/round to zero/i);

    const notice = getGPUInputFallbackNotice('Input is outside FP32 range.');
    expect(notice).toContain('CPU/WASM FP64');
    expect(notice).toContain('GPU readiness is unchanged');
  });
});
