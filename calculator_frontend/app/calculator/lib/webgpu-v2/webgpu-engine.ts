
import {
  CALC4_BINARY,
  CALC4_CONSTANTS,
  CALC4_UNARY,
  compileCalculator,
  FULL_CALC4,
  type CalculatorToken,
  type CompiledCalculator,
} from './calculator';
import { functionMeanSquaredError, multivariateMeanSquaredError } from '../search-contract';
import type { FunctionPoint, MultivariatePoint } from '../types';
import { absoluteError, evaluateCoreRPN, relativeError } from './cpu-verifier';
import { countValidForms, iterateValidForms } from './forms';
import { getCompressionRatio, isAcceptedCandidate } from './metrics';
import { decodeCombination, indexToDigits } from './mixed-radix';
import {
  MAX_GPU_K,
  MAX_GROUP_BEST_TO_VERIFY,
  MAX_OPS_PER_KIND,
  GPU_INTERMEDIATE_RESULT_FORMAT,
  GPU_SEARCH_STATE_FORMAT,
  RESULT_BYTES,
  type GPUBufferMetrics,
  type GPURecognizerInfo,
  type GPUProgress,
  type GPURanking,
  type GPUSelfTestSummary,
  type GPUSearchRequest,
  type GPUSearchSummary,
  type GPUTransferMetrics,
  type RawGPUCandidate,
  type RpnForm,
  type SearchStopReason,
  type VerifiedGPUResult,
} from './types';

const WORKGROUP_SIZE = 256;
const PARAM_BYTES = 64;
const STATE_BYTES = GPU_SEARCH_STATE_FORMAT.byteLength;
const DATA_POINT_BYTES = 16;
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
const DEFAULT_MAX_DEVICE_BUFFER_BYTES = 64 * 1024 * 1024;
const F32_EPSILON = 2 ** -23;
const SELF_TEST_TIMEOUT_MS = 5_000;

interface GPUResources {
  readonly candidateCapacity: number;
  readonly groupCapacity: number;
  readonly dataCapacity: number;
  readonly reducedCapacity: number;
  readonly params: GPUBuffer;
  readonly form: GPUBuffer;
  readonly candidates: GPUBuffer;
  readonly state: GPUBuffer;
  readonly groupBest: GPUBuffer;
  readonly dataPoints: GPUBuffer;
  readonly reducedBest: GPUBuffer;
  readonly candidateReadback: GPUBuffer;
  readonly stateReadback: GPUBuffer;
  readonly reducedReadback: GPUBuffer;
  readonly bindGroup: GPUBindGroup;
  readonly reductionBindGroup: GPUBindGroup;
  readonly footprint: GPUResourceFootprint;
  dataUploadId: number | null;
}

export interface GPUResourceFootprint {
  readonly storageBytes: number;
  readonly readbackBytes: number;
  readonly allocatedBytes: number;
}

export interface GPUBufferPlan extends GPUResourceFootprint {
  readonly candidateCapacity: number;
  readonly groupCapacity: number;
  readonly dataCapacity: number;
  readonly reducedCapacity: number;
}

interface MutableGPUTransferMetrics {
  dispatches: number;
  dataUploads: number;
  candidateReadbacks: number;
  cpuToGpuBytes: bigint;
  gpuToCpuBytes: bigint;
  peakStorageBytes: number;
  peakReadbackBytes: number;
  peakAllocatedBytes: number;
}

interface DispatchTransfer {
  readonly cpuToGpuBytes: number;
  readonly gpuToCpuBytes: number;
  readonly dataUploaded: boolean;
  readonly candidateReadback: boolean;
  readonly footprint: GPUResourceFootprint;
  readonly logicalCandidateCapacity: number;
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
  readonly functionPoints: readonly FunctionPoint[] | null;
  readonly multivariatePoints: readonly MultivariatePoint[] | null;
  readonly packedData: Float32Array<ArrayBuffer> | null;
  readonly dataUploadId: number;
  readonly candidateCapacity: number;
  readonly maxDeviceBufferBytes: number;
  readonly groupBestToVerify: number;
  readonly signal?: AbortSignal;
  readonly deadline: number;
  onDispatch: (count: number, depth: number) => void;
  onOverflow: () => void;
  onTransfer: (transfer: DispatchTransfer) => void;
  onCandidates: (
    form: RpnForm,
    tileStart: bigint,
    candidates: readonly RawGPUCandidate[],
    thresholdCandidateCount: number,
  ) => void;
}

export function estimateGPUResourceFootprint(
  candidateCapacity: number,
  groupCapacity: number,
  dataCapacity: number,
  reducedCapacity: number,
): GPUResourceFootprint {
  const candidateBytes = candidateCapacity * RESULT_BYTES;
  const groupBytes = groupCapacity * RESULT_BYTES;
  const dataBytes = dataCapacity * DATA_POINT_BYTES;
  const reducedBytes = reducedCapacity * RESULT_BYTES;
  const storageBytes = PARAM_BYTES + FORM_BYTES + candidateBytes + STATE_BYTES +
    groupBytes + dataBytes + reducedBytes;
  const readbackBytes = candidateBytes + STATE_BYTES + reducedBytes;
  return {
    storageBytes,
    readbackBytes,
    allocatedBytes: storageBytes + readbackBytes,
  };
}

function nextPowerOfTwo(value: number): number {
  if (value <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(value));
}

export function planGPUBufferCapacities({
  candidateCapacity,
  groupCapacity,
  dataCapacity,
  reducedCapacity,
  storageBufferLimit,
  maxAllocatedBytes,
}: {
  readonly candidateCapacity: number;
  readonly groupCapacity: number;
  readonly dataCapacity: number;
  readonly reducedCapacity: number;
  readonly storageBufferLimit: number;
  readonly maxAllocatedBytes: number;
}): GPUBufferPlan {
  for (const [value, label] of [
    [candidateCapacity, 'candidateCapacity'],
    [groupCapacity, 'groupCapacity'],
    [dataCapacity, 'dataCapacity'],
    [reducedCapacity, 'reducedCapacity'],
    [storageBufferLimit, 'storageBufferLimit'],
    [maxAllocatedBytes, 'maxAllocatedBytes'],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${label} must be a positive safe integer.`);
    }
  }

  const assertIndividualLimits = (capacities: readonly number[]): void => {
    const byteSizes = [
      capacities[0] * RESULT_BYTES,
      capacities[1] * RESULT_BYTES,
      capacities[2] * DATA_POINT_BYTES,
      capacities[3] * RESULT_BYTES,
    ];
    if (byteSizes.some(size => !Number.isSafeInteger(size) || size > storageBufferLimit)) {
      throw new RangeError('Requested GPU buffers exceed the adapter storage-buffer limit.');
    }
  };

  const requested = [candidateCapacity, groupCapacity, dataCapacity, reducedCapacity] as const;
  assertIndividualLimits(requested);
  let allocated = requested.map(nextPowerOfTwo) as [number, number, number, number];
  try {
    assertIndividualLimits(allocated);
  } catch {
    allocated = [...requested];
  }

  let footprint = estimateGPUResourceFootprint(...allocated);
  if (footprint.allocatedBytes > maxAllocatedBytes) {
    allocated = [...requested];
    footprint = estimateGPUResourceFootprint(...allocated);
  }
  if (footprint.allocatedBytes > maxAllocatedBytes) {
    throw new RangeError(
      `GPU buffer plan requires ${footprint.allocatedBytes} bytes, exceeding the ` +
      `${maxAllocatedBytes}-byte search budget.`,
    );
  }

  return {
    candidateCapacity: allocated[0],
    groupCapacity: allocated[1],
    dataCapacity: allocated[2],
    reducedCapacity: allocated[3],
    ...footprint,
  };
}

/** Streaming, sorted top-N store that never retains more than its configured capacity. */
export class BoundedResultBuffer<T> {
  private readonly retained: T[] = [];
  private discardedCount = 0;

  constructor(
    readonly capacity: number,
    private readonly compare: (left: T, right: T) => number,
  ) {
    validatePositiveInteger(capacity, 'BoundedResultBuffer capacity');
  }

  get size(): number {
    return this.retained.length;
  }

  get discarded(): number {
    return this.discardedCount;
  }

  push(value: T): void {
    let low = 0;
    let high = this.retained.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.compare(value, this.retained[middle]) < 0) high = middle;
      else low = middle + 1;
    }

    if (this.retained.length >= this.capacity && low >= this.capacity) {
      this.discardedCount++;
      return;
    }
    this.retained.splice(low, 0, value);
    if (this.retained.length > this.capacity) {
      this.retained.pop();
      this.discardedCount++;
    }
  }

  some(predicate: (value: T) => boolean): boolean {
    return this.retained.some(predicate);
  }

  snapshot(): T[] {
    return [...this.retained];
  }
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
  /** Run a real compute dispatch and readback before reporting the GPU as ready. */
  readonly runSelfTest?: boolean;
  readonly onDeviceLost?: (info: GPUDeviceLostInfo) => void;
}

export interface GPUSelfTestEvidence {
  readonly uniqueEvaluations: bigint;
  readonly dispatchedEvaluations: bigint;
  readonly results: readonly {
    readonly rpn: string;
    readonly accepted: boolean;
    readonly value: number;
    readonly gpuValue: number;
    readonly gpuRelativeError: number;
  }[];
}

export interface GPUOverflowRecoveryEvidence {
  readonly uniqueEvaluations: bigint;
  readonly dispatchedEvaluations: bigint;
  readonly overflowRetries: number;
  readonly results: readonly {
    readonly combinationIndex: bigint;
  }[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stageError(stage: string, error: unknown): Error {
  return new Error(`${stage}: ${errorMessage(error)}`);
}

export function assertGPUSelfTestEvidence(evidence: GPUSelfTestEvidence): number {
  const piResult = evidence.results.find(
    (result) => result.rpn === 'PI' && result.accepted,
  );
  if (
    evidence.uniqueEvaluations !== BigInt(1) ||
    evidence.dispatchedEvaluations < BigInt(1) ||
    !piResult ||
    piResult.value !== Math.PI ||
    Math.abs(piResult.gpuValue - Math.fround(Math.PI)) > 8 * F32_EPSILON ||
    piResult.gpuRelativeError > 8 * F32_EPSILON
  ) {
    throw new Error(
      `Unexpected readback (evaluated=${evidence.uniqueEvaluations.toString()}, ` +
      `dispatched=${evidence.dispatchedEvaluations.toString()}, ` +
      `cpu=${piResult?.value ?? 'missing'}, ` +
      `gpu=${piResult?.gpuValue ?? 'missing'}).`,
    );
  }
  return piResult.value;
}

export function assertGPUOverflowRecoveryEvidence(
  evidence: GPUOverflowRecoveryEvidence,
): void {
  const expectedCount = 13;
  const recoveredIndices = new Set(
    evidence.results.map((result) => result.combinationIndex.toString()),
  );
  const recoveredEveryIndex = Array.from(
    { length: expectedCount },
    (_, index) => recoveredIndices.has(String(index)),
  ).every(Boolean);

  if (
    evidence.uniqueEvaluations !== BigInt(expectedCount) ||
    evidence.dispatchedEvaluations <= evidence.uniqueEvaluations ||
    evidence.overflowRetries < 1 ||
    recoveredIndices.size !== expectedCount ||
    !recoveredEveryIndex
  ) {
    throw new Error(
      `Overflow recovery failed (evaluated=${evidence.uniqueEvaluations.toString()}, ` +
      `dispatched=${evidence.dispatchedEvaluations.toString()}, ` +
      `retries=${evidence.overflowRetries}, recovered=${recoveredIndices.size}/${expectedCount}).`,
    );
  }
}

interface ScientificParityExpectation {
  readonly tokens: readonly CalculatorToken[];
  readonly relativeTolerance?: number;
}

function assertScientificParityResults(
  summary: GPUSearchSummary,
  expectations: readonly ScientificParityExpectation[],
): number {
  for (const expectation of expectations) {
    const rpn = expectation.tokens.join(', ');
    const result = summary.results.find(candidate => candidate.rpn === rpn);
    const expected = evaluateCoreRPN(expectation.tokens);
    const tolerance = expectation.relativeTolerance ?? 5e-3;
    const scale = Math.max(1, Math.abs(expected));
    if (
      !result ||
      !Number.isFinite(expected) ||
      Math.abs(result.value - expected) > 64 * Number.EPSILON * scale ||
      Math.abs(result.gpuValue - expected) > tolerance * scale
    ) {
      throw new Error(
        `GPU/CPU parity failed for ${rpn} ` +
        `(expected=${expected}, cpu=${result?.value ?? 'missing'}, gpu=${result?.gpuValue ?? 'missing'}).`,
      );
    }
  }
  return expectations.length;
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
  private dataUploadGeneration = 0;
  private infoState: GPURecognizerInfo;

  private constructor(
    private readonly device: GPUDevice,
    private readonly pipeline: GPUComputePipeline,
    private readonly reductionPipeline: GPUComputePipeline,
    info: GPURecognizerInfo,
    onDeviceLost?: (info: GPUDeviceLostInfo) => void,
  ) {
    this.infoState = info;
    void device.lost.then((lostInfo) => {
      this.destroyed = true;
      this.resources = null;
      if (lostInfo.reason !== 'destroyed') onDeviceLost?.(lostInfo);
    });
  }

  get info(): GPURecognizerInfo {
    return this.infoState;
  }

  static async create(
    options: WebGPURecognizerCreateOptions = {},
  ): Promise<WebGPUConstantRecognizer> {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      throw new Error('WebGPU requires HTTPS or localhost.');
    }
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      throw new Error('This browser or graphics driver does not expose WebGPU.');
    }

    const powerPreference = options.powerPreference ?? 'high-performance';
    let adapter: GPUAdapter | null;
    try {
      adapter = await navigator.gpu.requestAdapter({ powerPreference });
      // Some hybrid-GPU systems reject an explicit preference even though a
      // default adapter is usable. Retry once without the hint.
      if (!adapter) adapter = await navigator.gpu.requestAdapter();
    } catch (error) {
      throw stageError('GPU adapter request failed', error);
    }
    if (!adapter) throw new Error('No WebGPU adapter was returned.');

    let device: GPUDevice;
    try {
      device = await adapter.requestDevice();
    } catch (error) {
      throw stageError('GPU device creation failed', error);
    }

    const failAndDestroy = (error: unknown): never => {
      device.destroy();
      throw error;
    };

    const maxInvocations = Number(device.limits.maxComputeInvocationsPerWorkgroup);
    const maxSizeX = Number(device.limits.maxComputeWorkgroupSizeX);
    if (maxInvocations < WORKGROUP_SIZE || maxSizeX < WORKGROUP_SIZE) {
      failAndDestroy(new Error(
        `The selected adapter supports only ${Math.min(maxInvocations, maxSizeX)} ` +
        `threads per workgroup; ${WORKGROUP_SIZE} are required by the shader.`,
      ));
    }
    const requiredWorkgroupBytes = WORKGROUP_SIZE * 4 * 4;
    if (Number(device.limits.maxComputeWorkgroupStorageSize) < requiredWorkgroupBytes) {
      failAndDestroy(new Error(`The shader requires ${requiredWorkgroupBytes} bytes of workgroup storage.`));
    }
    if (Number(device.limits.maxStorageBuffersPerShaderStage) < 5) {
      failAndDestroy(new Error('The shader requires five storage-buffer bindings.'));
    }

    const shaderUrl = resolveShaderUrl(
      options.shaderUrl ?? '/wasm/constant-recognition-v2.wgsl',
      options.basePath ?? '',
    );
    const response = await fetch(shaderUrl).catch((error: unknown) =>
      failAndDestroy(stageError('GPU shader download failed', error)),
    );
    if (!response.ok) {
      failAndDestroy(new Error(
        `Cannot load GPU shader ${shaderUrl} (${response.status} ${response.statusText}).`,
      ));
    }
    const shaderCode = await response.text().catch((error: unknown) =>
      failAndDestroy(stageError('GPU shader response could not be read', error)),
    );
    if (/^\s*</.test(shaderCode)) {
      failAndDestroy(new Error(`GPU shader URL ${shaderUrl} returned HTML instead of WGSL.`));
    }

    const shaderModule = device.createShaderModule({
      label: 'Constant Recognition FP32 screening shader',
      code: shaderCode,
    });
    const compilation = await shaderModule.getCompilationInfo().catch((error: unknown) =>
      failAndDestroy(stageError('WGSL compilation diagnostics failed', error)),
    );
    const errors = compilation.messages.filter((message) => message.type === 'error');
    if (errors.length > 0) {
      const details = errors
        .map((message) => `line ${message.lineNum}:${message.linePos} ${message.message}`)
        .join('\n');
      failAndDestroy(new Error(`WGSL compilation failed:\n${details}`));
    }

    device.pushErrorScope('validation');
    const pipeline = await device.createComputePipelineAsync({
      label: 'Constant Recognition search pipeline',
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'search' },
    }).catch((error: unknown) =>
      // If pipeline creation itself threw, device destruction safely discards
      // the still-active validation scope.
      failAndDestroy(stageError('GPU pipeline creation failed', error)),
    );
    const reductionPipeline = await device.createComputePipelineAsync({
      label: 'Constant Recognition best-candidate reduction pipeline',
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'reduce_group_best' },
    }).catch((error: unknown) =>
      failAndDestroy(stageError('GPU reduction pipeline creation failed', error)),
    );
    const pipelineValidationError = await device.popErrorScope().catch((error: unknown) =>
      failAndDestroy(stageError('GPU pipeline validation failed', error)),
    );
    if (pipelineValidationError) {
      failAndDestroy(new Error(
        `GPU pipeline validation failed: ${pipelineValidationError.message}`,
      ));
    }

    const adapterInfo = adapter.info;
    const adapterName = adapterInfo.description || adapterInfo.device || adapterInfo.vendor || 'WebGPU adapter';

    const recognizer = new WebGPUConstantRecognizer(device, pipeline, reductionPipeline, {
      supported: true,
      adapterName,
      selfTestPassed: false,
      overflowRecoveryPassed: false,
      scientificParityPassed: false,
      selfTestElapsedMs: 0,
      workgroupSize: WORKGROUP_SIZE,
      maxWorkgroupsPerDimension: Number(device.limits.maxComputeWorkgroupsPerDimension),
      maxStorageBufferBindingSize: Number(device.limits.maxStorageBufferBindingSize),
      maxBufferSize: Number(device.limits.maxBufferSize),
    }, options.onDeviceLost);

    if (options.runSelfTest ?? true) {
      try {
        await recognizer.runSelfTest();
      } catch (error) {
        recognizer.destroy();
        throw stageError('GPU compute self-test failed', error);
      }
    }

    return recognizer;
  }

  isReady(): boolean {
    return !this.destroyed && this.infoState.selfTestPassed;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.destroyResources();
    this.device.destroy();
  }

  /** Exercise every calculator opcode kind, both data modes, readback and overflow recovery. */
  async runSelfTest(): Promise<GPUSelfTestSummary> {
    if (this.destroyed) throw new Error('The WebGPU recognizer has been destroyed.');

    const selfTestStarted = nowMs();
    this.device.pushErrorScope('validation');
    let summary: GPUSearchSummary | null = null;
    let overflowSummary: GPUSearchSummary | null = null;
    let retentionSummary: GPUSearchSummary | null = null;
    let unarySummary: GPUSearchSummary | null = null;
    let atanhSummary: GPUSearchSummary | null = null;
    let binarySummary: GPUSearchSummary | null = null;
    let reductionSummary: GPUSearchSummary | null = null;
    let functionSummary: GPUSearchSummary | null = null;
    let multivariateSummary: GPUSearchSummary | null = null;
    let operationError: unknown = null;
    try {
      summary = await this.search({
        target: Math.PI,
        minK: 1,
        maxK: 1,
        calculator: { consts: ['PI'], funcs: [], ops: [] },
        screeningRelativeError: 1e-5,
        exactRelativeTolerance: 16 * Number.EPSILON,
        topN: 1,
        candidateCapacity: 8,
        maxDeviceBufferBytes: 768,
        tileInvocations: 1,
        groupBestToVerify: 1,
        maxEvaluations: BigInt(1),
        maxDurationMs: SELF_TEST_TIMEOUT_MS,
        stopAfterFirstAcceptedK: true,
      });

      // All 13 K=1 constants pass this deliberately broad screening threshold.
      // A one-slot logical candidate buffer must therefore overflow. The
      // production splitter reruns smaller, non-overflowing tiles, and the
      // assertion below proves that no combination index disappeared.
      overflowSummary = await this.search({
        target: Math.PI,
        minK: 1,
        maxK: 1,
        screeningRelativeError: 1e30,
        exactRelativeTolerance: 16 * Number.EPSILON,
        topN: 13,
        candidateCapacity: 1,
        tileInvocations: 13,
        groupBestToVerify: 0,
        maxEvaluations: BigInt(13),
        maxDurationMs: SELF_TEST_TIMEOUT_MS,
        stopAfterFirstAcceptedK: false,
      });

      retentionSummary = await this.search({
        target: Math.PI,
        minK: 1,
        maxK: 1,
        screeningRelativeError: 1e30,
        topN: 3,
        candidateCapacity: 13,
        tileInvocations: 13,
        groupBestToVerify: 0,
        maxEvaluations: BigInt(13),
        maxDurationMs: SELF_TEST_TIMEOUT_MS,
        stopAfterFirstAcceptedK: false,
      });

      // One dense tile covers every constant/unary pairing. Chosen reference
      // expressions exercise all 18 unary opcodes on valid real-domain inputs.
      unarySummary = await this.search({
        target: 1,
        minK: 2,
        maxK: 2,
        calculator: { consts: [...CALC4_CONSTANTS], funcs: [...CALC4_UNARY], ops: [] },
        screeningRelativeError: 1e30,
        topN: CALC4_CONSTANTS.length * CALC4_UNARY.length,
        candidateCapacity: CALC4_CONSTANTS.length * CALC4_UNARY.length,
        tileInvocations: CALC4_CONSTANTS.length * CALC4_UNARY.length,
        groupBestToVerify: 0,
        maxEvaluations: BigInt(CALC4_CONSTANTS.length * CALC4_UNARY.length),
        maxDurationMs: SELF_TEST_TIMEOUT_MS,
        stopAfterFirstAcceptedK: false,
      });

      // ARCTANH needs an input strictly inside (-1, 1), produced here as 1/2.
      atanhSummary = await this.search({
        target: 1,
        minK: 3,
        maxK: 3,
        calculator: { consts: ['TWO'], funcs: ['INV', 'ARCTANH'], ops: [] },
        screeningRelativeError: 1e30,
        topN: 4,
        candidateCapacity: 4,
        tileInvocations: 4,
        groupBestToVerify: 0,
        maxEvaluations: BigInt(4),
        maxDurationMs: SELF_TEST_TIMEOUT_MS,
        stopAfterFirstAcceptedK: false,
      });

      binarySummary = await this.search({
        target: 1,
        minK: 3,
        maxK: 3,
        calculator: { consts: [...CALC4_CONSTANTS], funcs: [], ops: [...CALC4_BINARY] },
        screeningRelativeError: 1e30,
        topN: CALC4_CONSTANTS.length ** 2 * CALC4_BINARY.length,
        candidateCapacity: CALC4_CONSTANTS.length ** 2 * CALC4_BINARY.length,
        tileInvocations: CALC4_CONSTANTS.length ** 2 * CALC4_BINARY.length,
        groupBestToVerify: 0,
        maxEvaluations: BigInt(CALC4_CONSTANTS.length ** 2 * CALC4_BINARY.length),
        maxDurationMs: SELF_TEST_TIMEOUT_MS,
        stopAfterFirstAcceptedK: false,
      });

      // Four workgroups with no threshold hit prove that the second pipeline
      // returns every globally reduced workgroup winner, not just group zero.
      reductionSummary = await this.search({
        target: 123_456.789,
        minK: 3,
        maxK: 3,
        calculator: { consts: [...CALC4_CONSTANTS], funcs: [], ops: [...CALC4_BINARY] },
        screeningRelativeError: 1e-12,
        topN: 4,
        candidateCapacity: 8,
        tileInvocations: CALC4_CONSTANTS.length ** 2 * CALC4_BINARY.length,
        groupBestToVerify: 4,
        maxEvaluations: BigInt(CALC4_CONSTANTS.length ** 2 * CALC4_BINARY.length),
        maxDurationMs: SELF_TEST_TIMEOUT_MS,
        stopAfterFirstAcceptedK: false,
      });

      functionSummary = await this.search({
        target: 0,
        minK: 2,
        maxK: 2,
        calculator: { consts: [], funcs: ['SQR', 'INV'], ops: [] },
        functionPoints: [
          { x: -2, y: 4, dy: 0 },
          { x: -1, y: 1, dy: 0.25 },
          { x: 1, y: 1, dy: 0 },
          { x: 2, y: 4, dy: 0 },
        ],
        functionErrorTolerance: 1e-12,
        topN: 2,
        candidateCapacity: 2,
        tileInvocations: 1,
        groupBestToVerify: 1,
        maxEvaluations: BigInt(2),
        maxDurationMs: SELF_TEST_TIMEOUT_MS,
        stopAfterFirstAcceptedK: false,
      });

      multivariateSummary = await this.search({
        target: 0,
        minK: 3,
        maxK: 3,
        calculator: { consts: [], funcs: [], ops: ['PLUS'] },
        multivariatePoints: [
          { c1: 1, c2: 2, y: 3, dy: 0 },
          { c1: -4, c2: 7, y: 3, dy: 0.5 },
          { c1: 8, c2: 5, y: 13, dy: 0 },
        ],
        functionErrorTolerance: 1e-12,
        topN: 4,
        candidateCapacity: 4,
        tileInvocations: 4,
        groupBestToVerify: 1,
        maxEvaluations: BigInt(4),
        maxDurationMs: SELF_TEST_TIMEOUT_MS,
        stopAfterFirstAcceptedK: true,
      });
      await this.device.queue.onSubmittedWorkDone();
    } catch (error) {
      operationError = error;
    }

    let validationError: GPUError | null = null;
    try {
      validationError = await this.device.popErrorScope();
    } catch (error) {
      operationError ??= error;
    }

    if (operationError) throw operationError;
    if (validationError) throw new Error(validationError.message);
    if (!summary) throw new Error('The self-test returned no summary.');
    if (!overflowSummary) throw new Error('The overflow self-test returned no summary.');
    if (!retentionSummary) throw new Error('The bounded-result self-test returned no summary.');
    if (!unarySummary || !atanhSummary || !binarySummary || !reductionSummary) {
      throw new Error('The arithmetic parity self-test returned no summary.');
    }
    if (!functionSummary || !multivariateSummary) {
      throw new Error('The scientific data-mode self-test returned no summary.');
    }

    const resultValue = assertGPUSelfTestEvidence(summary);
    assertGPUOverflowRecoveryEvidence(overflowSummary);
    if (
      summary.buffers.peakTileCandidateCapacity !== 1 ||
      summary.transfers.peakAllocatedBytes !== 768 ||
      retentionSummary.buffers.peakTileCandidateCapacity !== 13 ||
      retentionSummary.buffers.peakThresholdCandidates !== 13 ||
      retentionSummary.buffers.forwardedCandidates !== 13 ||
      retentionSummary.buffers.verifiedCandidates !== 13 ||
      retentionSummary.buffers.retainedResults !== 3 ||
      retentionSummary.buffers.discardedVerifiedResults !== 10 ||
      retentionSummary.results.length !== 3
    ) {
      throw new Error(
        `Bounded GPU/CPU buffer self-test failed ` +
        `(tile=${summary.buffers.peakTileCandidateCapacity}, ` +
        `allocation=${summary.transfers.peakAllocatedBytes}, ` +
        `retained=${retentionSummary.buffers.retainedResults}, ` +
        `discarded=${retentionSummary.buffers.discardedVerifiedResults}).`,
      );
    }
    let parityCases = 0;
    parityCases += assertScientificParityResults(overflowSummary, CALC4_CONSTANTS.map(token => ({
      tokens: [token],
      relativeTolerance: 1e-5,
    })));
    parityCases += assertScientificParityResults(unarySummary, [
      { tokens: ['TWO', 'LOG'] },
      { tokens: ['TWO', 'EXP'] },
      { tokens: ['TWO', 'INV'] },
      { tokens: ['FIVE', 'GAMMA'], relativeTolerance: 1e-2 },
      { tokens: ['FOUR', 'SQRT'] },
      { tokens: ['THREE', 'SQR'] },
      { tokens: ['ONE', 'SIN'] },
      { tokens: ['ONE', 'ARCSIN'] },
      { tokens: ['ONE', 'COS'] },
      { tokens: ['ONE', 'ARCCOS'] },
      { tokens: ['ONE', 'TAN'] },
      { tokens: ['ONE', 'ARCTAN'] },
      { tokens: ['ONE', 'SINH'] },
      { tokens: ['ONE', 'ARCSINH'] },
      { tokens: ['ONE', 'COSH'] },
      { tokens: ['TWO', 'ARCCOSH'] },
      { tokens: ['ONE', 'TANH'] },
    ]);
    parityCases += assertScientificParityResults(atanhSummary, [
      { tokens: ['TWO', 'INV', 'ARCTANH'] },
    ]);
    parityCases += assertScientificParityResults(binarySummary, [
      { tokens: ['ONE', 'TWO', 'PLUS'] },
      { tokens: ['TWO', 'THREE', 'TIMES'] },
      { tokens: ['TWO', 'THREE', 'SUBTRACT'] },
      { tokens: ['TWO', 'FOUR', 'DIVIDE'] },
      { tokens: ['TWO', 'THREE', 'POWER'] },
    ]);

    const reducedGroups = new Set(reductionSummary.results.map(result =>
      Number(result.combinationIndex / BigInt(WORKGROUP_SIZE))
    ));
    if (
      reductionSummary.uniqueEvaluations !== BigInt(845) ||
      reductionSummary.results.length !== 4 ||
      reductionSummary.results.some(result => result.source !== 'group-best') ||
      reducedGroups.size !== 4 ||
      reductionSummary.transfers.dispatches !== 1 ||
      reductionSummary.transfers.gpuToCpuBytes !== BigInt(80) ||
      reductionSummary.transfers.dataUploads !== 0 ||
      reductionSummary.transfers.candidateReadbacks !== 0
    ) {
      throw new Error(
        `GPU reduction/transfer self-test failed ` +
        `(results=${reductionSummary.results.length}, groups=${reducedGroups.size}, ` +
        `readback=${reductionSummary.transfers.gpuToCpuBytes.toString()} bytes).`,
      );
    }
    parityCases += 1;

    const functionResult = functionSummary.results.find(result =>
      result.rpn === 'x, SQR' && result.accepted && result.relativeError === 0,
    );
    const multivariateResult = multivariateSummary.results.find(result =>
      (result.rpn === 'C1, C2, PLUS' || result.rpn === 'C2, C1, PLUS') &&
      result.accepted && result.relativeError === 0,
    );
    const expectedFunctionUploadBytes = BigInt(2 * (PARAM_BYTES + FORM_BYTES + STATE_BYTES) + 4 * DATA_POINT_BYTES);
    if (
      !functionResult ||
      functionSummary.transfers.dispatches !== 2 ||
      functionSummary.transfers.dataUploads !== 1 ||
      functionSummary.transfers.cpuToGpuBytes !== expectedFunctionUploadBytes ||
      !multivariateResult
    ) {
      throw new Error(
        `Scientific GPU modes failed (f(x)=${functionResult ? 'ok' : 'missing'}, ` +
        `data uploads=${functionSummary.transfers.dataUploads}, ` +
        `F(C1,C2)=${multivariateResult ? 'ok' : 'missing'}).`,
      );
    }
    parityCases += 2;
    const elapsedMs = nowMs() - selfTestStarted;

    this.infoState = {
      ...this.infoState,
      selfTestPassed: true,
      overflowRecoveryPassed: true,
      scientificParityPassed: true,
      selfTestElapsedMs: elapsedMs,
    };

    return {
      elapsedMs,
      uniqueEvaluations: summary.uniqueEvaluations,
      dispatchedEvaluations: summary.dispatchedEvaluations,
      overflowRecoveryDispatchedEvaluations: overflowSummary.dispatchedEvaluations,
      overflowRetries: overflowSummary.overflowRetries,
      resultValue,
      parityCases,
    };
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

    const functionPoints = request.functionPoints ? [...request.functionPoints] : null;
    const multivariatePoints = request.multivariatePoints ? [...request.multivariatePoints] : null;
    if (functionPoints && multivariatePoints) {
      throw new RangeError('Choose either one-variable or two-variable function data, not both.');
    }
    if (functionPoints) {
      if (functionPoints.length < 2) {
        throw new RangeError('Function recognition requires at least two data points.');
      }
      for (const point of functionPoints) {
        if (![point.x, point.y, point.dy].every(Number.isFinite) || point.dy < 0) {
          throw new RangeError('Function data must be finite and dy must be non-negative.');
        }
        const values = [point.x, point.y, point.dy];
        const pointF32 = values.map(Math.fround);
        if (!pointF32.every(Number.isFinite) || values.some((value, index) =>
          value !== 0 && pointF32[index] === 0
        )) {
          throw new RangeError('Function data must remain finite and non-zero when represented in FP32.');
        }
      }
    }

    if (multivariatePoints) {
      if (multivariatePoints.length < 3) {
        throw new RangeError('Two-variable recognition requires at least three data points.');
      }
      for (const point of multivariatePoints) {
        if (![point.c1, point.c2, point.y, point.dy].every(Number.isFinite) || point.dy < 0) {
          throw new RangeError('Two-variable data must be finite and dy must be non-negative.');
        }
        const values = [point.c1, point.c2, point.y, point.dy];
        const pointF32 = values.map(Math.fround);
        if (!pointF32.every(Number.isFinite) || values.some((value, index) =>
          value !== 0 && pointF32[index] === 0
        )) {
          throw new RangeError('Two-variable data must remain finite and non-zero when represented in FP32.');
        }
      }
    }

    const calculator = compileCalculator(functionPoints
      ? { ...(request.calculator ?? FULL_CALC4), variables: ['x'] }
      : multivariatePoints
        ? { ...(request.calculator ?? FULL_CALC4), variables: ['C1', 'C2'] }
        : request.calculator);
    const instructionCount =
      calculator.constCodes.length + calculator.variableNames.length +
      calculator.unaryCodes.length + calculator.binaryCodes.length;

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
    if (requestedGroupBest > MAX_GROUP_BEST_TO_VERIFY) {
      throw new RangeError(
        `groupBestToVerify cannot exceed the GPU reduction limit of ${MAX_GROUP_BEST_TO_VERIFY}.`,
      );
    }
    const groupBestToVerify = requestedGroupBest;
    const topN = validatePositiveInteger(request.topN ?? DEFAULT_TOP_N, 'topN');
    const maxDeviceBufferBytes = validatePositiveInteger(
      request.maxDeviceBufferBytes ?? DEFAULT_MAX_DEVICE_BUFFER_BYTES,
      'maxDeviceBufferBytes',
    );
    const maximumTileWorkgroups = Math.ceil(tileInvocations / WORKGROUP_SIZE);
    const maximumGroupCapacity = groupBestToVerify > 0 ? maximumTileWorkgroups : 1;
    const maximumReducedCapacity = Math.max(
      Math.min(groupBestToVerify, maximumTileWorkgroups),
      1,
    );
    const dataCapacity = Math.max(
      functionPoints?.length ?? multivariatePoints?.length ?? 1,
      1,
    );
    // Fail before the first dispatch, so a late larger tile cannot invalidate
    // otherwise useful results by discovering an impossible allocation plan.
    planGPUBufferCapacities({
      candidateCapacity: Math.min(candidateCapacity, tileInvocations),
      groupCapacity: maximumGroupCapacity,
      dataCapacity,
      reducedCapacity: maximumReducedCapacity,
      storageBufferLimit: maximumStorageBytes,
      maxAllocatedBytes: maxDeviceBufferBytes,
    });

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

    const targetQuantization = functionPoints || multivariatePoints
      ? 0
      : relativeError(targetF32, request.target);
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
    const functionErrorTolerance = request.functionErrorTolerance ?? 1e-12;
    for (const [value, label] of [
      [exactTolerance, 'exactRelativeTolerance'],
      [absoluteTolerance, 'absoluteTolerance'],
      [compressionRatioThreshold, 'compressionRatioThreshold'],
      [functionErrorTolerance, 'functionErrorTolerance'],
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
    const resultBuffer = new BoundedResultBuffer<VerifiedGPUResult>(topN, resultComparator);
    let uniqueEvaluations = BigInt(0);
    let dispatchedEvaluations = BigInt(0);
    let completedThroughK = minK - 1;
    let stopReason: SearchStopReason = 'completed';
    let verifiedCandidates = 0;
    let overflowRetries = 0;
    let peakTileCandidateCapacity = 0;
    let peakThresholdCandidates = 0;
    let forwardedCandidates = 0;
    const transferMetrics: MutableGPUTransferMetrics = {
      dispatches: 0,
      dataUploads: 0,
      candidateReadbacks: 0,
      cpuToGpuBytes: BigInt(0),
      gpuToCpuBytes: BigInt(0),
      peakStorageBytes: 0,
      peakReadbackBytes: 0,
      peakAllocatedBytes: 0,
    };

    const verifyCandidates = (
      form: RpnForm,
      tileStart: bigint,
      rawCandidates: readonly RawGPUCandidate[],
      thresholdCandidateCount: number,
    ): void => {
      peakThresholdCandidates = Math.max(peakThresholdCandidates, thresholdCandidateCount);
      forwardedCandidates += rawCandidates.length;
      for (const raw of rawCandidates) {
        const combinationIndex = tileStart + BigInt(raw.localIndex);
        if (combinationIndex >= form.totalCombinations) continue;

        const tokens = decodeCombination(form, calculator, combinationIndex);
        const rpn = tokens.join(', ');

        let value: number;
        let absError: number;
        let relError: number;
        try {
          if (multivariatePoints) {
            const values = multivariatePoints.map(point => evaluateCoreRPN(tokens, {
              C1: point.c1,
              C2: point.c2,
            }));
            value = values[0];
            relError = multivariateMeanSquaredError(values, multivariatePoints);
            absError = relError;
          } else if (functionPoints) {
            const values = functionPoints.map(point => evaluateCoreRPN(tokens, point.x));
            value = values[0];
            relError = functionMeanSquaredError(values, functionPoints);
            absError = relError;
          } else {
            value = verifier(tokens);
            absError = absoluteError(value, request.target);
            relError = relativeError(value, request.target);
          }
        } catch {
          continue;
        }
        if (!Number.isFinite(value) || !Number.isFinite(relError)) continue;

        verifiedCandidates++;
        const cr = getCompressionRatio(relError, form.K, instructionCount);
        const accepted = functionPoints || multivariatePoints
          ? relError <= functionErrorTolerance
          : isAcceptedCandidate({
              relativeError: relError,
              absoluteError: absError,
              compressionRatio: cr,
              exactRelativeTolerance: exactTolerance,
              absoluteTolerance,
              compressionRatioThreshold,
            });

        resultBuffer.push({
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
      functionPoints,
      multivariatePoints,
      packedData: functionPoints || multivariatePoints
        ? this.packFunctionData(functionPoints, multivariatePoints)
        : null,
      dataUploadId: ++this.dataUploadGeneration,
      candidateCapacity,
      maxDeviceBufferBytes,
      groupBestToVerify,
      signal: request.signal,
      deadline,
      onDispatch: (count, depth) => {
        transferMetrics.dispatches++;
        dispatchedEvaluations += BigInt(count);
        if (depth === 0) uniqueEvaluations += BigInt(count);
      },
      onOverflow: () => {
        overflowRetries++;
      },
      onTransfer: (transfer) => {
        transferMetrics.cpuToGpuBytes += BigInt(transfer.cpuToGpuBytes);
        transferMetrics.gpuToCpuBytes += BigInt(transfer.gpuToCpuBytes);
        transferMetrics.dataUploads += transfer.dataUploaded ? 1 : 0;
        transferMetrics.candidateReadbacks += transfer.candidateReadback ? 1 : 0;
        transferMetrics.peakStorageBytes = Math.max(
          transferMetrics.peakStorageBytes,
          transfer.footprint.storageBytes,
        );
        transferMetrics.peakReadbackBytes = Math.max(
          transferMetrics.peakReadbackBytes,
          transfer.footprint.readbackBytes,
        );
        transferMetrics.peakAllocatedBytes = Math.max(
          transferMetrics.peakAllocatedBytes,
          transfer.footprint.allocatedBytes,
        );
        peakTileCandidateCapacity = Math.max(
          peakTileCandidateCapacity,
          transfer.logicalCandidateCapacity,
        );
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

            acceptedAtThisK = acceptedAtThisK || resultBuffer.some(
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
              overflowRetries,
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
      results: resultBuffer.snapshot(),
      uniqueEvaluations,
      dispatchedEvaluations,
      elapsedMs: nowMs() - started,
      completedThroughK,
      overflowRetries,
      transfers: {
        ...transferMetrics,
      } satisfies GPUTransferMetrics,
      buffers: {
        intermediateRecordBytes: GPU_INTERMEDIATE_RESULT_FORMAT.byteLength,
        configuredCandidateCapacity: candidateCapacity,
        peakTileCandidateCapacity,
        peakThresholdCandidates,
        forwardedCandidates,
        verifiedCandidates,
        retainedResults: resultBuffer.size,
        discardedVerifiedResults: resultBuffer.discarded,
        maxDeviceBufferBytes,
      } satisfies GPUBufferMetrics,
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
      context.onOverflow();
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
    context.onCandidates(
      form,
      tileStart,
      [...deduplicated.values()],
      dispatched.thresholdCandidates.length,
    );
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

    const dataCapacity = Math.max(
      context.functionPoints?.length ?? context.multivariatePoints?.length ?? 1,
      1,
    );
    const bestCount = Math.min(context.groupBestToVerify, workgroupCount);
    const groupCapacity = bestCount > 0 ? workgroupCount : 1;
    // A tile cannot emit more records than it evaluates. Keeping the user's
    // larger ceiling as a configuration limit must not reserve unused memory.
    const logicalCandidateCapacity = Math.min(context.candidateCapacity, batchCount);
    const resources = this.ensureResources(
      logicalCandidateCapacity,
      groupCapacity,
      dataCapacity,
      Math.max(bestCount, 1),
      context.maxDeviceBufferBytes,
    );
    this.assertReadbackBuffersAreUnmapped(resources);
    const formWords = this.packFormData(form, context.calculator, tileStart);
    const params = this.packParams(
      context.targetF32,
      context.screeningRelativeError,
      form.K,
      batchCount,
      logicalCandidateCapacity,
      workgroupCount,
      context.calculator,
      context.functionPoints,
      context.multivariatePoints,
      bestCount,
    );

    this.device.queue.writeBuffer(resources.params, 0, params);
    this.device.queue.writeBuffer(resources.form, 0, formWords);
    this.device.queue.writeBuffer(resources.state, 0, new Uint32Array(4));
    let dataUploaded = false;
    if (context.packedData && resources.dataUploadId !== context.dataUploadId) {
      this.device.queue.writeBuffer(resources.dataPoints, 0, context.packedData);
      resources.dataUploadId = context.dataUploadId;
      dataUploaded = true;
    }

    const encoder = this.device.createCommandEncoder({ label: 'Constant Recognition tile' });
    const pass = encoder.beginComputePass({ label: 'FP32 candidate screening' });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, resources.bindGroup);
    pass.dispatchWorkgroups(workgroupCount);
    pass.end();
    if (bestCount > 0) {
      const reductionPass = encoder.beginComputePass({ label: 'Reduce workgroup candidates' });
      reductionPass.setPipeline(this.reductionPipeline);
      reductionPass.setBindGroup(0, resources.reductionBindGroup);
      reductionPass.dispatchWorkgroups(1);
      reductionPass.end();
    }
    encoder.copyBufferToBuffer(resources.state, 0, resources.stateReadback, 0, STATE_BYTES);
    if (bestCount > 0) {
      encoder.copyBufferToBuffer(
        resources.reducedBest,
        0,
        resources.reducedReadback,
        0,
        bestCount * RESULT_BYTES,
      );
    }
    this.device.queue.submit([encoder.finish()]);
    context.onDispatch(batchCount, depth);
    context.onTransfer({
      cpuToGpuBytes: PARAM_BYTES + FORM_BYTES + STATE_BYTES +
        (dataUploaded ? context.packedData?.byteLength ?? 0 : 0),
      gpuToCpuBytes: STATE_BYTES + bestCount * RESULT_BYTES,
      dataUploaded,
      candidateReadback: false,
      footprint: resources.footprint,
      logicalCandidateCapacity,
    });

    let stateMapped = false;
    let reducedMapped = false;
    try {
      const mappings: Promise<void>[] = [
        resources.stateReadback.mapAsync(GPUMapMode.READ, 0, STATE_BYTES).then(() => { stateMapped = true; }),
      ];
      if (bestCount > 0) {
        mappings.push(resources.reducedReadback
          .mapAsync(GPUMapMode.READ, 0, bestCount * RESULT_BYTES)
          .then(() => { reducedMapped = true; }));
      }
      // Wait for every mapping attempt even if one rejects. Otherwise the
      // surviving promise could map its buffer after this frame has already
      // left the try/finally block, leaking a mapped staging buffer into the
      // next dispatch.
      const mappingResults = await Promise.allSettled(mappings);
      const mappingFailure = mappingResults.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      if (mappingFailure) throw mappingFailure.reason;
      throwIfAborted(context.signal);

      const stateView = new DataView(resources.stateReadback.getMappedRange(0, STATE_BYTES));
      const candidateCount = stateView.getUint32(
        GPU_SEARCH_STATE_FORMAT.candidateCountOffset,
        true,
      );
      const overflowFlag = stateView.getUint32(GPU_SEARCH_STATE_FORMAT.overflowOffset, true);
      const overflow = overflowFlag !== 0 || candidateCount > logicalCandidateCapacity;

      const groupBest = bestCount > 0
        ? this.parseCandidates(
            resources.reducedReadback.getMappedRange(0, bestCount * RESULT_BYTES),
            bestCount,
            batchCount,
            'group-best',
          )
        : [];

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
      if (reducedMapped) {
        resources.reducedReadback.unmap();
        reducedMapped = false;
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
      context.onTransfer({
        cpuToGpuBytes: 0,
        gpuToCpuBytes: resultBytes,
        dataUploaded: false,
        candidateReadback: true,
        footprint: resources.footprint,
        logicalCandidateCapacity,
      });
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
      if (reducedMapped) resources.reducedReadback.unmap();
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
      const offset = i * GPU_INTERMEDIATE_RESULT_FORMAT.byteLength;
      const localIndex = view.getUint32(
        offset + GPU_INTERMEDIATE_RESULT_FORMAT.localIndexOffset,
        true,
      );
      const gpuRelativeError = view.getFloat32(
        offset + GPU_INTERMEDIATE_RESULT_FORMAT.gpuRelativeErrorOffset,
        true,
      );
      const gpuValue = view.getFloat32(
        offset + GPU_INTERMEDIATE_RESULT_FORMAT.gpuValueOffset,
        true,
      );
      const flags = view.getUint32(
        offset + GPU_INTERMEDIATE_RESULT_FORMAT.flagsOffset,
        true,
      );

      if (
        flags === GPU_INTERMEDIATE_RESULT_FORMAT.validFlag &&
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
    functionPoints: readonly FunctionPoint[] | null,
    multivariatePoints: readonly MultivariatePoint[] | null,
    groupBestCount: number,
  ): ArrayBuffer {
    const buffer = new ArrayBuffer(PARAM_BYTES);
    const floatView = new Float32Array(buffer, 0, 4);
    floatView[0] = targetF32;
    floatView[1] = threshold;

    const sizeView = new Uint32Array(buffer, 16, 4);
    sizeView.set([K, batchCount, candidateCapacity, workgroupCount]);

    const countView = new Uint32Array(buffer, 32, 4);
    countView.set([
      calculator.constCodes.length + calculator.variableNames.length,
      calculator.unaryCodes.length,
      calculator.binaryCodes.length,
      calculator.constCodes.length,
    ]);

    const searchView = new Uint32Array(buffer, 48, 4);
    const mode = functionPoints ? 1 : multivariatePoints ? 2 : 0;
    const pointCount = functionPoints?.length ?? multivariatePoints?.length ?? 1;
    searchView.set([mode, pointCount, groupBestCount, groupBestCount > 0 ? 1 : 0]);
    return buffer;
  }

  private packFunctionData(
    functionPoints: readonly FunctionPoint[] | null,
    multivariatePoints: readonly MultivariatePoint[] | null,
  ): Float32Array<ArrayBuffer> {
    const count = functionPoints?.length ?? multivariatePoints?.length ?? 0;
    const packed = new Float32Array(count * 4);
    for (let index = 0; index < count; index++) {
      const offset = index * 4;
      if (multivariatePoints) {
        packed[offset] = Math.fround(multivariatePoints[index].c1);
        packed[offset + 1] = Math.fround(multivariatePoints[index].c2);
        packed[offset + 2] = Math.fround(multivariatePoints[index].y);
        packed[offset + 3] = Math.fround(multivariatePoints[index].dy);
      } else if (functionPoints) {
        packed[offset] = Math.fround(functionPoints[index].x);
        packed[offset + 2] = Math.fround(functionPoints[index].y);
        packed[offset + 3] = Math.fround(functionPoints[index].dy);
      }
    }
    return packed;
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

  private ensureResources(
    candidateCapacity: number,
    groupCapacity: number,
    dataCapacity: number,
    reducedCapacity: number,
    maxAllocatedBytes: number,
  ): GPUResources {
    const existing = this.resources;
    if (existing) this.assertReadbackBuffersAreUnmapped(existing);
    if (
      existing &&
      existing.candidateCapacity >= candidateCapacity &&
      existing.groupCapacity >= groupCapacity &&
      existing.dataCapacity >= dataCapacity &&
      existing.reducedCapacity >= reducedCapacity &&
      existing.footprint.allocatedBytes <= maxAllocatedBytes
    ) {
      return existing;
    }

    const storageLimit = Math.min(
      this.info.maxStorageBufferBindingSize,
      this.info.maxBufferSize,
    );
    const plan = planGPUBufferCapacities({
      candidateCapacity,
      groupCapacity,
      dataCapacity,
      reducedCapacity,
      storageBufferLimit: storageLimit,
      maxAllocatedBytes,
    });
    const candidateBytes = plan.candidateCapacity * RESULT_BYTES;
    const groupBytes = plan.groupCapacity * RESULT_BYTES;
    const dataBytes = plan.dataCapacity * DATA_POINT_BYTES;
    const reducedBytes = plan.reducedCapacity * RESULT_BYTES;

    // Dispatches are strictly sequential and every mapped range is copied to
    // JS before this point. Destroying the old set here cannot invalidate an
    // in-flight readback and avoids a double-allocation memory spike.
    this.destroyResources();
    const createdBuffers: GPUBuffer[] = [];
    const createBuffer = (descriptor: GPUBufferDescriptor): GPUBuffer => {
      const buffer = this.device.createBuffer(descriptor);
      createdBuffers.push(buffer);
      return buffer;
    };

    try {
      const params = createBuffer({
        label: 'CR params', size: PARAM_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const form = createBuffer({
        label: 'CR form and calculator', size: FORM_BYTES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      const candidates = createBuffer({
        label: 'CR compacted candidates', size: candidateBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
      const state = createBuffer({
        label: 'CR candidate state', size: STATE_BYTES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
      const groupBest = createBuffer({
        label: 'CR group best', size: groupBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
      const dataPoints = createBuffer({
        label: 'CR function data points', size: dataBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      const reducedBest = createBuffer({
        label: 'CR globally reduced best candidates', size: reducedBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
      const candidateReadback = createBuffer({
        label: 'CR candidate readback', size: candidateBytes,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      const stateReadback = createBuffer({
        label: 'CR state readback', size: STATE_BYTES,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      const reducedReadback = createBuffer({
        label: 'CR reduced-best readback', size: reducedBytes,
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
          { binding: 5, resource: { buffer: dataPoints } },
        ],
      });
      const reductionBindGroup = this.device.createBindGroup({
        label: 'CR best-candidate reduction bind group',
        layout: this.reductionPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: params } },
          { binding: 4, resource: { buffer: groupBest } },
          { binding: 6, resource: { buffer: reducedBest } },
        ],
      });

      this.resources = {
        candidateCapacity: plan.candidateCapacity,
        groupCapacity: plan.groupCapacity,
        dataCapacity: plan.dataCapacity,
        reducedCapacity: plan.reducedCapacity,
        params, form, candidates, state, groupBest, dataPoints, reducedBest,
        candidateReadback, stateReadback, reducedReadback,
        bindGroup, reductionBindGroup,
        footprint: plan,
        dataUploadId: null,
      };
      return this.resources;
    } catch (error) {
      for (const buffer of createdBuffers) buffer.destroy();
      this.resources = null;
      throw stageError('GPU buffer allocation failed', error);
    }
  }

  private assertReadbackBuffersAreUnmapped(resources: GPUResources): void {
    const mapped = [
      resources.candidateReadback,
      resources.stateReadback,
      resources.reducedReadback,
    ].find(buffer => buffer.mapState !== 'unmapped');
    if (mapped) {
      throw new Error(
        `GPU buffer lifecycle violation: ${mapped.label || 'readback buffer'} is ${mapped.mapState}.`,
      );
    }
  }

  private destroyResources(): void {
    const resources = this.resources;
    if (!resources) return;
    resources.params.destroy();
    resources.form.destroy();
    resources.candidates.destroy();
    resources.state.destroy();
    resources.groupBest.destroy();
    resources.dataPoints.destroy();
    resources.reducedBest.destroy();
    resources.candidateReadback.destroy();
    resources.stateReadback.destroy();
    resources.reducedReadback.destroy();
    this.resources = null;
  }
}
