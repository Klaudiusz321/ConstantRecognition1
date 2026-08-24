'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  SearchResult,
  Filters,
  Precision,
  ActiveWorker,
  defaultFilters,
  ErrorMode,
  ComputeEngine,
  SearchBackend,
  SearchPhase,
  SearchMode,
  BatchTarget,
  SearchProgress as SearchProgressData,
} from './lib/types';
import { extractPrecision, evaluateRPN } from './lib/rpn';
import {
  buildTaskQueue, createResultFilter, SearchTask, CalculatorSelection,
  CALC4_CONSTS, CALC4_FUNCS, CALC4_OPS
} from './lib/taskQueue';
import { getCompressionRatio as computeCR } from './lib/cr';
import {
  DEFAULT_FUNCTION_DATASET,
  DEFAULT_MULTIPLE_DATASET,
  DEFAULT_MULTIVARIATE_DATASET,
  parseFunctionDataset,
  parseMultipleConstantsDataset,
  parseMultivariateDataset,
} from './lib/search-contract';
import { WebGPUConstantRecognizer, type GPUProgress } from './lib/webgpu-v2';
import {
  describeGPUCompletion,
  getAccelerationStatus,
  getGPUFallbackNotice,
  getGPUInputCompatibilityError,
  getGPUInputFallbackNotice,
} from './lib/gpu-ui';
import {
  Sidebar,
  InputBar,
  ResultCard,
  ResultsTable,
  EmptyState,
  SearchProgress,
  RecognitionWizard,
  BatchSummary,
} from './components';

const ALL_TOKENS = [...CALC4_CONSTS, ...CALC4_FUNCS, ...CALC4_OPS];
const MULTIVARIATE_STARTER_TOKENS = ['SQR', 'SQRT', 'PLUS'];

// Ensures that all worker/WASM fetches include the configured base path (if any).
// - Trailing slashes are removed so "//" never appears in URLs.
// - A leading "/" is added when needed so a value like "~user/app" becomes "/~user/app".
// - In the browser we return an absolute URL using window.location.origin; on the server we
//   return a path that Next.js can understand during static export.
const withBasePath = (path: string) => {
  const base = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/+$/g, '') ?? '';
  const normalizedBase = base ? (base.startsWith('/') ? base : `/${base}`) : '';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (typeof window === 'undefined') return `${normalizedBase}${normalizedPath}`;
  return new URL(`${normalizedBase}${normalizedPath}`, window.location.origin).toString();
};


export default function CalculatorPage() {
  const [inputValue, setInputValue] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode | null>(null);
  const [functionDataset, setFunctionDataset] = useState(DEFAULT_FUNCTION_DATASET);
  const [multipleDataset, setMultipleDataset] = useState(DEFAULT_MULTIPLE_DATASET);
  const [multivariateDataset, setMultivariateDataset] = useState(DEFAULT_MULTIVARIATE_DATASET);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [wasmLoaded, setWasmLoaded] = useState(false);
  const [gpuChecked, setGpuChecked] = useState(false);
  const [gpuSupported, setGpuSupported] = useState(false);
  const [gpuAdapterName, setGpuAdapterName] = useState<string | null>(null);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [computeEngine, setComputeEngine] = useState<ComputeEngine>('auto');
  const [searchBackend, setSearchBackend] = useState<SearchBackend | null>(null);
  const [searchPhase, setSearchPhase] = useState<SearchPhase>('idle');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [searchDetail, setSearchDetail] = useState<string | null>(null);
  const [searchDepth, setSearchDepth] = useState(7);
  const [threadCount, setThreadCount] = useState(4);
  const [autoThreads, setAutoThreads] = useState(true);
  const [detectedCPUs, setDetectedCPUs] = useState(4);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [precision, setPrecision] = useState<Precision>({});
  const [activeWorkers, setActiveWorkers] = useState<ActiveWorker[]>([]);
  const [taskProgress, setTaskProgress] = useState<SearchProgressData | null>(null);
  const [sortColumn, setSortColumn] = useState<'K' | 'REL_ERR' | 'CR' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [errorMode, setErrorMode] = useState<ErrorMode>('automatic');
  const [manualError, setManualError] = useState('');
  const [earlyExitCRThreshold, setEarlyExitCRThreshold] = useState(0.9);
  const [lastSearchExact, setLastSearchExact] = useState(false);
  const [lastSearchMode, setLastSearchMode] = useState<SearchMode>('constant');
  const [lastBatchTargets, setLastBatchTargets] = useState<BatchTarget[]>([]);
  // Calculator button palette: enabled button names, all 36 by default
  const [enabledTokens, setEnabledTokens] = useState<string[]>(ALL_TOKENS);
  // Button count of the search that produced the current results (for CR)
  const [lastSearchN, setLastSearchN] = useState(ALL_TOKENS.length);

  const workersRef = useRef<Worker[]>([]);
  const isAbortedRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const resolveAllRef = useRef<(() => void) | null>(null);
  const searchEndedRef = useRef(false);
  const gpuRecognizerRef = useRef<WebGPUConstantRecognizer | null>(null);
  const gpuInitializationRef = useRef<Promise<WebGPUConstantRecognizer> | null>(null);
  const gpuAbortRef = useRef<AbortController | null>(null);
  const searchRunIdRef = useRef(0);
  const mountedRef = useRef(true);
  const searchStatusRef = useRef<HTMLDivElement | null>(null);

  const isCalculating = searchPhase === 'running';
  const searchFinished = searchPhase === 'complete' || searchPhase === 'partial';
  const accelerationStatus = useMemo(
    () => getAccelerationStatus({
      checked: gpuChecked,
      supported: gpuSupported,
      engine: computeEngine,
      phase: searchPhase,
      backend: searchBackend,
      adapterName: gpuAdapterName,
      error: gpuError,
    }),
    [gpuChecked, gpuSupported, computeEngine, searchPhase, searchBackend, gpuAdapterName, gpuError],
  );

  const toggleToken = (token: string) => {
    setEnabledTokens(prev =>
      prev.includes(token) ? prev.filter(t => t !== token) : [...prev, token]
    );
  };
  const enableAllTokens = () => setEnabledTokens(ALL_TOKENS);
  const hasConstants = enabledTokens.some(t => CALC4_CONSTS.includes(t));
  const parsedFunctionDataset = useMemo(
    () => parseFunctionDataset(functionDataset),
    [functionDataset],
  );
  const parsedMultipleDataset = useMemo(
    () => parseMultipleConstantsDataset(multipleDataset),
    [multipleDataset],
  );
  const parsedMultivariateDataset = useMemo(
    () => parseMultivariateDataset(multivariateDataset),
    [multivariateDataset],
  );
  const canCalculate = searchMode === 'function'
    ? parsedFunctionDataset.error === null
    : searchMode === 'multivariate'
      ? parsedMultivariateDataset.error === null
    : searchMode === 'multiple'
      ? hasConstants && parsedMultipleDataset.error === null
      : searchMode === 'constant'
        ? hasConstants
        : false;

  const getCompressionRatio = (r: SearchResult): number => computeCR(r, lastSearchN);

  // Best result = MAXIMUM Compression Ratio (CR) - this is the correct identification criterion
  // CR rises initially as accuracy improves, then falls when overfitting starts
  // The maximum CR indicates the true match
  const bestResult = useMemo(() => {
    if (results.length === 0) return null;
    return [...results].sort((a, b) => {
      const aCR = getCompressionRatio(a);
      const bCR = getCompressionRatio(b);
      if (lastSearchExact) {
        if (a.REL_ERR !== b.REL_ERR) return a.REL_ERR - b.REL_ERR;
        return bCR - aCR;
      }
      if (aCR !== bCR) return bCR - aCR;
      return a.REL_ERR - b.REL_ERR;
    })[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, lastSearchExact, lastSearchN]);

  const initializeGPU = useCallback(async (
    force = false,
  ): Promise<WebGPUConstantRecognizer> => {
    if (force) {
      gpuRecognizerRef.current?.destroy();
      gpuRecognizerRef.current = null;
    }

    const existing = gpuRecognizerRef.current;
    if (existing?.isReady()) return existing;

    const pending = gpuInitializationRef.current;
    if (pending) return pending;

    setGpuChecked(false);
    setGpuError(null);

    const initialization = (async () => {
      try {
        const recognizer = await WebGPUConstantRecognizer.create({
          basePath: process.env.NEXT_PUBLIC_BASE_PATH,
          powerPreference: 'high-performance',
          runSelfTest: true,
          onDeviceLost: (info) => {
            if (!mountedRef.current) return;
            gpuRecognizerRef.current = null;
            setGpuSupported(false);
            setGpuChecked(true);
            setGpuError(
              `GPU device was lost (${info.reason})${info.message ? `: ${info.message}` : '.'}`,
            );
          },
        });

        if (!mountedRef.current) {
          recognizer.destroy();
          throw new Error('The calculator was closed while WebGPU was initializing.');
        }

        gpuRecognizerRef.current = recognizer;
        setGpuSupported(true);
        setGpuChecked(true);
        setGpuAdapterName(recognizer.info.adapterName);
        setGpuError(null);
        return recognizer;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (mountedRef.current) {
          setGpuSupported(false);
          setGpuChecked(true);
          setGpuError(message);
        }
        throw error;
      }
    })();

    gpuInitializationRef.current = initialization;
    try {
      return await initialization;
    } finally {
      if (gpuInitializationRef.current === initialization) {
        gpuInitializationRef.current = null;
      }
    }
  }, []);

  const retryGPU = useCallback(() => {
    if (searchPhase === 'running') return;
    void initializeGPU(true).catch(() => {
      // The exact failure is stored in gpuError and shown in Advanced settings.
    });
  }, [initializeGPU, searchPhase]);

  // Check for WASM support and detect CPUs
  useEffect(() => {
    let cancelled = false;

    const checkWasm = async () => {
      try {
        //const response = await fetch('/wasm/rpn_function.wasm');
        const response = await fetch(withBasePath('/wasm/rpn_function.wasm'));
        if (!cancelled) setWasmLoaded(response.ok);
      } catch {
        if (!cancelled) setWasmLoaded(false);
      }
    };
    void checkWasm();
    
    const cpus = navigator.hardwareConcurrency || 4;
    setDetectedCPUs(cpus);
    setThreadCount(cpus);

    void initializeGPU().catch(() => {
      // The exact failure is stored in gpuError and shown in Advanced settings.
    });

    return () => {
      cancelled = true;
    };
  }, [initializeGPU]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');

    const applyLayoutMode = (matches: boolean) => {
      setIsMobile(matches);
      setSidebarCollapsed(matches);
    };

    applyLayoutMode(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      applyLayoutMode(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!['complete', 'partial', 'aborted', 'error'].includes(searchPhase)) return;
    const frame = window.requestAnimationFrame(() => searchStatusRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [searchPhase]);

  useEffect(() => {
    mountedRef.current = true;
    const runIdRef = searchRunIdRef;
    return () => {
      mountedRef.current = false;
      runIdRef.current++;
      gpuAbortRef.current?.abort();
      gpuAbortRef.current = null;
      gpuRecognizerRef.current?.destroy();
      gpuRecognizerRef.current = null;
      workersRef.current.forEach((worker) => worker.terminate());
      workersRef.current = [];
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const calculate = async () => {
    if (!searchMode || !canCalculate || (searchMode === 'constant' && !inputValue)) return;

    const functionPoints = searchMode === 'function' ? parsedFunctionDataset.points : undefined;
    const multivariatePoints = searchMode === 'multivariate'
      ? parsedMultivariateDataset.points
      : undefined;
    const batchTargets = searchMode === 'multiple' ? parsedMultipleDataset.targets : undefined;
    const zNum = searchMode === 'function'
      ? functionPoints?.[0]?.y ?? 0
      : searchMode === 'multivariate'
        ? multivariatePoints?.[0]?.y ?? 0
      : searchMode === 'multiple'
        ? batchTargets?.[0]?.value ?? 0
        : parseFloat(inputValue);
    if (!Number.isFinite(zNum)) {
      setSearchError('Enter a finite numeric value before starting the search.');
      setSearchPhase('error');
      return;
    }

    const runId = ++searchRunIdRef.current;
    setLastSearchMode(searchMode);
    setLastBatchTargets(batchTargets ? [...batchTargets] : []);

    setSearchPhase('running');
    setResults([]);
    setTaskProgress(null);
    setSearchBackend(null);
    setSearchError(null);
    setSearchNotice(null);
    setSearchDetail(null);
    searchEndedRef.current = false;
    isAbortedRef.current = false;
    resolveAllRef.current = null;
    
    // Start timer (update every 500ms to reduce re-renders)
    setElapsedTime(0);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(Date.now() - startTimeRef.current);
    }, 500);

    const stopTimer = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedTime(Date.now() - startTimeRef.current);
    };
    
    // Calculate precision based on error mode
    let deltaZNum: number;
    
    if (searchMode !== 'constant' || errorMode === 'zero') {
      deltaZNum = 0;
    } else if (errorMode === 'manual' && manualError) {
      deltaZNum = parseFloat(manualError) || 0;
    } else {
      // automatic mode - use extractPrecision
      const autoPrecision = extractPrecision(inputValue);
      deltaZNum = parseFloat(autoPrecision.deltaZ || '0.5');
    }
    
    // Update precision display
    const relDeltaZ = zNum !== 0 ? deltaZNum / Math.abs(zNum) : 0;
    setPrecision(searchMode === 'function'
      ? {
          z: `f(x), ${functionPoints?.length ?? 0} points`,
          deltaZ: 'MSE ≤ 1.00e-12',
          relDeltaZ: 'weighted residuals',
        }
      : searchMode === 'multivariate'
        ? {
            z: `F(C₁,C₂), ${multivariatePoints?.length ?? 0} points`,
            deltaZ: 'MSE ≤ 1.00e-12',
            relDeltaZ: 'weighted residuals; both variables required',
          }
      : searchMode === 'multiple'
        ? {
            z: `${batchTargets?.length ?? 0} numerical targets`,
            deltaZ: 'per-row dz',
            relDeltaZ: 'evaluated independently',
          }
      : {
          z: inputValue,
          deltaZ: deltaZNum === 0 ? '0' : deltaZNum.toExponential(2),
          relDeltaZ: relDeltaZ === 0 ? '0' : relDeltaZ.toExponential(2)
        });
    const exactSearch = searchMode === 'function' || searchMode === 'multivariate' ||
      searchMode === 'multiple' || deltaZNum === 0;
    setLastSearchExact(exactSearch);
    setSortColumn(exactSearch ? 'REL_ERR' : 'CR');
    setSortDirection(exactSearch ? 'asc' : 'desc');

    // CPU/WASM computation
    const effectiveThreads = autoThreads ? detectedCPUs : threadCount;

    // Terminate existing workers
    workersRef.current.forEach(w => w.terminate());
    workersRef.current = [];

    // Calculator restriction from the button palette (canonical CALC4 order)
    const selection: CalculatorSelection = {
      consts: CALC4_CONSTS.filter(t => enabledTokens.includes(t)),
      funcs: CALC4_FUNCS.filter(t => enabledTokens.includes(t)),
      ops: CALC4_OPS.filter(t => enabledTokens.includes(t)),
    };
    setLastSearchN(
      selection.consts.length + selection.funcs.length + selection.ops.length
        + (searchMode === 'function' ? 1 : searchMode === 'multivariate' ? 2 : 0),
    );

    const gpuWasRequested = computeEngine === 'gpu' || (
      computeEngine === 'auto' && (!gpuChecked || gpuSupported)
    );
    const gpuInputValues = searchMode === 'function'
      ? (functionPoints ?? []).flatMap(point => point.dy > 0
          ? [point.x, point.y, point.dy]
          : [point.x, point.y])
      : searchMode === 'multivariate'
        ? (multivariatePoints ?? []).flatMap(point => point.dy > 0
            ? [point.c1, point.c2, point.y, point.dy]
            : [point.c1, point.c2, point.y])
      : searchMode === 'multiple'
        ? (batchTargets ?? []).flatMap(target => target.dy > 0
            ? [target.value, target.dy]
            : [target.value])
        : deltaZNum > 0
          ? [zNum, deltaZNum]
          : [zNum];
    const gpuInputError = getGPUInputCompatibilityError(gpuInputValues);

    if (gpuWasRequested && gpuInputError && computeEngine === 'gpu') {
      setSearchError(`GPU search cannot start: ${gpuInputError} Select CPU or Auto for this input.`);
      stopTimer();
      setSearchPhase('error');
      return;
    }
    if (gpuWasRequested && gpuInputError && computeEngine === 'auto') {
      setSearchNotice(getGPUInputFallbackNotice(gpuInputError));
    }

    const shouldTryGPU = gpuWasRequested && !gpuInputError;

    if (shouldTryGPU) {
      setGpuError(null);
      const controller = new AbortController();
      gpuAbortRef.current = controller;

      try {
        const recognizer = await initializeGPU();
        if (searchRunIdRef.current !== runId || controller.signal.aborted) {
          gpuAbortRef.current = null;
          return;
        }

        // Do not claim a GPU backend until device creation, shader compilation
        // and the real dispatch/readback self-test have all succeeded.
        setSearchBackend('gpu');

        if (searchMode === 'multiple' && batchTargets) {
          const batchGPUResults: SearchResult[] = [];
          let totalEvaluations = BigInt(0);
          let totalOverflowRetries = 0;
          let partial = false;

          for (let targetIndex = 0; targetIndex < batchTargets.length; targetIndex++) {
            const target = batchTargets[targetIndex];
            const targetSummary = await recognizer.search({
              target: target.value,
              minK: 1,
              maxK: searchDepth,
              calculator: selection,
              absoluteTolerance: target.dy,
              compressionRatioThreshold: earlyExitCRThreshold,
              ranking: 'relative-error',
              maxEvaluations: BigInt(100_000_000),
              maxDurationMs: 30_000,
              topN: 20,
              signal: controller.signal,
              onProgress: (progress: GPUProgress) => {
                if (searchRunIdRef.current !== runId) return;
                setTaskProgress({
                  done: targetIndex,
                  total: batchTargets.length,
                  complexityK: progress.K,
                  evaluations: progress.uniqueEvaluations.toLocaleString('en-US'),
                });
              },
            });

            totalEvaluations += targetSummary.uniqueEvaluations;
            totalOverflowRetries += targetSummary.overflowRetries;
            if (!['completed', 'accepted-at-minimal-k'].includes(targetSummary.stopReason)) {
              partial = true;
            }

            const best = targetSummary.results.find(result => result.accepted)
              ?? targetSummary.results[0];
            if (best) {
              batchGPUResults.push({
                cpuId: -1,
                K: best.K,
                RPN: best.rpn,
                result: String(best.value),
                REL_ERR: best.relativeError,
                status: best.accepted ? 'SUCCESS' : 'K_BEST',
                compressionRatio: best.compressionRatio,
                targetId: target.id,
                target: target.value,
              });
            }
            setTaskProgress({
              done: targetIndex + 1,
              total: batchTargets.length,
              complexityK: targetSummary.completedThroughK,
              evaluations: totalEvaluations.toLocaleString('en-US'),
            });
          }

          gpuAbortRef.current = null;
          if (searchRunIdRef.current !== runId || isAbortedRef.current) return;
          const acceptedCount = batchGPUResults.filter(result => result.status === 'SUCCESS').length;
          const recoveryNote = totalOverflowRetries > 0
            ? ` Buffer recovery reran ${totalOverflowRetries} overflowing tile${totalOverflowRetries === 1 ? '' : 's'}.`
            : '';
          setResults(batchGPUResults);
          setTaskProgress(null);
          setSearchNotice(null);
          setSearchDetail(
            `GPU processed ${batchTargets.length} targets independently; ` +
            `${acceptedCount} satisfied the acceptance criterion after CPU verification.${recoveryNote}`,
          );
          stopTimer();
          setSearchPhase(partial ? 'partial' : 'complete');
          return;
        }

        const summary = await recognizer.search({
          target: zNum,
          minK: 1,
          maxK: searchDepth,
          calculator: selection,
          absoluteTolerance: deltaZNum,
          compressionRatioThreshold: earlyExitCRThreshold,
          functionPoints,
          multivariatePoints,
          functionErrorTolerance: 1e-12,
          ranking: exactSearch ? 'relative-error' : 'compression-ratio',
          maxEvaluations: BigInt(100_000_000),
          maxDurationMs: 30_000,
          topN: 100,
          signal: controller.signal,
          onProgress: (progress: GPUProgress) => {
            if (searchRunIdRef.current !== runId) return;
            setTaskProgress({
              done: Math.min(progress.formIndex + 1, progress.formCount),
              total: Math.max(progress.formCount, 1),
              complexityK: progress.K,
              evaluations: progress.uniqueEvaluations.toLocaleString('en-US'),
            });
          },
        });

        gpuAbortRef.current = null;
        if (searchRunIdRef.current !== runId || isAbortedRef.current) return;

        const gpuResults: SearchResult[] = summary.results.map((result) => ({
          cpuId: -1,
          K: result.K,
          RPN: result.rpn,
          result: searchMode === 'function' || searchMode === 'multivariate'
            ? `MSE ${result.relativeError.toExponential(6)}`
            : String(result.value),
          REL_ERR: result.relativeError,
          status: result.accepted ? 'SUCCESS' : 'K_BEST',
          compressionRatio: result.compressionRatio,
        }));

        const completion = describeGPUCompletion({
          stopReason: summary.stopReason,
          completedThroughK: summary.completedThroughK,
          evaluationCount: summary.uniqueEvaluations.toLocaleString('en-US'),
          resultCount: gpuResults.length,
          overflowRetries: summary.overflowRetries,
        });

        setResults(gpuResults);
        setTaskProgress(null);
        setSearchNotice(null);
        setSearchDetail(completion.detail);
        stopTimer();
        setSearchPhase(completion.phase);
        return;
      } catch (error) {
        gpuAbortRef.current = null;
        if (searchRunIdRef.current !== runId || isAbortedRef.current) return;

        const message = error instanceof Error ? error.message : String(error);
        const failedRecognizer = gpuRecognizerRef.current;
        gpuRecognizerRef.current = null;
        failedRecognizer?.destroy();
        setGpuSupported(false);
        setGpuChecked(true);
        setGpuError(message);

        if (computeEngine === 'gpu') {
          setSearchBackend(null);
          setTaskProgress(null);
          setSearchError(`GPU search failed: ${message}`);
          setSearchDetail(null);
          stopTimer();
          setSearchPhase('error');
          return;
        }

        setSearchNotice(getGPUFallbackNotice());
      }
    }

    setSearchBackend('cpu');

    // Dynamic load balancing: the search space is over-decomposed into many
    // small slices ("bag of tasks") and idle workers pull the next slice from
    // the queue. The thread count only controls how many workers run
    // simultaneously — no worker is married to a fixed slice, so uneven work
    // distribution (heavy gamma-chain structures, E-cores, tab throttling)
    // self-balances instead of leaving one lagging worker at the end.
    const tasks = buildTaskQueue(searchDepth, selection, {
      variableCount: searchMode === 'function' ? 1 : searchMode === 'multivariate' ? 2 : 0,
      splitUnaryChain: searchMode !== 'function' && searchMode !== 'multivariate',
    });
    const totalTasks = tasks.length;
    let nextTaskIndex = 0;
    let remainingTasks = totalTasks;
    let currentWaveK = tasks[0]?.maxK ?? 0;
    let waveEndIndex = 0;
    while (waveEndIndex < tasks.length && tasks[waveEndIndex].maxK === currentWaveK) {
      waveEndIndex++;
    }
    let remainingInWave = waveEndIndex;
    let aliveWorkers = 0;
    let acceptedResultFound = false;
    const inFlight = new Map<number, SearchTask>();          // workerId -> running task
    const idlePool: { worker: Worker; workerId: number }[] = []; // parked workers (queue drained)
    const keepRow = createResultFilter();
    const batchBestByTarget = new Map<number, SearchResult>();

    setTaskProgress({ done: 0, total: totalTasks, complexityK: 1 });

    const allComplete = new Promise<void>(resolve => {
      resolveAllRef.current = resolve;
    });

    const endSearch = () => {
      if (searchEndedRef.current) return;
      searchEndedRef.current = true;
      workersRef.current.forEach(w => w.terminate());
      workersRef.current = [];
      setActiveWorkers([]);
      resolveAllRef.current?.();
    };

    const assignTask = (worker: Worker, workerId: number) => {
      if (searchEndedRef.current || isAbortedRef.current) return;
      // Preserve scientific minimality: no task at K+1 starts until every
      // slice at K has completed. Workers still load-balance dynamically
      // inside the active complexity level.
      const task = nextTaskIndex < waveEndIndex ? tasks[nextTaskIndex] : undefined;
      if (!task) {
        // Queue drained; park this worker (it may be revived if another
        // worker dies and its task is requeued)
        inFlight.delete(workerId);
        idlePool.push({ worker, workerId });
        setActiveWorkers(prev => prev.filter(w => w.id !== workerId));
        return;
      }
      nextTaskIndex++;
      inFlight.set(workerId, task);
      setActiveWorkers(prev => {
        const running = { id: workerId, status: 'running', currentK: task.maxK };
        return prev.some(w => w.id === workerId)
          ? prev.map(w => (w.id === workerId ? { ...w, currentK: task.maxK } : w))
          : [...prev, running];
      });
      setTaskProgress(prev => prev ? {
        ...prev,
        complexityK: Math.max(prev.complexityK ?? 1, task.maxK),
      } : prev);
      worker.postMessage({
        z: zNum,
        inputPrecision: deltaZNum,
        MinCodeLength: task.minK,
        MaxCodeLength: task.maxK,
        cpuId: task.taskId,
        ncpus: task.taskCount,
        earlyExitCRThreshold,
        workerId,
        constList: task.constList,
        funcList: task.funcList,
        opList: task.opList,
        searchMode,
        functionPoints,
        multivariatePoints,
        batchTargets,
      });
    };

    const onWorkerMessage = (worker: Worker, workerId: number) => (e: MessageEvent) => {
      const data = e.data;
      if (!data || data.type === 'ready') return;
      if (searchEndedRef.current || isAbortedRef.current) return;

      // Collect all results in one batch to avoid multiple re-renders.
      // Rows that don't improve on what is already shown for their K are
      // dropped — with hundreds of slices most task-local bests are redundant.
      const newResults: SearchResult[] = [];
      const rows = Array.isArray(data.results) ? data.results : [];

      rows.forEach((r: {
        K: number;
        RPN: string;
        result: string;
        REL_ERR: number;
        status?: string;
        COMPRESSION_RATIO?: number;
        target_id?: number;
        target?: number;
      }) => {
        if (!r || typeof r.RPN !== 'string') return;
        if (searchMode === 'multiple') {
          if (!Number.isInteger(r.target_id)) return;
          const targetId = Number(r.target_id);
          const target = batchTargets?.find(item => item.id === targetId);
          if (!target) return;
          let numericValue = 'N/A';
          try {
            numericValue = evaluateRPN(r.RPN).toString();
          } catch {
            // Keep the RPN and error even if display evaluation is unavailable.
          }
          const candidate: SearchResult = {
            cpuId: workerId,
            K: r.K,
            RPN: r.RPN,
            result: numericValue,
            REL_ERR: Number(r.REL_ERR),
            status: r.result === 'SUCCESS' ? 'SUCCESS' : 'K_BEST',
            compressionRatio: r.COMPRESSION_RATIO,
            targetId,
            target: target.value,
          };
          const existing = batchBestByTarget.get(targetId);
          const candidatePriority = candidate.status === 'SUCCESS' ? 0 : 1;
          const existingPriority = existing?.status === 'SUCCESS' ? 0 : 1;
          if (
            !existing ||
            candidatePriority < existingPriority ||
            (candidatePriority === existingPriority && candidate.REL_ERR < existing.REL_ERR) ||
            (candidatePriority === existingPriority && candidate.REL_ERR === existing.REL_ERR && candidate.K < existing.K)
          ) {
            batchBestByTarget.set(targetId, candidate);
            newResults.push(candidate);
          }
          return;
        }
        if (!keepRow(r.K, r.REL_ERR, r.RPN)) return;
        let numericValue: string;
        if (searchMode === 'function' || searchMode === 'multivariate') {
          numericValue = `MSE ${r.REL_ERR.toExponential(6)}`;
        } else {
          try {
            numericValue = evaluateRPN(r.RPN).toString();
          } catch {
            numericValue = 'N/A';
          }
        }
        newResults.push({
          cpuId: workerId,
          K: r.K,
          RPN: r.RPN,
          result: numericValue,
          REL_ERR: r.REL_ERR,
          status: r.result === 'INTERMEDIATE' ? 'K_BEST' : (r.result || r.status || 'K_BEST'),
          compressionRatio: r.COMPRESSION_RATIO
        });
      });

      // Handle final result (SUCCESS/FAILURE/ABORTED) from top-level data
      const batchIsComplete = batchTargets !== undefined &&
        batchBestByTarget.size === batchTargets.length &&
        [...batchBestByTarget.values()].every(result => result.status === 'SUCCESS');
      const isSuccess = searchMode === 'multiple'
        ? batchIsComplete
        : data.result === 'SUCCESS';
      if (searchMode !== 'multiple' && data.result && data.RPN && (isSuccess || keepRow(data.K, data.REL_ERR, data.RPN))) {
        let numericValue: string;
        if (searchMode === 'function' || searchMode === 'multivariate') {
          numericValue = `MSE ${Number(data.REL_ERR).toExponential(6)}`;
        } else {
          try {
            numericValue = evaluateRPN(data.RPN).toString();
          } catch {
            numericValue = 'N/A';
          }
        }
        newResults.push({
          cpuId: workerId,
          K: data.K,
          RPN: data.RPN,
          result: numericValue,
          REL_ERR: data.REL_ERR,
          status: data.result, // SUCCESS, FAILURE, ABORTED
          compressionRatio: data.COMPRESSION_RATIO
        });
      }

      if (newResults.length > 0) {
        if (searchMode === 'multiple') {
          setResults([...batchBestByTarget.values()].sort(
            (a, b) => (a.targetId ?? 0) - (b.targetId ?? 0),
          ));
        } else setResults(prev => {
          const merged = new Map(prev.map(result => [`${result.K}:${result.RPN}`, result]));
          for (const result of newResults) {
            const key = `${result.K}:${result.RPN}`;
            const existing = merged.get(key);
            if (!existing || result.status === 'SUCCESS' || result.REL_ERR < existing.REL_ERR) {
              merged.set(key, result);
            }
          }
          return [...merged.values()];
        });
      }

      if (isSuccess) {
        acceptedResultFound = true;
        endSearch();
        return;
      }

      // Task finished without a definitive match — pull the next slice
      remainingTasks--;
      remainingInWave--;
      setTaskProgress({
        done: totalTasks - remainingTasks,
        total: totalTasks,
        complexityK: typeof data.K === 'number' ? data.K : undefined,
      });
      if (remainingTasks <= 0) {
        endSearch();
        return;
      }
      if (remainingInWave <= 0) {
        currentWaveK = tasks[nextTaskIndex]?.maxK ?? 0;
        waveEndIndex = nextTaskIndex;
        while (waveEndIndex < tasks.length && tasks[waveEndIndex].maxK === currentWaveK) {
          waveEndIndex++;
        }
        remainingInWave = waveEndIndex - nextTaskIndex;

        assignTask(worker, workerId);
        const parkedWorkers = idlePool.splice(0);
        parkedWorkers.forEach(({ worker: parkedWorker, workerId: parkedId }) => {
          assignTask(parkedWorker, parkedId);
        });
        return;
      }
      assignTask(worker, workerId);
    };

    const onWorkerError = (worker: Worker, workerId: number) => (error: ErrorEvent) => {
      if (searchEndedRef.current || isAbortedRef.current) return;
      console.error(`Worker ${workerId} error:`, error.message || error);
      aliveWorkers--;
      worker.terminate();
      workersRef.current = workersRef.current.filter(w => w !== worker);
      setActiveWorkers(prev => prev.filter(w => w.id !== workerId));
      // Requeue the slice this worker was computing so nothing is skipped
      const task = inFlight.get(workerId);
      if (task) {
        inFlight.delete(workerId);
        tasks.splice(nextTaskIndex, 0, task);
        waveEndIndex++;
        const idle = idlePool.pop();
        if (idle) assignTask(idle.worker, idle.workerId);
      }
      if (aliveWorkers <= 0) {
        // Every worker died; end the search so the UI doesn't hang
        endSearch();
      }
    };

    const workerCount = Math.min(effectiveThreads, totalTasks);
    const workers: Worker[] = [];
    const initialActiveWorkers: ActiveWorker[] = [];

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(withBasePath('/wasm/worker.js'));
      worker.onmessage = onWorkerMessage(worker, i);
      worker.onerror = onWorkerError(worker, i);
      workers.push(worker);
      initialActiveWorkers.push({ id: i, status: 'running', currentK: 1 });
    }

    aliveWorkers = workerCount;
    workersRef.current = workers;
    setActiveWorkers(initialActiveWorkers);

    // Hand each worker its first slice; afterwards they pull from the queue
    workers.forEach((worker, i) => assignTask(worker, i));

    // Wait for the task queue to drain (or SUCCESS/abort)
    await allComplete;
    
    stopTimer();
    
    if (!isAbortedRef.current) {
      setTaskProgress(null);
      if (searchMode === 'multiple' && batchTargets) {
        const acceptedCount = [...batchBestByTarget.values()].filter(
          result => result.status === 'SUCCESS',
        ).length;
        setSearchDetail(
          `The CPU/WASM batch engine evaluated the shared search space once for ` +
          `${batchTargets.length} targets; ${acceptedCount} satisfied the acceptance criterion.`,
        );
      } else {
        setSearchDetail(acceptedResultFound
          ? 'The CPU/WASM engine found a formula satisfying the strict acceptance criterion.'
          : 'The CPU/WASM engine completed the selected search space.');
      }
      setSearchPhase('complete');
    }
  };

  const handleAbort = () => {
    const wasRunning = searchPhase === 'running';
    searchRunIdRef.current++;
    isAbortedRef.current = true;
    gpuAbortRef.current?.abort();
    gpuAbortRef.current = null;
    workersRef.current.forEach(w => w.terminate());
    workersRef.current = [];
    setActiveWorkers([]);
    resolveAllRef.current?.();
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setElapsedTime(Date.now() - startTimeRef.current);
    setSearchPhase(wasRunning ? 'aborted' : 'idle');
    setSearchBackend(null);
    setTaskProgress(null);
    setSearchDetail(null);
    setSearchError(null);
    setSearchNotice(wasRunning ? 'Search stopped. You can adjust the settings and try again.' : null);
  };

  const handleReset = () => {
    handleAbort();
    if (searchMode === 'function') {
      setFunctionDataset(DEFAULT_FUNCTION_DATASET);
    } else if (searchMode === 'multivariate') {
      setMultivariateDataset(DEFAULT_MULTIVARIATE_DATASET);
    } else if (searchMode === 'multiple') {
      setMultipleDataset(DEFAULT_MULTIPLE_DATASET);
    } else {
      setInputValue('');
    }
    setResults([]);
    setPrecision({});
    setSortColumn(null);
    setSortDirection('asc');
    setFilters(defaultFilters);
    setLastSearchExact(false);
    setSearchPhase('idle');
    setSearchError(null);
    setSearchNotice(null);
    setSearchDetail(null);
    setSearchBackend(null);
    setElapsedTime(0);
  };

  const handleExampleClick = (value: string) => {
    setInputValue(value);
  };

  const clearModeOutput = () => {
    setResults([]);
    setPrecision({});
    setTaskProgress(null);
    setSortColumn(null);
    setSortDirection('asc');
    setSearchPhase('idle');
    setSearchError(null);
    setSearchNotice(null);
    setSearchDetail(null);
    setSearchBackend(null);
    setElapsedTime(0);
  };

  const handleModeSelect = (mode: SearchMode) => {
    if (isCalculating) return;
    clearModeOutput();
    if (mode === 'multivariate') {
      // The reference F(C1,C2) formula is only six tokens long, but it is
      // buried behind hundreds of millions of combinations in full CALC4.
      // Start with its explicit scientific grammar; "Enable all" remains
      // available for broader searches.
      setEnabledTokens(MULTIVARIATE_STARTER_TOKENS);
    } else if (
      enabledTokens.length === MULTIVARIATE_STARTER_TOKENS.length &&
      MULTIVARIATE_STARTER_TOKENS.every(token => enabledTokens.includes(token))
    ) {
      setEnabledTokens(ALL_TOKENS);
    }
    setSearchMode(mode);
  };

  const handleOpenWizard = () => {
    if (isCalculating) return;
    clearModeOutput();
    setSearchMode(null);
  };

  return (
    <div className="flex h-screen w-screen bg-gray-50 dark:bg-[#1a1a1d] overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        wasmLoaded={wasmLoaded}
        gpuChecked={gpuChecked}
        gpuSupported={gpuSupported}
        gpuAdapterName={gpuAdapterName}
        gpuError={gpuError}
        onRetryGPU={retryGPU}
        computeEngine={computeEngine}
        setComputeEngine={setComputeEngine}
        detectedCPUs={detectedCPUs}
        searchDepth={searchDepth}
        setSearchDepth={setSearchDepth}
        threadCount={threadCount}
        setThreadCount={setThreadCount}
        autoThreads={autoThreads}
        setAutoThreads={setAutoThreads}
        precision={precision}
        activeWorkers={activeWorkers}
        isCalculating={isCalculating}
        onAbort={handleAbort}
        isMobile={isMobile}
        isOpen={!sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        errorMode={errorMode}
        setErrorMode={setErrorMode}
        manualError={manualError}
        setManualError={setManualError}
        earlyExitCRThreshold={earlyExitCRThreshold}
        setEarlyExitCRThreshold={setEarlyExitCRThreshold}
        enabledTokens={enabledTokens}
        onToggleToken={toggleToken}
        onEnableAll={enableAllTokens}
        searchMode={searchMode}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {searchMode && (
          <InputBar
            inputValue={inputValue}
            setInputValue={setInputValue}
            searchMode={searchMode}
            setSearchMode={handleModeSelect}
            functionDataset={functionDataset}
            setFunctionDataset={setFunctionDataset}
            functionDatasetError={parsedFunctionDataset.error}
            multipleDataset={multipleDataset}
            setMultipleDataset={setMultipleDataset}
            multipleDatasetError={parsedMultipleDataset.error}
            multivariateDataset={multivariateDataset}
            setMultivariateDataset={setMultivariateDataset}
            multivariateDatasetError={parsedMultivariateDataset.error}
            onOpenWizard={handleOpenWizard}
            isCalculating={isCalculating}
            canCalculate={canCalculate}
            onCalculate={calculate}
            onReset={handleReset}
            accelerationStatus={accelerationStatus}
          />
        )}

        {searchError && (
          <div
            ref={searchPhase === 'error' ? searchStatusRef : undefined}
            id="search-status-summary"
            role="alert"
            tabIndex={-1}
            className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-700 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
          >
            {searchError}
          </div>
        )}

        {searchNotice && (
          <div
            ref={searchPhase === 'aborted' ? searchStatusRef : undefined}
            id={searchPhase === 'aborted' ? 'search-status-summary' : undefined}
            role="status"
            aria-live="polite"
            tabIndex={searchPhase === 'aborted' ? -1 : undefined}
            className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800 outline-none focus:ring-2 focus:ring-inset focus:ring-amber-500 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
          >
            {searchNotice}
          </div>
        )}

        {!searchMode ? (
          <RecognitionWizard onSelect={handleModeSelect} />
        ) : isCalculating ? (
          <SearchProgress
            backend={searchBackend}
            elapsedTime={elapsedTime}
            progress={taskProgress}
            precision={precision.deltaZ}
            onAbort={handleAbort}
          />
        ) : results.length > 0 && (lastSearchMode === 'multiple' || bestResult) ? (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-white dark:bg-[#1a1a1d]">
            {/* Search summary */}
            {searchFinished && !isCalculating && (
              <div
                ref={searchStatusRef}
                id="search-status-summary"
                role="status"
                aria-live="polite"
                tabIndex={-1}
                className={`border-b px-4 py-3 outline-none focus:ring-2 focus:ring-inset ${
                  searchPhase === 'partial'
                    ? 'border-amber-200 bg-amber-50 text-amber-900 focus:ring-amber-500 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
                    : 'border-green-200 bg-green-50 text-green-900 focus:ring-green-500 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200'
                }`}
              >
                <div className="mx-auto flex max-w-5xl flex-col justify-between gap-1 sm:flex-row sm:items-center sm:gap-4">
                  <div>
                    <div className="text-sm font-semibold">
                      {searchPhase === 'partial'
                        ? 'Verified results — search limit reached'
                        : searchBackend === 'gpu'
                          ? 'GPU accelerated · verified on CPU'
                          : 'Search complete on CPU'}
                    </div>
                    {searchDetail && <p className="mt-0.5 text-xs opacity-80">{searchDetail}</p>}
                  </div>
                  <div className="shrink-0 text-xs font-medium sm:text-right">
                    {results.length} result{results.length !== 1 ? 's' : ''} · {(elapsedTime / 1000).toFixed(2)}s
                  </div>
                </div>
              </div>
            )}
            {/* Mode-specific summary */}
            {lastSearchMode === 'multiple' ? (
              <BatchSummary targets={lastBatchTargets} results={results} />
            ) : bestResult ? (
              <ResultCard
                result={bestResult}
                allResults={results}
                crThreshold={earlyExitCRThreshold}
                instructionCount={lastSearchN}
                errorLabel={lastSearchMode === 'function' || lastSearchMode === 'multivariate' ? 'Weighted MSE' : 'Relative Error'}
                valueLabel={lastSearchMode === 'function' || lastSearchMode === 'multivariate' ? 'Fit Metric' : 'Numeric Value'}
                functionMode={lastSearchMode === 'function' || lastSearchMode === 'multivariate'}
                variableLabel={lastSearchMode === 'multivariate' ? 'contains C₁ and C₂' : 'contains x'}
                functionErrorTolerance={1e-12}
              />
            ) : null}
            {/* Results table */}
            <ResultsTable
              results={results}
              filters={filters}
              setFilters={setFilters}
              sortColumn={sortColumn}
              setSortColumn={setSortColumn}
              sortDirection={sortDirection}
              setSortDirection={setSortDirection}
              instructionCount={lastSearchN}
              errorLabel={lastSearchMode === 'function' || lastSearchMode === 'multivariate' ? 'MSE' : 'Rel. Error'}
              searchMode={lastSearchMode}
            />
          </div>
        ) : searchFinished ? (
          <div className="flex flex-1 items-center justify-center px-4 py-8">
            <div
              ref={searchStatusRef}
              id="search-status-summary"
              role="status"
              aria-live="polite"
              tabIndex={-1}
              className={`w-full max-w-lg rounded-2xl border p-6 text-center outline-none focus:ring-2 sm:p-8 ${
                searchPhase === 'partial'
                  ? 'border-amber-200 bg-amber-50 focus:ring-amber-500 dark:border-amber-900/60 dark:bg-amber-950/30'
                  : 'border-gray-200 bg-white focus:ring-[#0066cc] dark:border-[#2a2a2e] dark:bg-[#202024]'
              }`}
            >
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {searchPhase === 'partial' ? 'Search limit reached' : 'Search complete'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                {searchDetail ?? 'No matching formulas were found with the selected settings.'}
              </p>
            </div>
          </div>
        ) : (
          <EmptyState searchMode={searchMode} onExampleClick={handleExampleClick} />
        )}
      </main>
    </div>
  );
}
