'use client';

import type { AccelerationStatus } from '../lib/gpu-ui';

interface InputBarProps {
  inputValue: string;
  setInputValue: (value: string) => void;
  isCalculating: boolean;
  /** false when the search cannot start (e.g. no constants enabled in the palette) */
  canCalculate?: boolean;
  onCalculate: () => void;
  onReset: () => void;
  accelerationStatus: AccelerationStatus;
}

export function InputBar({
  inputValue,
  setInputValue,
  isCalculating,
  canCalculate = true,
  onCalculate,
  onReset,
  accelerationStatus,
}: InputBarProps) {
  const statusClasses = {
    active: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300',
    positive: 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-300',
    neutral: 'border-gray-200 bg-gray-50 text-gray-600 dark:border-[#34343a] dark:bg-[#202024] dark:text-gray-300',
    warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
  }[accelerationStatus.tone];

  return (
    <div className="p-4 sm:p-6 bg-white dark:bg-[#1a1a1d] border-b border-gray-200 dark:border-[#2a2a2e]">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              aria-label="Number to identify"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter a number, e.g. 3.14159265..."
              className="w-full px-4 py-3 rounded-lg bg-gray-50 dark:bg-[#111113] border border-gray-200 dark:border-[#2a2a2e] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:border-[#0066cc] focus:outline-none focus:ring-1 focus:ring-[#0066cc] font-mono text-lg"
              onKeyDown={(e) => e.key === 'Enter' && onCalculate()}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCalculate}
              disabled={!inputValue || isCalculating || !canCalculate}
              title={canCalculate ? undefined : 'Enable at least one constant in the calculator palette'}
              className="flex-1 sm:flex-none px-6 py-3 bg-[#0066cc] hover:bg-[#0052a3] disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed"
            >
              {isCalculating ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Searching...</span>
                </>
              ) : (
                <span>Find Formula</span>
              )}
            </button>
            {!isCalculating && (
              <button
                type="button"
                onClick={onReset}
                className="px-4 py-3 bg-gray-200 dark:bg-[#2a2a2e] hover:bg-gray-300 dark:hover:bg-[#3a3a3e] text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                title="Reset"
                aria-label="Reset calculator"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
        {accelerationStatus.label && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <div
              className={`inline-flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusClasses}`}
              role="status"
              aria-live="polite"
              title={accelerationStatus.description}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  accelerationStatus.tone === 'active'
                    ? 'bg-blue-500 motion-safe:animate-pulse'
                    : accelerationStatus.tone === 'positive'
                      ? 'bg-green-500'
                      : accelerationStatus.tone === 'warning'
                        ? 'bg-amber-500'
                        : 'bg-gray-400'
                }`}
                aria-hidden="true"
              />
              <span className="truncate">{accelerationStatus.label}</span>
            </div>
            <span className="hidden truncate text-xs text-gray-500 dark:text-gray-500 md:block">
              {accelerationStatus.description}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
