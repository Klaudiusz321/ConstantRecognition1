/**
 * WebGPU Compute Engine for Constant Recognition.
 */

import { GPUBufferUsage, GPUMapMode } from './types';
import type { GPUInfo, GPUSearchResult, FormDescriptor, Candidate, SearchOptions } from './types';
import {
  ComplexNumber,
  SearchDomain,
  evaluateShortRPN,
  evaluateShortRPNComplex,
  indexToRPN,
} from './rpn-evaluator';
import { generateValidForms } from './form-generator';

const withBasePath = (path: string) => {
  const base = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/+$/g, '') ?? '';
  const normalizedBase = base ? (base.startsWith('/') ? base : `/${base}`) : '';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (typeof window === 'undefined') return `${normalizedBase}${normalizedPath}`;
  return new URL(`${normalizedBase}${normalizedPath}`, window.location.origin).toString();
};

const shaderPathForDomain = (domain: SearchDomain) =>
  domain === 'complex' ? '/wasm/rpn_complex_shader.wgsl' : '/wasm/rpn_shader.wgsl';

const targetMagnitude = (target: number | ComplexNumber) =>
  typeof target === 'number' ? Math.abs(target) : Math.hypot(target.real, target.imag);

const complexDistance = (a: ComplexNumber, b: ComplexNumber) =>
  Math.hypot(a.real - b.real, a.imag - b.imag);

const finiteComplex = (z: ComplexNumber) => Number.isFinite(z.real) && Number.isFinite(z.imag);

export class ConstantRecognitionGPU {
  private device: GPUDevice | null = null;
  private pipelines: Partial<Record<SearchDomain, GPUComputePipeline>> = {};
  private shaderModules: Partial<Record<SearchDomain, GPUShaderModule>> = {};
  private initialized = false;

  async init(): Promise<GPUInfo> {
    if (!navigator.gpu) {
      return { supported: false, name: '', error: 'WebGPU not supported' };
    }

    try {
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
      });

      if (!adapter) {
        return { supported: false, name: '', error: 'No GPU adapter found' };
      }

      this.device = await adapter.requestDevice({
        requiredLimits: {
          maxStorageBufferBindingSize: 1024 * 1024 * 64,
          maxBufferSize: 1024 * 1024 * 64,
        },
      });

      this.device.lost.then((info) => {
        console.error('[WebGPU] Device lost:', info.message);
        this.initialized = false;
        this.device = null;
        this.pipelines = {};
        this.shaderModules = {};
      });

      this.initialized = true;

      let gpuName = 'WebGPU Device';
      try {
        if (typeof adapter.requestAdapterInfo === 'function') {
          const info = await adapter.requestAdapterInfo();
          gpuName = info.description || info.device || info.vendor || 'WebGPU Device';
        } else if (typeof adapter.name === 'string' && adapter.name.length > 0) {
          gpuName = adapter.name;
        }
      } catch (e) {
        console.warn('[WebGPU] Could not get adapter info:', e);
      }

      return { supported: true, name: gpuName };
    } catch (err) {
      return {
        supported: false,
        name: '',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  isReady(): boolean {
    return this.initialized && this.device !== null;
  }

  async search(target: number | ComplexNumber, options: SearchOptions = {}): Promise<GPUSearchResult[]> {
    if (!this.isReady()) {
      throw new Error('WebGPU not initialized');
    }

    const { minK = 1, maxK = 7, onProgress, onResult, domain = 'real' } = options;
    const pipeline = await this.getPipeline(domain);

    console.log('[GPU] Search params - target:', target, 'domain:', domain, 'minK:', minK, 'maxK:', maxK);

    const relativeThreshold = domain === 'complex' ? 2e-4 : 1e-4;
    const magnitude = Math.max(targetMagnitude(target), 1.0);
    const threshold = relativeThreshold * magnitude;

    const allCandidates: Candidate[] = [];
    let totalEvaluated = 0;

    for (let K = minK; K <= maxK; K++) {
      const forms = generateValidForms(K, domain);

      if (onProgress) {
        onProgress({ K, forms: forms.length, evaluated: totalEvaluated });
      }

      for (const form of forms) {
        const candidates = await this.evaluateForm(target, threshold, K, form, pipeline, domain);
        totalEvaluated += form.totalCombinations;

        for (const c of candidates) {
          const rpn = indexToRPN(c.idx, c.form, c.radix, c.K, domain);
          const fp64Error = this.verifyCandidateError(rpn, target, domain);

          if (!Number.isFinite(fp64Error)) continue;

          c.error = fp64Error;
          allCandidates.push(c);
        }
      }
    }

    allCandidates.sort((a, b) => {
      const errorDiff = a.error - b.error;
      if (Math.abs(errorDiff) > 1e-15) return errorDiff;
      return a.K - b.K;
    });

    const seenValues = new Map<string, boolean>();
    const uniqueCandidates = allCandidates.filter((c) => {
      const rpn = indexToRPN(c.idx, c.form, c.radix, c.K, domain);
      const valueKey = this.candidateValueKey(rpn, domain);
      if (seenValues.has(valueKey)) return false;
      seenValues.set(valueKey, true);
      return true;
    });

    const top100 = uniqueCandidates.slice(0, 100);

    const results = top100.map((c, i) => {
      const rpn = indexToRPN(c.idx, c.form, c.radix, c.K, domain);
      const fp64Error = this.verifyCandidateError(rpn, target, domain);
      const result: GPUSearchResult = {
        RPN: rpn,
        K: c.K,
        REL_ERR: fp64Error / magnitude,
        error: fp64Error,
        status: i === 0 && fp64Error <= threshold ? 'SUCCESS' : 'GPU_VERIFIED',
        cpuId: 1,
        domain,
      };

      if (onResult) onResult(result);
      return result;
    });

    return results;
  }

  private async getPipeline(domain: SearchDomain): Promise<GPUComputePipeline> {
    if (!this.device) throw new Error('GPU not ready');
    if (this.pipelines[domain]) return this.pipelines[domain]!;

    const shaderResponse = await fetch(withBasePath(shaderPathForDomain(domain)));
    if (!shaderResponse.ok) {
      throw new Error(`Failed to load ${domain} shader: ${shaderResponse.status} ${shaderResponse.statusText}`);
    }

    const shaderCode = await shaderResponse.text();
    if (shaderCode.trim().startsWith('<!DOCTYPE') || shaderCode.trim().startsWith('<html')) {
      throw new Error(`${domain} shader file not found - received HTML instead of WGSL`);
    }

    const shaderModule = this.device.createShaderModule({ code: shaderCode });
    const pipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    this.shaderModules[domain] = shaderModule;
    this.pipelines[domain] = pipeline;
    return pipeline;
  }

  private verifyCandidateError(rpn: string, target: number | ComplexNumber, domain: SearchDomain) {
    if (domain === 'complex') {
      const complexTarget = typeof target === 'number' ? { real: target, imag: 0 } : target;
      const value = evaluateShortRPNComplex(rpn);
      if (!finiteComplex(value)) return Number.POSITIVE_INFINITY;
      return complexDistance(value, complexTarget);
    }

    const realTarget = typeof target === 'number' ? target : target.real;
    const value = evaluateShortRPN(rpn);
    if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
    return Math.abs(value - realTarget);
  }

  private candidateValueKey(rpn: string, domain: SearchDomain) {
    if (domain === 'complex') {
      const value = evaluateShortRPNComplex(rpn);
      return `${value.real.toPrecision(12)},${value.imag.toPrecision(12)}`;
    }
    return evaluateShortRPN(rpn).toPrecision(12);
  }

  private async evaluateForm(
    target: number | ComplexNumber,
    threshold: number,
    K: number,
    form: FormDescriptor,
    pipeline: GPUComputePipeline,
    domain: SearchDomain,
  ): Promise<Candidate[]> {
    if (!this.device) {
      throw new Error('GPU not ready');
    }

    const { totalCombinations } = form;
    const MAX_BATCH_SIZE = 1000000;

    const allCandidates: Candidate[] = [];
    const numBatches = Math.ceil(totalCombinations / MAX_BATCH_SIZE);

    for (let batch = 0; batch < numBatches; batch++) {
      if (!this.device || !this.initialized) {
        console.error('[GPU] Device lost during computation');
        break;
      }

      const batchStart = batch * MAX_BATCH_SIZE;
      const batchSize = Math.min(MAX_BATCH_SIZE, totalCombinations - batchStart);

      try {
        const candidates = await this.evaluateFormBatch(
          target,
          threshold,
          K,
          form,
          batchStart,
          batchSize,
          pipeline,
          domain,
        );
        allCandidates.push(...candidates);

        if (numBatches > 1) {
          await new Promise((r) => setTimeout(r, 1));
        }
      } catch (err) {
        console.warn(`[GPU] Batch ${batch}/${numBatches} failed:`, err);
      }
    }

    return allCandidates;
  }

  private async evaluateFormBatch(
    target: number | ComplexNumber,
    threshold: number,
    K: number,
    form: FormDescriptor,
    batchStart: number,
    batchSize: number,
    pipeline: GPUComputePipeline,
    domain: SearchDomain,
  ): Promise<Candidate[]> {
    if (!this.device) {
      throw new Error('GPU not ready');
    }

    const { ternary, radix } = form;
    const MAX_RESULTS = 1024;

    let paramsBuffer: GPUBuffer | null = null;
    let ternaryBuffer: GPUBuffer | null = null;
    let resultsBuffer: GPUBuffer | null = null;
    let counterBuffer: GPUBuffer | null = null;
    let readBuffer: GPUBuffer | null = null;
    let counterReadBuffer: GPUBuffer | null = null;

    try {
      paramsBuffer = this.device.createBuffer({
        size: 128,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      ternaryBuffer = this.device.createBuffer({
        size: Math.max(K * 4, 16),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });

      resultsBuffer = this.device.createBuffer({
        size: MAX_RESULTS * 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });

      counterBuffer = this.device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });

      readBuffer = this.device.createBuffer({
        size: MAX_RESULTS * 16,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });

      counterReadBuffer = this.device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });

      const paramsData = new ArrayBuffer(128);
      const paramsView = new DataView(paramsData);

      if (domain === 'complex') {
        const complexTarget = typeof target === 'number' ? { real: target, imag: 0 } : target;
        paramsView.setFloat32(0, complexTarget.real, true);
        paramsView.setFloat32(4, complexTarget.imag, true);
        paramsView.setFloat32(8, threshold, true);
        paramsView.setUint32(12, K, true);
        paramsView.setUint32(16, batchSize, true);
        for (let i = 0; i < 4; i++) paramsView.setUint32(32 + i * 4, radix[i] || 1, true);
        for (let i = 0; i < 4; i++) paramsView.setUint32(48 + i * 4, radix[i + 4] || 1, true);
        for (let i = 0; i < 4; i++) paramsView.setUint32(64 + i * 4, radix[i + 8] || 1, true);
        paramsView.setUint32(80, batchStart, true);
      } else {
        const realTarget = typeof target === 'number' ? target : target.real;
        paramsView.setFloat32(0, realTarget, true);
        paramsView.setFloat32(4, threshold, true);
        paramsView.setUint32(8, K, true);
        paramsView.setUint32(12, batchSize, true);
        for (let i = 0; i < 4; i++) paramsView.setUint32(16 + i * 4, radix[i] || 1, true);
        for (let i = 0; i < 4; i++) paramsView.setUint32(32 + i * 4, radix[i + 4] || 1, true);
        for (let i = 0; i < 4; i++) paramsView.setUint32(48 + i * 4, radix[i + 8] || 1, true);
        paramsView.setUint32(64, batchStart, true);
      }

      this.device.queue.writeBuffer(paramsBuffer, 0, paramsData);
      this.device.queue.writeBuffer(ternaryBuffer, 0, new Uint32Array(ternary));
      this.device.queue.writeBuffer(counterBuffer, 0, new Uint32Array([0]));

      const bindGroup = this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuffer } },
          { binding: 1, resource: { buffer: ternaryBuffer } },
          { binding: 2, resource: { buffer: resultsBuffer } },
          { binding: 3, resource: { buffer: counterBuffer } },
        ],
      });

      const commandEncoder = this.device.createCommandEncoder();
      const passEncoder = commandEncoder.beginComputePass();

      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.dispatchWorkgroups(Math.ceil(batchSize / 256));
      passEncoder.end();

      commandEncoder.copyBufferToBuffer(resultsBuffer, 0, readBuffer, 0, MAX_RESULTS * 16);
      commandEncoder.copyBufferToBuffer(counterBuffer, 0, counterReadBuffer, 0, 4);
      this.device.queue.submit([commandEncoder.finish()]);

      await counterReadBuffer.mapAsync(GPUMapMode.READ);
      const counterData = new Uint32Array(counterReadBuffer.getMappedRange());
      const resultCount = Math.min(counterData[0], MAX_RESULTS);
      counterReadBuffer.unmap();

      await readBuffer.mapAsync(GPUMapMode.READ);
      const mappedRange = readBuffer.getMappedRange();
      const dataView = new DataView(mappedRange);

      const candidates: Candidate[] = [];
      for (let i = 0; i < resultCount; i++) {
        const byteOffset = i * 16;
        const error = dataView.getFloat32(byteOffset, true);
        const idx = dataView.getUint32(byteOffset + 4, true);
        const valid = dataView.getUint32(byteOffset + 8, true);

        if (valid === 1 && error < threshold) {
          candidates.push({
            error,
            idx,
            K,
            form: [...ternary],
            radix: [...radix],
          });
        }
      }

      readBuffer.unmap();
      return candidates;
    } finally {
      try {
        paramsBuffer?.destroy();
        ternaryBuffer?.destroy();
        resultsBuffer?.destroy();
        counterBuffer?.destroy();
        readBuffer?.destroy();
        counterReadBuffer?.destroy();
      } catch {
        // Ignore cleanup errors.
      }
    }
  }

  destroy(): void {
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
    this.initialized = false;
    this.pipelines = {};
    this.shaderModules = {};
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.gpu;
  }
}

let gpuInstance: ConstantRecognitionGPU | null = null;

export function getGPUInstance(): ConstantRecognitionGPU {
  if (!gpuInstance) {
    gpuInstance = new ConstantRecognitionGPU();
  }
  return gpuInstance;
}
