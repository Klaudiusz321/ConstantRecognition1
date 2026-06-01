'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ActiveWorker, Precision, ErrorMode, ComputeMode, RecognitionTarget, Domain, CalculatorMode, SearchCalculatorSpec } from '../lib/types';
import { CALCULATORS, CalculatorId, calculatorTokenLabel, getCalculatorById } from '../lib/calculators';
import { CalculatorPalette } from './CalculatorPalette';

const withBasePath = (path: string) => {
  const base = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/+$/g, '') ?? '';
  const normalizedBase = base ? (base.startsWith('/') ? base : `/${base}`) : '';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

interface SidebarProps {
  wasmLoaded: boolean;
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
  // GPU info (auto-detected)
  gpuAvailable: boolean;
  gpuName?: string;
  //Compute mode selection
  computeMode: ComputeMode;
  setComputeMode: (mode: ComputeMode) => void;
  selectedCalculatorId: CalculatorId;
  setSelectedCalculatorId: (calculatorId: CalculatorId) => void;
  // Professor's new configurations
  recognitionTarget: RecognitionTarget;
  setRecognitionTarget: (target: RecognitionTarget) => void;
  domain: Domain;
  setDomain: (domain: Domain) => void;
  calculatorMode: CalculatorMode;
  setCalculatorMode: (mode: CalculatorMode) => void;
  calculatorSpec: SearchCalculatorSpec;
  defaultCalculatorSpec: SearchCalculatorSpec;
  setCustomCalculatorSpec: (spec: SearchCalculatorSpec) => void;
}

export function Sidebar({
  wasmLoaded,
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
  gpuAvailable,
  gpuName,
  computeMode,
  setComputeMode,
  selectedCalculatorId,
  setSelectedCalculatorId,
  recognitionTarget,
  setRecognitionTarget,
  domain,
  setDomain,
  calculatorMode,
  setCalculatorMode,
  calculatorSpec,
  defaultCalculatorSpec,
  setCustomCalculatorSpec,
}: SidebarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const selectedCalculator = getCalculatorById(selectedCalculatorId);
  const displayedCalculator = {
    ...selectedCalculator,
    constantsCore: selectedCalculator.constantsCore.filter((token) => domain === 'complex' || token !== 'I'),
  };
  const gpuSearchCompatible =
    recognitionTarget === 'constant' &&
    calculatorMode === 'standard';
  const gpuSearchActive =
    gpuSearchCompatible &&
    (computeMode === 'gpu' || computeMode === 'apple_silicon' || (computeMode === 'auto' && gpuAvailable));
  const manualTolerance = parseFloat(manualError);
  const toleranceSearchActive =
    errorMode === 'automatic' ||
    (errorMode === 'manual' && Number.isFinite(manualTolerance) && manualTolerance > 0);
  const earlyExitCRActive = !gpuSearchActive && toleranceSearchActive;
  const earlyExitCRNote = gpuSearchActive
    ? 'Ignored for GPU/WebGPU search. The current GPU engine searches all K values.'
    : toleranceSearchActive
      ? 'Applies to CPU/WASM tolerance-based search.'
      : 'Ignored for exact search (+/- 0). Use Auto or Manual uncertainty to enable it.';
  const selectableCalculatorSpec = calculatorMode === 'fire_everything'
    ? defaultCalculatorSpec
    : calculatorSpec;
  const selectedButtonCount =
    selectableCalculatorSpec.consts.length +
    selectableCalculatorSpec.funcs.length +
    selectableCalculatorSpec.ops.length;

  const orderTokens = (
    group: keyof SearchCalculatorSpec,
    tokens: string[],
  ) => defaultCalculatorSpec[group].filter((token) => tokens.includes(token));

  const updateCalculatorMode = (mode: CalculatorMode) => {
    setCalculatorMode(mode);
    if (mode === 'list' || mode === 'custom') {
      setCustomCalculatorSpec(calculatorSpec);
    }
    if (mode === 'fire_everything') {
      setCustomCalculatorSpec(defaultCalculatorSpec);
    }
  };

  const toggleCalculatorToken = (group: keyof SearchCalculatorSpec, token: string) => {
    const current = calculatorMode === 'standard' || calculatorMode === 'fire_everything'
      ? defaultCalculatorSpec
      : calculatorSpec;
    const values = current[group];
    const hasToken = values.includes(token);

    if (hasToken && group === 'consts' && values.length === 1) return;

    const nextValues = hasToken
      ? values.filter((value) => value !== token)
      : orderTokens(group, [...values, token]);

    setCustomCalculatorSpec({
      ...current,
      [group]: nextValues,
    });
  };

  const resetCalculatorSpec = () => {
    setCustomCalculatorSpec(defaultCalculatorSpec);
  };

  const renderTokenGroup = (
    label: string,
    group: keyof SearchCalculatorSpec,
    tokens: string[],
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-500">
          {label}
        </span>
        <span className="text-[10px] font-mono text-gray-400">
          {selectableCalculatorSpec[group].length}/{tokens.length}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {tokens.map((token) => {
          const selected = selectableCalculatorSpec[group].includes(token);
          return (
            <button
              key={token}
              type="button"
              onClick={() => toggleCalculatorToken(group, token)}
              disabled={calculatorMode === 'fire_everything'}
              className={`rounded-md border px-2 py-2 text-left transition-colors ${
                selected
                  ? 'border-[#0066cc] bg-[#0066cc]/10 text-[#0066cc] dark:bg-[#0066cc]/20 dark:text-blue-300'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-[#2a2a2e] dark:bg-[#111113] dark:text-gray-400 dark:hover:bg-[#2a2a2e]'
              } disabled:cursor-not-allowed disabled:opacity-80`}
              title={token}
            >
              <span className="block text-sm font-semibold leading-none">
                {calculatorTokenLabel[token] ?? token}
              </span>
              <span className="mt-1 block truncate text-[9px] uppercase tracking-wide">
                {token}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

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
                src={withBasePath('/constant-recognizer-brand-pack/logo-mark.svg')}
                alt="Constant Recognition logo" 
                width={40}
                height={40}
                className="w-10 h-10 rounded-lg object-cover"
              />
              <div>
                <h1 className="font-semibold text-gray-900 dark:text-white text-sm">Constant Recognition</h1>
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
            <label className="text-xs lg:text-[10px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">Status</label>
            <div className="flex items-center gap-2 text-base lg:text-sm">
              <div className={`w-3 h-3 lg:w-2 lg:h-2 rounded-full ${wasmLoaded ? 'bg-green-500' : 'bg-amber-500'}`} />
              <span className="text-gray-700 dark:text-gray-300">{wasmLoaded ? 'WASM Ready' : 'Demo Mode'}</span>
            </div>
            <div className="text-sm lg:text-xs text-gray-500 dark:text-gray-500">
              {detectedCPUs} logical CPUs detected
            </div>
            {gpuAvailable && (
              <div className="flex items-center gap-2 text-sm lg:text-xs text-green-600 dark:text-green-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                <span>WebGPU: {gpuName || 'Available'}</span>
              </div>
            )}
          </div>

          {/* Recognition Target */}
          <div className="space-y-2">
            <label className="text-[10px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
              Recognition Target
            </label>
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={recognitionTarget === 'constant'}
                  onChange={() => setRecognitionTarget('constant')}
                  className="w-4 h-4 accent-[#0066cc]"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Constant</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={recognitionTarget === 'multiple'}
                  onChange={() => setRecognitionTarget('multiple')}
                  className="w-4 h-4 accent-[#0066cc]"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Multiple Constants</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={recognitionTarget === 'function'}
                  onChange={() => setRecognitionTarget('function')}
                  className="w-4 h-4 accent-[#0066cc]"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Function</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={recognitionTarget === 'sequence'}
                  onChange={() => setRecognitionTarget('sequence')}
                  className="w-4 h-4 accent-[#0066cc]"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Sequence</span>
              </label>
            </div>
          </div>

          {/* Domain Selection */}
          <div className="space-y-2">
            <label className="text-[10px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
              Domain
            </label>
            <div className="flex rounded-md shadow-sm">
              <button
                type="button"
                onClick={() => setDomain('real')}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-l-md border transition-colors
                  ${domain === 'real' 
                    ? 'bg-[#0066cc] text-white border-[#0066cc]' 
                    : 'bg-white dark:bg-[#111113] text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-[#2a2a2e]'}`}
              >
                Real
              </button>
              <button
                type="button"
                onClick={() => setDomain('complex')}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-r-md border-t border-b border-r transition-colors
                  ${domain === 'complex' 
                    ? 'bg-[#0066cc] text-white border-[#0066cc]' 
                    : 'bg-white dark:bg-[#111113] text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-[#2a2a2e]'}`}
              >
                Complex
              </button>
            </div>
          </div>

          {/* Compute Backend Selection */}
          <div className="space-y-2">
            <label className="text-[10px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
              Compute Backend
            </label>
            <div className="flex rounded-md shadow-sm">
              <button
                type="button"
                onClick={() => setComputeMode('auto')}
                disabled={isCalculating}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-l-md border transition-colors
                  ${computeMode === 'auto' 
                    ? 'bg-[#0066cc] text-white border-[#0066cc]' 
                    : 'bg-white dark:bg-[#111113] text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-[#2a2a2e]'}
                  disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() => setComputeMode('cpu')}
                disabled={isCalculating}
                className={`flex-1 px-3 py-2 text-xs font-medium border-t border-b transition-colors
                  ${computeMode === 'cpu' 
                    ? 'bg-[#0066cc] text-white border-[#0066cc]' 
                    : 'bg-white dark:bg-[#111113] text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-[#2a2a2e]'}
                  disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                CPU
              </button>
              <button
                type="button"
                onClick={() => setComputeMode('gpu')}
                disabled={isCalculating || !gpuAvailable || !gpuSearchCompatible}
                className={`flex-1 px-3 py-2 text-xs font-medium border-t border-b transition-colors
                  ${computeMode === 'gpu' 
                    ? 'bg-[#0066cc] text-white border-[#0066cc]' 
                    : 'bg-white dark:bg-[#111113] text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-[#2a2a2e]'}
                  disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                GPU
              </button>
              <button
                type="button"
                onClick={() => setComputeMode('apple_silicon')}
                disabled={isCalculating || !gpuAvailable || !gpuSearchCompatible}
                className={`flex-1 px-2 py-2 text-xs font-medium rounded-r-md border transition-colors
                  ${computeMode === 'apple_silicon' 
                    ? 'bg-[#0066cc] text-white border-[#0066cc]' 
                    : 'bg-white dark:bg-[#111113] text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-[#2a2a2e]'}
                  disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Apple Silicon (Metal via WebGPU)"
              >
                Apple Sil.
              </button>
            </div>
            {/* Status text */}
            <div className="text-[10px] text-gray-400 dark:text-gray-500">
              {computeMode === 'auto' && (
                gpuAvailable && gpuSearchCompatible
                  ? <span className="text-green-600 dark:text-green-400">Will use GPU (WebGPU available, {domain})</span>
                  : <span>Will use CPU/WASM</span>
              )}
              {computeMode === 'cpu' && (
                <span>WASM Workers ({autoThreads ? detectedCPUs : threadCount} threads)</span>
              )}
              {computeMode === 'gpu' && (
                gpuAvailable && gpuSearchCompatible
                  ? <span className="text-green-600 dark:text-green-400">{gpuName || 'WebGPU'} ({domain})</span>
                  : <span className="text-amber-600 dark:text-amber-400">⚠️ GPU unavailable, will use CPU</span>
              )}
              {computeMode === 'apple_silicon' && (
                gpuAvailable && gpuSearchCompatible
                  ? <span className="text-green-600 dark:text-green-400">Apple Silicon via browser WebGPU/Metal ({domain})</span>
                  : <span className="text-amber-600 dark:text-amber-400">Apple Silicon path unavailable for this search, will use CPU</span>
              )}
            </div>
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

          {/* Complexity (K) - always visible */}
          <div className="space-y-2">
            <label className="text-[10px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
              Complexity (K)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="2"
                max="9"
                value={searchDepth}
                onChange={(e) => setSearchDepth(parseInt(e.target.value))}
                className="flex-1 accent-[#0066cc] h-2"
              />
              <span className="font-mono text-sm font-bold text-gray-900 dark:text-white w-4">{searchDepth}</span>
            </div>
            <p className="text-[10px] text-gray-400">Search expressions with up to K symbols</p>
          </div>

          {/* Threads - only visible when CPU will be used */}
          {!gpuSearchActive && (
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
                  disabled={autoThreads}
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
                  className="accent-[#0066cc] w-4 h-4"
                />
                Auto-detect ({detectedCPUs} CPUs)
              </label>
            </div>
          )}

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
              
              {/* Uncertainty Mode */}
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

              <div className="space-y-3">
                <label className="text-[10px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                  Calculator / Search Space
                </label>
                <select
                  value={calculatorMode}
                  onChange={(e) => updateCalculatorMode(e.target.value as CalculatorMode)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-[#2a2a2e] dark:bg-[#111113] dark:text-white"
                >
                  <option value="standard">Standard scientific calculator</option>
                  <option value="list">Choose from list</option>
                  <option value="custom">Drag-n-drop builder</option>
                  <option value="fire_everything">Fire everything!</option>
                </select>

                {calculatorMode === 'standard' && (
                  <div className="space-y-3 mt-4 border-t border-gray-200 dark:border-[#2a2a2e] pt-4">
                    <select
                      value={selectedCalculatorId}
                      onChange={(e) => setSelectedCalculatorId(e.target.value as CalculatorId)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-[#2a2a2e] dark:bg-[#111113] dark:text-white"
                    >
                      {CALCULATORS.map((calculator) => (
                        <option key={calculator.id} value={calculator.id}>
                          {calculator.name} · {calculator.shortName}
                        </option>
                      ))}
                    </select>
                    <div className="space-y-1">
                      <p className="text-xs text-gray-600 dark:text-gray-300">
                        {selectedCalculator.description}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {selectedCalculator.statusNote}
                      </p>
                    </div>
                    <CalculatorPalette calculator={displayedCalculator} />
                  </div>
                )}
                
                {(calculatorMode === 'list' || calculatorMode === 'custom' || calculatorMode === 'fire_everything') && (
                  <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-[#2a2a2e] dark:bg-[#111113]/70">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">
                          {selectedButtonCount} active buttons
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400">
                          {domain === 'complex' ? 'Complex CALC4 includes I.' : 'Real CALC4 excludes I.'}
                        </div>
                      </div>
                      {calculatorMode !== 'fire_everything' && (
                        <button
                          type="button"
                          onClick={resetCalculatorSpec}
                          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 dark:border-[#2a2a2e] dark:bg-[#1a1a1d] dark:text-gray-300 dark:hover:bg-[#2a2a2e]"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    {calculatorMode === 'custom' && (
                      <div className="rounded-md border border-dashed border-[#0066cc]/40 bg-[#0066cc]/5 p-2 text-[11px] text-gray-600 dark:text-gray-300">
                        Custom operation set
                      </div>
                    )}

                    {calculatorMode === 'fire_everything' && (
                      <div className="rounded-md bg-amber-50 p-2 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                        Full domain operation set
                      </div>
                    )}

                    {renderTokenGroup('Constants', 'consts', defaultCalculatorSpec.consts)}
                    {renderTokenGroup('Functions', 'funcs', defaultCalculatorSpec.funcs)}
                    {renderTokenGroup('Operators', 'ops', defaultCalculatorSpec.ops)}
                  </div>
                )}
              </div>
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
