'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ActiveWorker, Precision, ErrorMode, ComputeEngine, type SearchMode } from '../lib/types';
import { formatGPUAdapterName, formatGPUError } from '../lib/gpu-ui';
import { getCalculatorById, DEFAULT_CALCULATOR_ID } from '../lib/calculators';
import {
  GPU_PROGRAM_BUDGET,
  GPU_TIME_BUDGET_MS,
  buildSearchComplexityPlan,
  formatBigInt,
} from '../lib/search-complexity';
import { CalculatorPalette } from './CalculatorPalette';

interface SidebarProps {
  wasmLoaded: boolean;
  gpuChecked: boolean;
  gpuSupported: boolean;
  gpuAdapterName: string | null;
  gpuError: string | null;
  onRetryGPU: () => void;
  computeEngine: ComputeEngine;
  setComputeEngine: (engine: ComputeEngine) => void;
  detectedCPUs: number;
  searchDepth: number;
  setSearchDepth: (depth: number) => void;
  threadCount: number;
  setThreadCount: (count: number) => void;
  autoThreads: boolean;
  setAutoThreads: (auto: boolean) => void;
  precision: Precision;
  activeWorkers: ActiveWorker[];
  isCalculating: boolean;
  onAbort: () => void;
  isMobile: boolean;
  isOpen: boolean;
  onToggle: () => void;
  // Error mode
  errorMode: ErrorMode;
  setErrorMode: (mode: ErrorMode) => void;
  manualError: string;
  setManualError: (value: string) => void;
  earlyExitCRThreshold: number;
  setEarlyExitCRThreshold: (value: number) => void;
  // Calculator button palette
  enabledTokens: string[];
  onToggleToken: (token: string) => void;
  onEnableAll: () => void;
  searchMode: SearchMode | null;
  /** Independent targets/observations evaluated for every candidate program. */
  samplesPerProgram: number;
}

export function Sidebar({
  wasmLoaded,
  gpuChecked,
  gpuSupported,
  gpuAdapterName,
  gpuError,
  onRetryGPU,
  computeEngine,
  setComputeEngine,
  detectedCPUs,
  searchDepth,
  setSearchDepth,
  threadCount,
  setThreadCount,
  autoThreads,
  setAutoThreads,
  precision,
  activeWorkers,
  isCalculating,
  onAbort,
  isMobile,
  isOpen,
  onToggle,
  errorMode,
  setErrorMode,
  manualError,
  setManualError,
  earlyExitCRThreshold,
  setEarlyExitCRThreshold,
  enabledTokens,
  onToggleToken,
  onEnableAll,
  searchMode,
  samplesPerProgram,
}: SidebarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const calculator = getCalculatorById(DEFAULT_CALCULATOR_ID);
  const manualTolerance = parseFloat(manualError);
  const toleranceSearchActive =
    errorMode === 'automatic' ||
    (errorMode === 'manual' && Number.isFinite(manualTolerance) && manualTolerance > 0);
  const earlyExitCRActive = toleranceSearchActive;
  const earlyExitCRNote = toleranceSearchActive
    ? 'Applies to CPU/WASM and CPU-verified GPU search.'
    : 'Ignored for exact search (± 0). Use Auto or Manual uncertainty to enable it.';
  const noConstants = searchMode !== 'function' && searchMode !== 'multivariate' && !enabledTokens.some(
    (t) => calculator.constantsCore.includes(t) || calculator.constantsRedundant.includes(t),
  );
  const selectedConstants = [
    ...calculator.constantsCore,
    ...calculator.constantsRedundant,
  ].filter((token) => enabledTokens.includes(token));
  const selectedFunctions = [
    ...calculator.unaryCore,
    ...calculator.unaryRedundant,
  ].filter((token) => enabledTokens.includes(token));
  const selectedOperators = [
    ...calculator.operatorsCommutative,
    ...calculator.operatorsNoncommutative,
  ].filter((token) => enabledTokens.includes(token));
  const friendlyAdapterName = formatGPUAdapterName(gpuAdapterName);
  const friendlyGPUError = formatGPUError(gpuError);
  const variableCount = searchMode === 'function' ? 1 : searchMode === 'multivariate' ? 2 : 0;
  const complexityPlan = buildSearchComplexityPlan(searchDepth, {
    terminals: selectedConstants.length + variableCount,
    unary: selectedFunctions.length,
    binary: selectedOperators.length,
  }, samplesPerProgram);
  const selectedComplexity = complexityPlan.selected;
  const gpuProgramBudgetExceeded =
    selectedComplexity.cumulativePrograms > GPU_PROGRAM_BUDGET;

  return (
    <>
      {/* Explicit reopen button */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed left-4 bottom-4 z-50 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-lg transition-colors hover:bg-gray-50 dark:border-[#2a2a2e] dark:bg-[#1a1a1d] dark:text-gray-200 dark:hover:bg-[#2a2a2e]"
          aria-label="Open search settings"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10m-7 6h4" />
          </svg>
          <span>Search Settings</span>
        </button>
      )}

      {isMobile && isOpen && (
        <button
          type="button"
          onClick={onToggle}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
          aria-label="Close search settings"
        />
      )}

      {/* Sidebar */}
      <aside className={`
        ${isMobile ? 'fixed inset-y-0 left-0 z-50 w-[min(20rem,calc(100vw-1rem))] max-w-[20rem] transform shadow-2xl' : 'relative'}
        bg-white dark:bg-[#1a1a1d]
        border-r border-gray-200 dark:border-[#2a2a2e]
        flex flex-col
        transition-all duration-300 ease-in-out
        overflow-x-hidden
        ${isMobile
          ? (isOpen ? 'translate-x-0' : '-translate-x-full')
          : (isOpen ? 'w-96 min-w-96' : 'w-0 min-w-0 overflow-hidden')}
      `}>
        {/* Header with collapse button */}
        <div className="p-4 border-b border-gray-200 dark:border-[#2a2a2e]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image
                src="/cdaaebfdc71641160f831c2a2fb564ce8d081055.png"
                alt="Logo"
                width={40}
                height={40}
                style={{ width: 40, height: 40 }}
                className="w-10 h-10 rounded-lg object-cover"
              />
              <div>
                <h1 className="font-semibold text-gray-900 dark:text-white text-sm">Constant Recognizer</h1>
                <p className="text-[10px] text-gray-500">Jagiellonian University</p>
              </div>
            </div>
            {/* Collapse button */}
            <button
              onClick={onToggle}
              className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-[#2a2a2e] transition-colors"
              aria-label={isMobile ? 'Close search settings' : 'Collapse sidebar'}
              title={isMobile ? 'Close' : 'Hide sidebar'}
            >
              {isMobile ? (
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Settings */}
        <div className="flex-1 p-4 space-y-6 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {/* Status */}
          <div className="space-y-2">
            <div className="text-xs lg:text-[10px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">Status</div>
            <div className="flex items-center gap-2 text-base lg:text-sm">
              <div className={`w-3 h-3 lg:w-2 lg:h-2 rounded-full ${wasmLoaded ? 'bg-green-500' : 'bg-amber-500'}`} aria-hidden="true" />
              <span className="text-gray-700 dark:text-gray-300">{wasmLoaded ? 'WASM Ready' : 'Demo Mode'}</span>
            </div>
            <div className="flex items-center gap-2 text-base lg:text-sm">
              <div className={`w-3 h-3 lg:w-2 lg:h-2 rounded-full ${
                !gpuChecked ? 'bg-gray-400' : gpuSupported ? 'bg-green-500' : 'bg-amber-500'
              }`} aria-hidden="true" />
              <span className="text-gray-700 dark:text-gray-300">
                {!gpuChecked ? 'Testing GPU acceleration...' : gpuSupported ? 'GPU Ready' : 'GPU unavailable'}
              </span>
            </div>
            {gpuChecked && gpuSupported && (
              <p className="text-[11px] leading-4 text-green-700 dark:text-green-300">
                Opcodes, bounded buffers, reduction, readback and overflow recovery passed.
              </p>
            )}
            {gpuChecked && !gpuSupported && friendlyGPUError && (
              <p role="status" className="break-words text-[11px] leading-4 text-amber-700 dark:text-amber-300">
                {friendlyGPUError}
              </p>
            )}
            <div className="text-sm lg:text-xs text-gray-500 dark:text-gray-500">
              {detectedCPUs} logical CPUs detected
            </div>
          </div>

          {/* Keep the backend choice visible so GPU and CPU runs are easy to compare. */}
          <fieldset className="space-y-2" disabled={isCalculating}>
            <legend className="text-[10px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
              Compute Engine
            </legend>
            <div
              className="grid grid-cols-3 rounded-lg bg-gray-100 p-1 dark:bg-[#111113]"
              aria-describedby="compute-engine-help"
            >
              {([
                { value: 'auto' as const, label: 'Auto', disabled: false },
                { value: 'gpu' as const, label: 'GPU', disabled: !gpuSupported },
                { value: 'cpu' as const, label: 'CPU', disabled: false },
              ]).map((option) => (
                <label
                  key={option.value}
                  className={`relative rounded-md px-2 py-2 text-center text-xs font-semibold transition-colors ${
                    option.disabled
                      ? 'cursor-not-allowed text-gray-400 opacity-60'
                      : computeEngine === option.value
                        ? 'cursor-pointer bg-white text-[#0066cc] shadow-sm dark:bg-[#2a2a2e] dark:text-blue-300'
                        : 'cursor-pointer text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="computeEngine"
                    value={option.value}
                    checked={computeEngine === option.value}
                    onChange={() => setComputeEngine(option.value as ComputeEngine)}
                    disabled={option.disabled || isCalculating}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <p id="compute-engine-help" className="text-[11px] leading-4 text-gray-500 dark:text-gray-400">
              {computeEngine === 'gpu'
                ? 'GPU screening is forced; every returned candidate is verified on the CPU.'
                : computeEngine === 'cpu'
                  ? 'GPU is disabled, making this mode suitable for a CPU comparison run.'
                  : 'Uses the tested GPU when available and falls back safely to CPU/WASM.'}
            </p>
          </fieldset>

          {/* Calculator button palette */}
          <div className="space-y-2">
            <label className="text-[10px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
              Calculator
            </label>
            <CalculatorPalette
              calculator={calculator}
              enabledTokens={enabledTokens}
              onToggleToken={onToggleToken}
              onEnableAll={onEnableAll}
              disabled={isCalculating}
            />
            {searchMode === 'function' && (
              <p className="text-[11px] leading-4 text-blue-700 dark:text-blue-300">
                Variable x is enabled automatically. Constants remain optional; selected functions and operators define the function search space.
              </p>
            )}
            {searchMode === 'multivariate' && (
              <div className="space-y-1 text-[11px] leading-4 text-blue-700 dark:text-blue-300">
                <p>Variables C₁ and C₂ are enabled automatically and both are required in every accepted expression. Constants are optional.</p>
                <p>The initial SQR + SQRT + PLUS grammar reproduces the reference formula quickly. Use Enable all or individual buttons to broaden it.</p>
              </div>
            )}
            {searchMode === 'multiple' && (
              <p className="text-[11px] leading-4 text-blue-700 dark:text-blue-300">
                The same selected constants, functions and operators are evaluated against every target. Variable x is disabled.
              </p>
            )}
            {searchMode === 'constant' && (
              <p className="text-[11px] leading-4 text-gray-500 dark:text-gray-400">
                Expressions use only the selected constants, functions and operators. Variable x is disabled.
              </p>
            )}
            {noConstants && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Enable at least one constant — formulas cannot be built without one.
              </p>
            )}
          </div>

          {/* Precision Info */}
          {precision.z && (
            <div className="space-y-2">
              <label className="text-xs lg:text-[10px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                Search Target
              </label>
              <div className="text-sm lg:text-xs font-mono text-gray-600 dark:text-gray-400 space-y-1 bg-gray-50 dark:bg-[#111113] p-3 lg:p-2 rounded">
                <div>z = {precision.z}</div>
                <div>Δz = {precision.deltaZ}</div>
                <div>δz/z = {precision.relDeltaZ}</div>
              </div>
            </div>
          )}

          {/* Active Workers */}
          {activeWorkers.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs lg:text-[10px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                Active Workers ({activeWorkers.length})
              </label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {activeWorkers.map(w => (
                  <div key={w.id} className="flex items-center gap-2 text-sm lg:text-xs">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-gray-600 dark:text-gray-400">
                      CPU {w.id}: searching...
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* K is a global RPN program-length bound. Calculator/data/hardware
              sizes are reported separately so the scientific parameter never
              changes meaning between modes or backends. */}
          <div className="space-y-2">
            <label className="text-[10px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
              Maximum RPN length (K)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="2"
                max="9"
                value={searchDepth}
                onChange={(e) => setSearchDepth(parseInt(e.target.value))}
                disabled={isCalculating}
                className="flex-1 accent-[#0066cc] h-2 disabled:opacity-40"
              />
              <span className="font-mono text-sm font-bold text-gray-900 dark:text-white w-4">{searchDepth}</span>
            </div>
            <p className="text-[10px] text-gray-400">
              K is the number of calculator tokens in one candidate program, searched globally from 1 through K.
            </p>
            <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-[11px] leading-4 text-gray-600 dark:border-[#2a2a2e] dark:bg-[#111113] dark:text-gray-400">
              <div className="flex items-center justify-between gap-3">
                <span>Active alphabet</span>
                <strong className="font-mono font-medium text-gray-800 dark:text-gray-200">
                  {complexityPlan.alphabetSize} tokens
                </strong>
              </div>
              <div className="font-mono text-[10px] text-gray-500">
                T={complexityPlan.alphabet.terminals} · U={complexityPlan.alphabet.unary} · B={complexityPlan.alphabet.binary}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Valid programs at K={searchDepth}</span>
                <strong className="font-mono font-medium text-gray-800 dark:text-gray-200">
                  {formatBigInt(selectedComplexity.programs)}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Cumulative programs (≤K)</span>
                <strong className="font-mono font-medium text-gray-800 dark:text-gray-200">
                  {formatBigInt(selectedComplexity.cumulativePrograms)}
                </strong>
              </div>
              {samplesPerProgram > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <span>Dataset evaluations (×{samplesPerProgram})</span>
                  <strong className="font-mono font-medium text-gray-800 dark:text-gray-200">
                    {formatBigInt(selectedComplexity.scalarEvaluations)}
                  </strong>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span>Fixed-width description</span>
                <strong className="font-mono font-medium text-gray-800 dark:text-gray-200">
                  {complexityPlan.descriptionBits.toFixed(2)} bits
                </strong>
              </div>
              <p className="border-t border-gray-200 pt-2 text-[10px] dark:border-[#2a2a2e]">
                Counts use exact RPN stack grammar: terminals push, unary functions preserve stack depth, and binary operators reduce it.
              </p>
              {gpuProgramBudgetExceeded && computeEngine !== 'cpu' && (
                <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  The browser GPU cap ({formatBigInt(GPU_PROGRAM_BUDGET)} programs or {GPU_TIME_BUDGET_MS / 1000}s) is exhaustive only through K={complexityPlan.gpuCompleteThroughK} for this alphabet. A deeper GPU result is explicitly reported as partial.
                </p>
              )}
              <p className="text-[10px]">
                CPU threads and GPU workgroups divide this same space; they affect elapsed time, never K or the candidate count.
              </p>
            </div>
          </div>

          {searchMode === 'multivariate' && (
            <section
              aria-labelledby="scientific-search-contract"
              className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[11px] leading-4 text-gray-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-gray-300"
            >
              <h2 id="scientific-search-contract" className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                Scientific search contract
              </h2>
              <dl className="space-y-1.5">
                <div><dt className="inline font-semibold">Variables:</dt>{' '}<dd className="inline font-mono">C1, C2</dd> (both required)</div>
                <div><dt className="inline font-semibold">Constants ({selectedConstants.length}):</dt>{' '}<dd className="inline break-words font-mono">{selectedConstants.join(', ') || 'none'}</dd></div>
                <div><dt className="inline font-semibold">Operators ({selectedOperators.length}):</dt>{' '}<dd className="inline break-words font-mono">{selectedOperators.join(', ') || 'none'}</dd></div>
                <div><dt className="inline font-semibold">Functions ({selectedFunctions.length}):</dt>{' '}<dd className="inline break-words font-mono">{selectedFunctions.join(', ') || 'none'}</dd></div>
                <div><dt className="inline font-semibold">Maximum formula length:</dt>{' '}<dd className="inline font-mono">K = {searchDepth}</dd> symbols</div>
                <div><dt className="inline font-semibold">Maximum operations:</dt>{' '}<dd className="inline font-mono">K − 1 = {Math.max(searchDepth - 1, 0)}</dd> (structural upper bound)</div>
                <div><dt className="inline font-semibold">Expression cost:</dt>{' '}<dd className="inline font-mono">cost = terminals + unary + binary = K</dd></div>
              </dl>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                Candidates are ranked by weighted MSE and confirmed at MSE ≤ 1e−12 after CPU FP64 verification.
              </p>
            </section>
          )}

          {/* Threads */}
          <div className="space-y-2">
            <label className="text-[10px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
              CPU Threads
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="32"
                value={threadCount}
                onChange={(e) => setThreadCount(parseInt(e.target.value))}
                disabled={autoThreads || computeEngine === 'gpu' || isCalculating}
                className="flex-1 accent-[#0066cc] disabled:opacity-40 h-2"
              />
              <span className="font-mono text-sm font-bold text-gray-900 dark:text-white w-8">
                {autoThreads ? 'Auto' : threadCount}
              </span>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoThreads}
                onChange={(e) => setAutoThreads(e.target.checked)}
                disabled={computeEngine === 'gpu' || isCalculating}
                className="accent-[#0066cc] w-4 h-4"
              />
              Auto-detect ({detectedCPUs} CPUs)
            </label>
            {computeEngine === 'gpu' && (
              <p className="text-[10px] text-gray-400">CPU threads are not used by the WebGPU screening pass.</p>
            )}
          </div>

          {/* Advanced Options Toggle */}
          <div className="border-t border-gray-200 dark:border-[#2a2a2e] pt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <span className="font-medium">Advanced Options</span>
              <svg
                className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Advanced Options Content */}
          {showAdvanced && (
            <div className="space-y-6 pb-2">

              {/* GPU diagnostics */}
              <div className="space-y-3">
                <div className="text-[10px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                  GPU Diagnostics
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-[11px] leading-5 text-gray-500 dark:bg-[#111113] dark:text-gray-400">
                  {gpuSupported && friendlyAdapterName ? (
                    <span>
                      Graphics processor: <strong className="font-medium text-gray-700 dark:text-gray-300">{friendlyAdapterName}</strong>.
                      {' '}Opcode parity, bounded buffers, GPU reduction, readback and forced overflow recovery passed.
                    </span>
                  ) : gpuSupported ? (
                    <span>A compatible graphics processor passed compute, readback and forced buffer-overflow recovery tests.</span>
                  ) : (
                    <span className="break-words">
                      GPU acceleration is unavailable. {friendlyGPUError ?? 'Auto mode will use CPU/WASM.'}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onRetryGPU}
                  disabled={isCalculating || !gpuChecked}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#2a2a2e] dark:text-gray-300 dark:hover:bg-[#222226]"
                >
                  {!gpuChecked ? 'Testing GPU...' : gpuSupported ? 'Run GPU test again' : 'Retry GPU test'}
                </button>
              </div>

              {/* Global uncertainty belongs only to a single target. Batch and
                  function modes define uncertainty per input row. */}
              {searchMode === 'constant' && (
                <>
                <div className="space-y-2">
                <label className="text-[10px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                  Uncertainty (±)
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="errorMode"
                      checked={errorMode === 'zero'}
                      onChange={() => setErrorMode('zero')}
                      className="w-4 h-4 accent-[#0066cc]"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Exact / Symbolic</span>
                    <span className="text-xs text-gray-400">(± 0)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="errorMode"
                      checked={errorMode === 'manual'}
                      onChange={() => setErrorMode('manual')}
                      className="w-4 h-4 accent-[#0066cc]"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Arbitrary High Precision</span>
                  </label>
                  {errorMode === 'manual' && (
                    <div className="flex items-center gap-2 ml-6">
                      <span className="text-gray-500">±</span>
                      <input
                        type="text"
                        value={manualError}
                        onChange={(e) => setManualError(e.target.value)}
                        placeholder="1e-128"
                        className="w-32 px-2 py-1 rounded border border-gray-300 dark:border-[#2a2a2e] bg-white dark:bg-[#111113] text-gray-900 dark:text-white font-mono text-sm"
                      />
                    </div>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="errorMode"
                      checked={errorMode === 'automatic'}
                      onChange={() => setErrorMode('automatic')}
                      className="w-4 h-4 accent-[#0066cc]"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Machine Precision</span>
                    <span className="text-xs text-gray-400">(few ULP)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="errorMode"
                      checked={errorMode === 'large_errors'}
                      onChange={() => setErrorMode('large_errors')}
                      className="w-4 h-4 accent-[#0066cc]"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Large Errors</span>
                    <span className="text-xs text-gray-400">(fuzzy search)</span>
                  </label>
                </div>
                </div>

                <div className="space-y-2">
                <label className="text-[10px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                  Early Exit CR
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={earlyExitCRThreshold}
                    onChange={(e) => setEarlyExitCRThreshold(parseFloat(e.target.value))}
                    disabled={!earlyExitCRActive}
                    className="flex-1 accent-[#0066cc] h-2 disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  <span
                    className={`font-mono text-sm font-bold w-12 text-right ${
                      earlyExitCRActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {earlyExitCRThreshold.toFixed(2)}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400">
                  Minimum compression ratio required for tolerance-based early exit.
                </p>
                <p
                  className={`text-[10px] ${
                    earlyExitCRActive
                      ? 'text-gray-500 dark:text-gray-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {earlyExitCRNote}
                </p>
                </div>
                </>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3 lg:space-y-2">
            {isCalculating && (
              <button
                onClick={onAbort}
                className="w-full px-4 py-3 lg:py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-base lg:text-sm"
              >
                <svg className="w-5 h-5 lg:w-4 lg:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Abort
              </button>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-[#2a2a2e]">
          <a
            href="https://github.com/Klaudiusz321/ConstantRecognition"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-[#0066cc] transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub
          </a>
        </div>
      </aside>
    </>
  );
}
