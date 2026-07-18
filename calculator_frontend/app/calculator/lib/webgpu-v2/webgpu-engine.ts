
import {
  compileCalculator,
  type CompiledCalculator,
} from './calculator';
import { absoluteError, evaluateCoreRPN, relativeError } from './cpu-verifier';
import { countValidForms, iterateValidForms } from './forms';
import { getCompressionRatio, isAcceptedCandidate } from './metrics';
import { decodeCombination, indexToDigits } from './mixed-radix';
import {
  MAX_GPU_K,
  MAX_OPS_PER_KIND,
  RESULT_BYTES,
  type GPURecognizerInfo,
  type GPUProgress,
  type GPURanking,
  type GPUSearchRequest,
  type GPUSearchSummary,
  type RawGPUCandidate,
  type RpnForm,
  type SearchStopReason,
  type VerifiedGPUResult,
} from './types';

const WORKGROUP_SIZE = 256;
const PARAM_BYTES = 48;
const STATE_BYTES = 16;
const FORM_WORDS = MAX_GPU_K * 3 + MAX_OPS_PER_KIND * 3;
const FORM_BYTES = FORM_WORDS * 4;
const DEFAULT_CANDIDATE_CAPACITY = 65_536;
const DEFAULT_TILE_INVOCATIONS = 1_048_576;
const DEFAULT_SCREENING_REL_ERROR = 1e-4;
const DEFAULT_MAX_EVALUATIONS = BigInt(100_000_000);
const DEFAULT_MAX_DURATION_MS = 30_000;
const DEFAULT_GROUP_BEST_TO_VERIFY = 32;
const DEFAULT_TOP_N = 100;
const DEFAULT_CR_THRESHOLD = 1.05;
const F32_EPSILON = 2 ** -23;

interface GPUResources {
  readonly candidateCapacity: number;
  readonly groupCapacity: number;
  readonly params: GPUBuffer;
  readonly form: GPUBuffer;
  readonly candidates: GPUBuffer;
  readonly state: GPUBuffer;
  readonly groupBest: GPUBuffer;
  readonly candidateReadback: GPUBuffer;
  readonly stateReadback: GPUBuffer;
  readonly groupReadback: GPUBuffer;
  readonly bindGroup: GPUBindGroup;
}

interface DispatchResult {
  readonly overflow: boolean;
  readonly thresholdCandidates: RawGPUCandidate[];
  readonly groupBest: RawGPUCandidate[];
}

interface TileContext {
  readonly targetF32: number;
  readonly screeningRelativeError: number;
  readonly calculator: CompiledCalculator;
  readonly candidateCapacity: number;
  readonly groupBestToVerify: number;
  readonly signal?: AbortSignal;
  readonly deadline: number;
  onDispatch: (count: number, depth: number) => void;
  onCandidates: (
    form: RpnForm,
    tileStart: bigint,
    candidates: readonly RawGPUCandidate[],
  ) => void;
}

class StopSearch extends Error {
  constructor(readonly reason: SearchStopReason) {
    super(reason);
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new StopSearch('aborted');
}

function validatePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
  return value;
}

function minBigInt(...values: bigint[]): bigint {
  return values.reduce((best, value) => (value < best ? value : best));
}

function compareResults(ranking: GPURanking) {
  return (a: VerifiedGPUResult, b: VerifiedGPUResult): number => {
    if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
    if (ranking === 'compression-ratio' && a.compressionRatio !== b.compressionRatio) {
      return b.compressionRatio - a.compressionRatio;
    }
    if (a.relativeError !== b.relativeError) return a.relativeError - b.relativeError;
    if (a.K !== b.K) return a.K - b.K;
    return a.rpn.localeCompare(b.rpn);
  };
}

function resolveShaderUrl(path: string, basePath = ''): string {
  const trimmedBase = basePath.replace(/^\/+|\/+$/g, '');
  const cleanBase = trimmedBase ? `/${trimmedBase}` : '';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (typeof window === 'undefined') return `${cleanBase}${cleanPath}`;
  return new URL(`${cleanBase}${cleanPath}`, window.location.origin).toString();
}

export interface WebGPURecognizerCreateOptions {
  readonly shaderUrl?: string;
  readonly basePath?: string;
  readonly powerPreference?: GPUPowerPreference;
}

/**
 * Browser WebGPU engine for Constant Recognition.
 *
 * WebGPU/WGSL uses FP32, so this class only screens candidates on the GPU.
 * Every result returned to the caller is recomputed by an FP64 verifier.
 */
export class WebGPUConstantRecognizer {
  private resources: GPUResources | null = null;
  private running = false;
  private destroyed = false;

  private constructor(
    private readonly device: GPUDevice,
    private readonly pipeline: GPUComputePipeline,
    readonly info: GPURecognizerInfo,
  ) {
    void device.lost.then(() => {
      this.destroyed = true;
      this.resources = null;
    });
  }

  static async create(
    options: WebGPURecognizerCreateOptions = {},
  ): Promise<WebGPUConstantRecognizer> {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      throw new Error('WebGPU is unavailable. Use a secure context and a WebGPU-capable browser.');
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: options.powerPreference ?? 'high-performance',
    });
    if (!adapter) throw new Error('No WebGPU adapter was returned.');

    const device = await adapter.requestDevice();
    const maxInvocations = Number(device.limits.maxComputeInvocationsPerWorkgroup);
    const maxSizeX = Number(device.limits.maxComputeWorkgroupSizeX);
    if (maxInvocations < WORKGROUP_SIZE || maxSizeX < WORKGROUP_SIZE) {
      device.destroy();
      throw new Error(
        `The selected adapter supports only ${Math.min(maxInvocations, maxSizeX)} ` +
        `threads per workgroup; ${WORKGROUP_SIZE} are required by the shader.`,
      );
    }
    const requiredWorkgroupBytes = WORKGROUP_SIZE * 4 * 4;
    if (Number(device.limits.maxComputeWorkgroupStorageSize) < requiredWorkgroupBytes) {
      device.destroy();
      throw new Error(`The shader requires ${requiredWorkgroupBytes} bytes of workgroup storage.`);
    }
    if (Number(device.limits.maxStorageBuffersPerShaderStage) < 4) {
      device.destroy();
      throw new Error('The shader requires four storage-buffer bindings.');
    }

    const shaderUrl = resolveShaderUrl(
      options.shaderUrl ?? '/wasm/constant-recognition-v2.wgsl',
      options.basePath ?? '',
    );
    const response = await fetch(shaderUrl);
    if (!response.ok) {
      device.destroy();
      throw new Error(`Cannot load WebGPU shader (${response.status} ${response.statusText}).`);
    }
    const shaderCode = await response.text();
    if (/^\s*</.test(shaderCode)) {
      device.destroy();
      throw new Error('Shader URL returned HTML instead of WGSL.');
    }

    const shaderModule = device.createShaderModule({
      label: 'Constant Recognition FP32 screening shader',
      code: shaderCode,
    });
    const compilation = await shaderModule.getCompilationInfo();
    const errors = compilation.messages.filter((message) => message.type === 'error');
    if (errors.length > 0) {
      device.destroy();
      const details = errors
        .map((message) => `line ${message.lineNum}:${message.linePos} ${message.message}`)
        .join('\n');
      throw new Error(`WGSL compilation failed:\n${details}`);
    }

    const pipeline = await device.createComputePipelineAsync({
      label: 'Constant Recognition search pipeline',
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'search' },
    });

    const adapterInfo = adapter.info;
    const adapterName = adapterInfo.description || adapterInfo.device || adapterInfo.vendor || 'WebGPU adapter';

    return new WebGPUConstantRecognizer(device, pipeline, {
      supported: true,
      adapterName,
      workgroupSize: WORKGROUP_SIZE,
      maxWorkgroupsPerDimension: Number(device.limits.maxComputeWorkgroupsPerDimension),
      maxStorageBufferBindingSize: Number(device.limits.maxStorageBufferBindingSize),
      maxBufferSize: Number(device.limits.maxBufferSize),
    });
  }

  isReady(): boolean {
    return !this.destroyed;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyResources();
    this.device.destroy();
    this.destroyed = true;
  }

  async search(request: GPUSearchRequest): Promise<GPUSearchSummary> {
    if (this.destroyed) throw new Error('The WebGPU recognizer has been destroyed.');
    if (this.running) throw new Error('Concurrent searches on one GPU engine are not supported.');
    if (!Number.isFinite(request.target)) throw new TypeError('Target must be finite.');

    const minK = request.minK ?? 1;
    const maxK = request.maxK ?? 7;
    if (!Number.isInteger(minK) || !Number.isInteger(maxK) || minK < 1 || maxK < minK || maxK > MAX_GPU_K) {
      throw new RangeError(`Expected 1 <= minK <= maxK <= ${MAX_GPU_K}.`);
    }

    const calculator = compileCalculator(request.calculator);
    const instructionCount =
      calculator.constCodes.length + calculator.unaryCodes.length + calculator.binaryCodes.length;

    const candidateCapacity = validatePositiveInteger(
      request.candidateCapacity ?? DEFAULT_CANDIDATE_CAPACITY,
      'candidateCapacity',
    );
    const maximumStorageBytes = Math.min(
      this.info.maxStorageBufferBindingSize,
      this.info.maxBufferSize,
    );
    const maximumCandidateCapacity = Math.floor(maximumStorageBytes / RESULT_BYTES);
    if (candidateCapacity > maximumCandidateCapacity) {
      throw new RangeError(
        `candidateCapacity=${candidateCapacity} exceeds this adapter's safe limit ` +
        `of ${maximumCandidateCapacity}.`,
      );
    }

    const requestedTile = validatePositiveInteger(
      request.tileInvocations ?? DEFAULT_TILE_INVOCATIONS,
      'tileInvocations',
    );
    const maxTileByDevice = this.info.maxWorkgroupsPerDimension * WORKGROUP_SIZE;
    const tileInvocations = Math.min(requestedTile, maxTileByDevice, 0xffff_ffff);

    const requestedGroupBest = request.groupBestToVerify ?? DEFAULT_GROUP_BEST_TO_VERIFY;
    if (!Number.isSafeInteger(requestedGroupBest) || requestedGroupBest < 0) {
      throw new RangeError('groupBestToVerify must be a non-negative safe integer.');
    }
    const groupBestToVerify = requestedGroupBest;
    const topN = validatePositiveInteger(request.topN ?? DEFAULT_TOP_N, 'topN');

    const maxEvaluations = request.maxEvaluations ?? DEFAULT_MAX_EVALUATIONS;
    const maxDurationMs = request.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
    if (typeof maxEvaluations !== 'bigint' || maxEvaluations <= BigInt(0)) {
      throw new RangeError('maxEvaluations must be a positive bigint.');
    }
    if (!Number.isFinite(maxDurationMs) || maxDurationMs <= 0) {
      throw new RangeError('maxDurationMs must be positive and finite.');
    }

    const targetF32 = Math.fround(request.target);
    if (!Number.isFinite(targetF32) || (request.target !== 0 && targetF32 === 0)) {
      throw new RangeError('Target cannot be represented as a finite non-zero FP32 value.');
    }

    const targetQuantization = relativeError(targetF32, request.target);
    const screeningRelativeError = Math.fround(Math.max(
      request.screeningRelativeError ?? DEFAULT_SCREENING_REL_ERROR,
      64 * F32_EPSILON,
      targetQuantization * 4,
    ));
    if (!Number.isFinite(screeningRelativeError) || screeningRelativeError <= 0) {
      throw new RangeError('screeningRelativeError must be positive and representable in FP32.');
    }

    const exactTolerance = request.exactRelativeTolerance ?? 16 * Number.EPSILON;
    const absoluteTolerance = request.absoluteTolerance ?? 0;
    const compressionRatioThreshold =
      request.compressionRatioThreshold ?? DEFAULT_CR_THRESHOLD;
    for (const [value, label] of [
      [exactTolerance, 'exactRelativeTolerance'],
      [absoluteTolerance, 'absoluteTolerance'],
      [compressionRatioThreshold, 'compressionRatioThreshold'],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`${label} must be finite and non-negative.`);
      }
    }

    const ranking = request.ranking ??
      (absoluteTolerance > 0 ? 'compression-ratio' : 'relative-error');
    if (ranking !== 'relative-error' && ranking !== 'compression-ratio') {
      throw new RangeError(`Unknown ranking mode: ${String(ranking)}.`);
    }
    const resultComparator = compareResults(ranking);
    const verifier = request.verify ?? evaluateCoreRPN;
    const stopAfterFirstAcceptedK = request.stopAfterFirstAcceptedK ?? true;

    const started = nowMs();
    const deadline = started + maxDurationMs;
    const results: VerifiedGPUResult[] = [];
    let uniqueEvaluations = BigInt(0);
    let dispatchedEvaluations = BigInt(0);
    let completedThroughK = minK - 1;
    let stopReason: SearchStopReason = 'completed';
    let verifiedCandidates = 0;

    const keepResult = (result: VerifiedGPUResult): void => {
      results.push(result);
      results.sort(resultComparator);
      if (results.length > topN) results.length = topN;
    };

    const verifyCandidates = (
      form: RpnForm,
      tileStart: bigint,
      rawCandidates: readonly RawGPUCandidate[],
    ): void => {
      for (const raw of rawCandidates) {
        const combinationIndex = tileStart + BigInt(raw.localIndex);
        if (combinationIndex >= form.totalCombinations) continue;

        const tokens = decodeCombination(form, calculator, combinationIndex);
        const rpn = tokens.join(', ');

        let value: number;
        try {
          value = verifier(tokens);
        } catch {
          continue;
        }
        if (!Number.isFinite(value)) continue;

        verifiedCandidates++;
        const absError = absoluteError(value, request.target);
        const relError = relativeError(value, request.target);
        const cr = getCompressionRatio(relError, form.K, instructionCount);
        const accepted = isAcceptedCandidate({
          relativeError: relError,
          absoluteError: absError,
          compressionRatio: cr,
          exactRelativeTolerance: exactTolerance,
          absoluteTolerance,
          compressionRatioThreshold,
        });

        keepResult({
          tokens,
          rpn,
          K: form.K,
          structureId: form.structureId,
          combinationIndex,
          value,
          absoluteError: absError,
          relativeError: relError,
          compressionRatio: cr,
          gpuValue: raw.gpuValue,
          gpuRelativeError: raw.gpuRelativeError,
          source: raw.source,
          accepted,
        });
      }
    };

    const context: TileContext = {
      targetF32,
      screeningRelativeError,
      calculator,
      candidateCapacity,
      groupBestToVerify,
      signal: request.signal,
      deadline,
      onDispatch: (count, depth) => {
        dispatchedEvaluations += BigInt(count);
        if (depth === 0) uniqueEvaluations += BigInt(count);
      },
      onCandidates: verifyCandidates,
    };

    this.running = true;
    try {
      outer: for (let K = minK; K <= maxK; K++) {
        throwIfAborted(request.signal);
        if (nowMs() >= deadline) throw new StopSearch('time-limit');

        const formCount = countValidForms(K, calculator);
        let acceptedAtThisK = false;
        let formIndex = 0;

        for (const form of iterateValidForms(K, calculator)) {
          let formCompleted = BigInt(0);

          while (formCompleted < form.totalCombinations) {
            throwIfAborted(request.signal);
            if (nowMs() >= deadline) throw new StopSearch('time-limit');
            if (uniqueEvaluations >= maxEvaluations) throw new StopSearch('evaluation-limit');

            const remainingForm = form.totalCombinations - formCompleted;
            const remainingBudget = maxEvaluations - uniqueEvaluations;
            const batchBig = minBigInt(
              remainingForm,
              remainingBudget,
              BigInt(tileInvocations),
            );
            if (batchBig <= BigInt(0)) throw new StopSearch('evaluation-limit');

            const batchCount = Number(batchBig);
            await this.processTileWithOverflowSplitting(
              form,
              formCompleted,
              batchCount,
              context,
              0,
            );
            formCompleted += batchBig;

            acceptedAtThisK = acceptedAtThisK || results.some(
              (result) => result.K === K && result.accepted,
            );

            request.onProgress?.({
              K,
              formIndex,
              formCount,
              structureId: form.structureId,
              formCombinations: form.totalCombinations,
              formCompleted,
              uniqueEvaluations,
              dispatchedEvaluations,
              elapsedMs: nowMs() - started,
              verifiedCandidates,
            } satisfies GPUProgress);
          }
          formIndex++;
        }

        completedThroughK = K;
        if (acceptedAtThisK && stopAfterFirstAcceptedK) {
          stopReason = 'accepted-at-minimal-k';
          break outer;
        }
      }
    } catch (error) {
      if (error instanceof StopSearch) {
        stopReason = error.reason;
      } else {
        throw error;
      }
    } finally {
      this.running = false;
    }

    return {
      stopReason,
      target: request.target,
      calculator,
      results: [...results],
      uniqueEvaluations,
      dispatchedEvaluations,
      elapsedMs: nowMs() - started,
      completedThroughK,
    };
  }

  private async processTileWithOverflowSplitting(
    form: RpnForm,
    tileStart: bigint,
    batchCount: number,
    context: TileContext,
    depth: number,
  ): Promise<void> {
    throwIfAborted(context.signal);
    if (nowMs() >= context.deadline) throw new StopSearch('time-limit');

    const dispatched = await this.dispatchTile(form, tileStart, batchCount, context, depth);

    if (dispatched.overflow) {
      if (batchCount <= 1) {
        throw new Error('Candidate buffer overflowed for a one-expression tile.');
      }
      const leftCount = Math.floor(batchCount / 2);
      const rightCount = batchCount - leftCount;
      await this.processTileWithOverflowSplitting(
        form,
        tileStart,
        leftCount,
        context,
        depth + 1,
      );
      await this.processTileWithOverflowSplitting(
        form,
        tileStart + BigInt(leftCount),
        rightCount,
        context,
        depth + 1,
      );
      return;
    }

    const best = [...dispatched.groupBest]
      .sort((a, b) => a.gpuRelativeError - b.gpuRelativeError)
      .slice(0, context.groupBestToVerify);

    const deduplicated = new Map<number, RawGPUCandidate>();
    for (const candidate of best) deduplicated.set(candidate.localIndex, candidate);
    for (const candidate of dispatched.thresholdCandidates) {
      deduplicated.set(candidate.localIndex, candidate); // threshold source wins
    }
    context.onCandidates(form, tileStart, [...deduplicated.values()]);
  }

  private async dispatchTile(
    form: RpnForm,
    tileStart: bigint,
    batchCount: number,
    context: TileContext,
    depth: number,
  ): Promise<DispatchResult> {
    const workgroupCount = Math.ceil(batchCount / WORKGROUP_SIZE);
    if (workgroupCount > this.info.maxWorkgroupsPerDimension) {
      throw new RangeError('Tile exceeds maxComputeWorkgroupsPerDimension.');
    }

    const resources = this.ensureResources(context.candidateCapacity, workgroupCount);
    const formWords = this.packFormData(form, context.calculator, tileStart);
    const params = this.packParams(
      context.targetF32,
      context.screeningRelativeError,
      form.K,
      batchCount,
      context.candidateCapacity,
      workgroupCount,
      context.calculator,
    );

    this.device.queue.writeBuffer(resources.params, 0, params);
    this.device.queue.writeBuffer(resources.form, 0, formWords);
    this.device.queue.writeBuffer(resources.state, 0, new Uint32Array(4));

    const encoder = this.device.createCommandEncoder({ label: 'Constant Recognition tile' });
    const pass = encoder.beginComputePass({ label: 'FP32 candidate screening' });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, resources.bindGroup);
    pass.dispatchWorkgroups(workgroupCount);
    pass.end();
    encoder.copyBufferToBuffer(resources.state, 0, resources.stateReadback, 0, STATE_BYTES);
    encoder.copyBufferToBuffer(
      resources.groupBest,
      0,
      resources.groupReadback,
      0,
      workgroupCount * RESULT_BYTES,
    );
    this.device.queue.submit([encoder.finish()]);
    context.onDispatch(batchCount, depth);

    let stateMapped = false;
    let groupMapped = false;
    try {
      await Promise.all([
        resources.stateReadback.mapAsync(GPUMapMode.READ, 0, STATE_BYTES).then(() => { stateMapped = true; }),
        resources.groupReadback
          .mapAsync(GPUMapMode.READ, 0, workgroupCount * RESULT_BYTES)
          .then(() => { groupMapped = true; }),
      ]);
      throwIfAborted(context.signal);

      const stateView = new DataView(resources.stateReadback.getMappedRange(0, STATE_BYTES));
      const candidateCount = stateView.getUint32(0, true);
      const overflowFlag = stateView.getUint32(4, true);
      const overflow = overflowFlag !== 0 || candidateCount > context.candidateCapacity;

      const groupBest = this.parseCandidates(
        resources.groupReadback.getMappedRange(0, workgroupCount * RESULT_BYTES),
        workgroupCount,
        batchCount,
        'group-best',
      );

      if (overflow) {
        return { overflow: true, thresholdCandidates: [], groupBest: [] };
      }

      if (candidateCount === 0) {
        return { overflow: false, thresholdCandidates: [], groupBest };
      }

      // The first submission tells us the exact compacted result size. Only now
      // copy that many bytes; sparse searches do not read the whole capacity.
      if (stateMapped) {
        resources.stateReadback.unmap();
        stateMapped = false;
      }
      if (groupMapped) {
        resources.groupReadback.unmap();
        groupMapped = false;
      }

      const resultBytes = candidateCount * RESULT_BYTES;
      const resultEncoder = this.device.createCommandEncoder({ label: 'Candidate readback' });
      resultEncoder.copyBufferToBuffer(
        resources.candidates,
        0,
        resources.candidateReadback,
        0,
        resultBytes,
      );
      this.device.queue.submit([resultEncoder.finish()]);
      await resources.candidateReadback.mapAsync(GPUMapMode.READ, 0, resultBytes);
      try {
        throwIfAborted(context.signal);
        const thresholdCandidates = this.parseCandidates(
          resources.candidateReadback.getMappedRange(0, resultBytes),
          candidateCount,
          batchCount,
          'threshold',
        );
        return { overflow: false, thresholdCandidates, groupBest };
      } finally {
        resources.candidateReadback.unmap();
      }
    } finally {
      if (stateMapped) resources.stateReadback.unmap();
      if (groupMapped) resources.groupReadback.unmap();
    }
  }

  private parseCandidates(
    range: ArrayBuffer,
    count: number,
    batchCount: number,
    source: RawGPUCandidate['source'],
  ): RawGPUCandidate[] {
    const view = new DataView(range);
    const parsed: RawGPUCandidate[] = [];

    for (let i = 0; i < count; i++) {
      const offset = i * RESULT_BYTES;
      const localIndex = view.getUint32(offset, true);
      const gpuRelativeError = view.getFloat32(offset + 4, true);
      const gpuValue = view.getFloat32(offset + 8, true);
      const flags = view.getUint32(offset + 12, true);

      if (
        flags === 1 &&
        localIndex < batchCount &&
        Number.isFinite(gpuRelativeError) &&
        Number.isFinite(gpuValue)
      ) {
        parsed.push({ localIndex, gpuRelativeError, gpuValue, source });
      }
    }
    return parsed;
  }

  private packParams(
    targetF32: number,
    threshold: number,
    K: number,
    batchCount: number,
    candidateCapacity: number,
    workgroupCount: number,
    calculator: CompiledCalculator,
  ): ArrayBuffer {
    const buffer = new ArrayBuffer(PARAM_BYTES);
    const floatView = new Float32Array(buffer, 0, 4);
    floatView[0] = targetF32;
    floatView[1] = threshold;

    const sizeView = new Uint32Array(buffer, 16, 4);
    sizeView.set([K, batchCount, candidateCapacity, workgroupCount]);

    const countView = new Uint32Array(buffer, 32, 4);
    countView.set([
      calculator.constCodes.length,
      calculator.unaryCodes.length,
      calculator.binaryCodes.length,
      0,
    ]);
    return buffer;
  }

  private packFormData(
    form: RpnForm,
    calculator: CompiledCalculator,
    tileStart: bigint,
  ): Uint32Array<ArrayBuffer> {
    const words = new Uint32Array(FORM_WORDS);
    const baseDigits = indexToDigits(tileStart, form.radices);

    words.set(form.kinds, 0);
    words.set(form.radices, MAX_GPU_K);
    words.set(baseDigits, MAX_GPU_K * 2);
    words.set(calculator.constCodes, MAX_GPU_K * 3);
    words.set(calculator.unaryCodes, MAX_GPU_K * 3 + MAX_OPS_PER_KIND);
    words.set(calculator.binaryCodes, MAX_GPU_K * 3 + MAX_OPS_PER_KIND * 2);
    return words;
  }

  private ensureResources(candidateCapacity: number, groupCapacity: number): GPUResources {
    const existing = this.resources;
    if (
      existing &&
      existing.candidateCapacity >= candidateCapacity &&
      existing.groupCapacity >= groupCapacity
    ) {
      return existing;
    }

    this.destroyResources();
    const candidateBytes = candidateCapacity * RESULT_BYTES;
    const groupBytes = groupCapacity * RESULT_BYTES;
    const storageLimit = Math.min(
      this.info.maxStorageBufferBindingSize,
      this.info.maxBufferSize,
    );
    if (!Number.isSafeInteger(candidateBytes) || candidateBytes > storageLimit) {
      throw new RangeError('Candidate buffer exceeds the adapter storage-buffer limit.');
    }
    if (!Number.isSafeInteger(groupBytes) || groupBytes > storageLimit) {
      throw new RangeError('Workgroup-best buffer exceeds the adapter storage-buffer limit.');
    }

    const params = this.device.createBuffer({
      label: 'CR params',
      size: PARAM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const form = this.device.createBuffer({
      label: 'CR form and calculator',
      size: FORM_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const candidates = this.device.createBuffer({
      label: 'CR compacted candidates',
      size: candidateBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const state = this.device.createBuffer({
      label: 'CR candidate state',
      size: STATE_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    const groupBest = this.device.createBuffer({
      label: 'CR group best',
      size: groupBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const candidateReadback = this.device.createBuffer({
      label: 'CR candidate readback',
      size: candidateBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const stateReadback = this.device.createBuffer({
      label: 'CR state readback',
      size: STATE_BYTES,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const groupReadback = this.device.createBuffer({
      label: 'CR group readback',
      size: groupBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = this.device.createBindGroup({
      label: 'CR search bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: params } },
        { binding: 1, resource: { buffer: form } },
        { binding: 2, resource: { buffer: candidates } },
        { binding: 3, resource: { buffer: state } },
        { binding: 4, resource: { buffer: groupBest } },
      ],
    });

    this.resources = {
      candidateCapacity,
      groupCapacity,
      params,
      form,
      candidates,
      state,
      groupBest,
      candidateReadback,
      stateReadback,
      groupReadback,
      bindGroup,
    };
    return this.resources;
  }

  private destroyResources(): void {
    const resources = this.resources;
    if (!resources) return;
    resources.params.destroy();
    resources.form.destroy();
    resources.candidates.destroy();
    resources.state.destroy();
    resources.groupBest.destroy();
    resources.candidateReadback.destroy();
    resources.stateReadback.destroy();
    resources.groupReadback.destroy();
    this.resources = null;
  }
}
