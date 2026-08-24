'use client';

import { examples, type SearchMode } from '../lib/types';
import { Latex } from './Latex';

interface EmptyStateProps {
  onExampleClick: (value: string) => void;
  searchMode: SearchMode;
}

export function EmptyState({ onExampleClick, searchMode }: EmptyStateProps) {
  const copy = searchMode === 'multiple'
    ? {
        title: 'Multiple targets ready',
        description: 'Enter one value per row, optionally followed by its absolute uncertainty dz. The shared CPU search checks every expression against every target.',
      }
    : searchMode === 'function'
      ? {
          title: 'Function data ready',
          description: 'Enter measured points as x, y[, dy]. The variable x is enabled automatically and candidates are ranked by weighted mean squared error.',
        }
      : searchMode === 'multivariate'
        ? {
            title: 'Two-variable data ready',
            description: 'Enter rows as C₁, C₂, y[, dy]. Both variables are required, and CPU/WASM or GPU searches for one formula fitting every row.',
          }
      : {
          title: 'Ready to identify',
          description: 'Enter a decimal number above to search for matching mathematical expressions using the selected calculator operations.',
        };

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="max-w-md px-4 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-[#2a2a2e]">
          <svg className="h-8 w-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
          {copy.title}
        </h2>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-500">
          {copy.description}
        </p>
        {searchMode === 'constant' && (
          <div className="flex flex-wrap justify-center gap-2">
            {examples.map(example => (
              <button
                key={example.value}
                onClick={() => onExampleClick(example.value)}
                className="group relative rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:bg-[#2a2a2e] dark:text-gray-300 dark:hover:bg-[#3a3a3e]"
                title={example.description}
              >
                <Latex formula={example.label} />
                <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {example.description}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
