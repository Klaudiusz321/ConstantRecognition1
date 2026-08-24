'use client';

import type { SearchMode } from '../lib/types';

interface RecognitionWizardProps {
  onSelect: (mode: SearchMode) => void;
}

const modes: ReadonlyArray<{
  mode: SearchMode;
  step: string;
  title: string;
  description: string;
  input: string;
  result: string;
}> = [
  {
    mode: 'constant',
    step: '01',
    title: 'Recognize one constant',
    description: 'Find a compact RPN expression for one numerical target.',
    input: 'Input: z with optional uncertainty',
    result: 'Output: ranked candidate formulas',
  },
  {
    mode: 'multiple',
    step: '02',
    title: 'Recognize multiple constants',
    description: 'Evaluate each generated expression against a complete list of targets.',
    input: 'Input: one z[, dz] target per row',
    result: 'Output: one verified result per target',
  },
  {
    mode: 'function',
    step: '03',
    title: 'Recognize a function',
    description: 'Find one expression containing x that fits every observation.',
    input: 'Input: x, y[, dy] observations',
    result: 'Output: formula and weighted MSE',
  },
];

export function RecognitionWizard({ onSelect }: RecognitionWizardProps) {
  return (
    <section className="flex flex-1 overflow-auto px-4 py-10 sm:px-6 lg:px-10" aria-labelledby="recognition-wizard-title">
      <div className="m-auto w-full max-w-6xl">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0066cc]">Recognition wizard</p>
          <h2 id="recognition-wizard-title" className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-4xl">
            What do you want to recognize?
          </h2>
          <p className="mt-4 text-base leading-7 text-gray-600 dark:text-gray-400">
            The selected scientific task controls the input contract, available terminals, execution path, and result report.
          </p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {modes.map((option) => (
            <button
              key={option.mode}
              type="button"
              onClick={() => onSelect(option.mode)}
              className="group flex min-h-72 flex-col rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#0066cc] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#0066cc] dark:border-[#2a2a2e] dark:bg-[#202024]"
            >
              <span className="font-mono text-xs font-semibold text-[#0066cc]">{option.step}</span>
              <h3 className="mt-5 text-xl font-semibold text-gray-950 dark:text-white">{option.title}</h3>
              <p className="mt-3 flex-1 text-sm leading-6 text-gray-600 dark:text-gray-400">{option.description}</p>
              <div className="mt-6 space-y-2 border-t border-gray-100 pt-4 text-xs text-gray-500 dark:border-[#34343a] dark:text-gray-400">
                <p>{option.input}</p>
                <p>{option.result}</p>
              </div>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#0066cc]">
                Configure search <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
