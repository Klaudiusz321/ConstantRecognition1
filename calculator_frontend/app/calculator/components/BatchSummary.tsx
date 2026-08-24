'use client';

import type { BatchTarget, SearchResult } from '../lib/types';
import { rpnToLatex } from '../lib/rpn';
import { Latex } from './Latex';

interface BatchSummaryProps {
  targets: readonly BatchTarget[];
  results: readonly SearchResult[];
}

export function BatchSummary({ targets, results }: BatchSummaryProps) {
  const accepted = results.filter(result => result.status === 'SUCCESS').length;
  const byTarget = new Map(results.map(result => [result.targetId, result]));

  return (
    <section className="border-b border-gray-200 bg-linear-to-r from-[#0066cc]/5 to-transparent p-4 dark:border-[#2a2a2e] dark:from-[#0066cc]/10 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0066cc]">Multiple-constant report</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-950 dark:text-white">
              {accepted} of {targets.length} targets satisfy the acceptance criterion
            </h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Every row keeps its best independently verified expression.
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {targets.map(target => {
            const result = byTarget.get(target.id);
            const success = result?.status === 'SUCCESS';
            return (
              <article key={target.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-[#34343a] dark:bg-[#202024]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-400">Target {target.id}</p>
                    <p className="mt-1 break-all font-mono text-sm text-gray-900 dark:text-white">{target.value}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                    success
                      ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                  }`}>
                    {success ? 'ACCEPTED' : result ? 'BEST FOUND' : 'NO RESULT'}
                  </span>
                </div>
                {result && (
                  <div className="mt-4 border-t border-gray-100 pt-3 dark:border-[#34343a]">
                    <div className="overflow-x-auto text-base text-gray-900 dark:text-white">
                      <Latex formula={rpnToLatex(result.RPN)} />
                    </div>
                    <div className="mt-2 flex justify-between gap-3 font-mono text-[11px] text-gray-500">
                      <span>K={result.K}</span>
                      <span>err={result.REL_ERR.toExponential(2)}</span>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
