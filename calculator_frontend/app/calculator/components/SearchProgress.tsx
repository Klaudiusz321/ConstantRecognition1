'use client';

import type { SearchBackend, SearchProgress as SearchProgressData } from '../lib/types';

interface SearchProgressProps {
  backend: SearchBackend | null;
  elapsedTime: number;
  progress: SearchProgressData | null;
  precision: string | undefined;
  onAbort: () => void;
}

export function SearchProgress({
  backend,
  elapsedTime,
  progress,
  precision,
  onAbort,
}: SearchProgressProps) {
  const isGPU = backend === 'gpu';
  const isBidirectional = backend === 'bidirectional';
  const percent = progress && progress.total > 0
    ? Math.min(100, Math.round((progress.done / progress.total) * 100))
    : 0;
  const progressText = isGPU
    ? progress?.evaluations
      ? `${progress.evaluations} candidates screened`
      : 'Preparing the graphics processor'
    : isBidirectional
      ? progress?.evaluations
        ? `${progress.evaluations} target-side joins evaluated`
        : 'Building bounded half-frontiers'
    : progress && progress.total > 0
      ? `${progress.done} of ${progress.total} search chunks complete`
      : 'Preparing CPU workers';

  return (
    <div className="flex flex-1 items-center justify-center overflow-auto px-4 py-8 sm:px-8">
      <section
        className="w-full max-w-2xl rounded-2xl border border-blue-200 bg-white p-6 shadow-sm dark:border-blue-900/60 dark:bg-[#202024] sm:p-8"
        aria-labelledby="search-progress-title"
        aria-live="polite"
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            <span className="h-2 w-2 rounded-full bg-blue-500 motion-safe:animate-pulse" aria-hidden="true" />
            {isGPU ? 'GPU accelerated' : isBidirectional ? 'Bidirectional experiment' : 'CPU compatible mode'}
          </span>
          <span className="font-mono text-sm text-gray-500 dark:text-gray-400">
            {(elapsedTime / 1000).toFixed(1)}s
          </span>
        </div>

        <h2 id="search-progress-title" className="text-2xl font-semibold text-gray-900 dark:text-white">
          {isGPU ? 'Searching with GPU' : isBidirectional ? 'Bidirectional search' : 'Searching with CPU'}
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
          {isGPU
            ? 'The graphics processor is screening formulas quickly. Every returned candidate is checked again on the CPU for accuracy.'
            : isBidirectional
              ? 'Complete short-expression frontiers are joined from the target side. The standard CPU/WASM engine verifies any shorter levels not covered by the join.'
            : 'The compatible CPU/WASM engine is checking formulas using the selected calculator settings.'}
        </p>

        <div className="mt-6">
          <div
            className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-[#111113]"
            role="progressbar"
            aria-label="Search progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={progressText}
          >
            <div
              className="h-full rounded-full bg-[#0066cc] transition-[width] duration-300"
              style={{ width: `${Math.max(percent, progress ? 4 : 12)}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{progressText}</p>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-[#171719]">
            <dt className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Engine</dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
              {isGPU ? 'GPU + CPU check' : isBidirectional ? 'BiDir + CPU proof' : 'CPU / WASM'}
            </dd>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-[#171719]">
            <dt className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Complexity</dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
              {progress?.complexityK ? `K = ${progress.complexityK}` : 'Starting'}
            </dd>
          </div>
          <div className="col-span-2 rounded-xl bg-gray-50 p-3 dark:bg-[#171719] sm:col-span-1">
            <dt className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Tolerance</dt>
            <dd className="mt-1 truncate font-mono text-sm font-semibold text-gray-900 dark:text-white" title={precision ?? 'Automatic'}>
              {precision ? `±${precision}` : 'Automatic'}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={onAbort}
          className="mt-6 min-h-11 w-full rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30 dark:focus:ring-offset-[#202024]"
        >
          Stop search
        </button>
      </section>
    </div>
  );
}
