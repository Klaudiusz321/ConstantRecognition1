import type { RecognitionTarget } from './types';

export function resolveWorkerCount(
  recognitionTarget: RecognitionTarget,
  autoThreads: boolean,
  detectedCPUs: number,
  threadCount: number,
) {
  if (recognitionTarget === 'multiple') return 1;
  return autoThreads ? detectedCPUs : threadCount;
}
