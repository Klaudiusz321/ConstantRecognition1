'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { SearchResult, Filters, Precision, ActiveWorker, defaultFilters, ErrorMode, ComputeMode, RecognitionTarget, Domain, CalculatorMode, SearchCalculatorSpec } from './lib/types';
import { CalculatorId, DEFAULT_CALCULATOR_ID, getCalculatorById } from './lib/calculators';
import { evaluateRPNDisplay } from './lib/rpn';
import { resolveInputUncertainty } from './lib/input';
import { parseRecognitionInput, toGpuValue } from './lib/recognition/targets';
import { resolveWorkerCount } from './lib/execution';
import { mapWorkerResultPayload } from './lib/results';
import { decideGpuWorkload } from './lib/webgpu/workload';
import { useWebGPU } from './hooks/useWebGPU';
import { Sidebar, InputBar, ResultCard, ResultsTable, EmptyState } from './components';

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
  const [results, setResults] = useState<SearchResult[]>([]);
  const [wasmLoaded, setWasmLoaded] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [searchDepth, setSearchDepth] = useState(7);
  const [threadCount, setThreadCount] = useState(4);
  const [autoThreads, setAutoThreads] = useState(true);
  const [detectedCPUs, setDetectedCPUs] = useState(4);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [precision, setPrecision] = useState<Precision>({});
  const [activeWorkers, setActiveWorkers] = useState<ActiveWorker[]>([]);
  const [sortColumn, setSortColumn] = useState<'K' | 'REL_ERR' | 'CR' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchFinished, setSearchFinished] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [errorMode, setErrorMode] = useState<ErrorMode>('automatic');
  const [manualError, setManualError] = useState('');
  const [computeMode, setComputeMode] = useState<ComputeMode>('cpu');
  const [selectedCalculatorId, setSelectedCalculatorId] = useState<CalculatorId>(DEFAULT_CALCULATOR_ID);
  const [earlyExitCRThreshold, setEarlyExitCRThreshold] = useState(0.9);
  const [lastSearchExact, setLastSearchExact] = useState(false);
  const [recognitionTarget, setRecognitionTarget] = useState<RecognitionTarget>('constant');
  const [domain, setDomain] = useState<Domain>('real');
  const [calculatorMode, setCalculatorMode] = useState<CalculatorMode>('standard');
  const [inputError, setInputError] = useState<string | null>(null);
  const [backendNotice, setBackendNotice] = useState<string | null>(null);
  const [customCalculatorSpec, setCustomCalculatorSpec] = useState<SearchCalculatorSpec | null>(null);
  
  const workersRef = useRef<Worker[]>([]);
  const isAbortedRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const resolveAllRef = useRef<(() => void) | null>(null);
  const searchEndedRef = useRef(false);

  const {
    gpuAvailable,
    gpuInfo,
    search: searchGPU,
    abort: abortGPU
  } = useWebGPU();
  const gpuName = gpuInfo?.name;
  const selectedCalculator = useMemo(
    () => getCalculatorById(selectedCalculatorId),
    [selectedCalculatorId]
  );
  const defaultCalculatorSpec = useMemo<SearchCalculatorSpec>(() => ({
    consts: [...selectedCalculator.constantsCore, ...selectedCalculator.constantsRedundant]
      .filter((token) => domain === 'complex' || token !== 'I'),
    funcs: [...selectedCalculator.unaryCore, ...selectedCalculator.unaryRedundant],
    ops: [...selectedCalculator.operatorsCommutative, ...selectedCalculator.operatorsNoncommutative],
  }), [domain, selectedCalculator]);
  const calculatorSpec = useMemo<SearchCalculatorSpec>(() => {
    if (calculatorMode === 'standard' || calculatorMode === 'fire_everything') return defaultCalculatorSpec;
    if (!customCalculatorSpec) return defaultCalculatorSpec;
    const consts = customCalculatorSpec.consts.filter((token) => domain === 'complex' || token !== 'I');
    return {
      consts: consts.length > 0 ? consts : defaultCalculatorSpec.consts.slice(0, 1),
      funcs: customCalculatorSpec.funcs,
      ops: customCalculatorSpec.ops,
    };
  }, [calculatorMode, customCalculatorSpec, defaultCalculatorSpec, domain]);
  
  // Helper to calculate compression ratio
  const getCompressionRatio = (r: SearchResult): number => {
    if (typeof r.REL_ERR === 'number' && r.K > 0 && Number.isFinite(r.REL_ERR) && r.REL_ERR === 0) {
      return 16.0 / r.K / Math.log10(36);
    }
    if (r.compressionRatio !== undefined && r.compressionRatio !== null) {
      return Math.max(0, Number.isFinite(r.compressionRatio) ? r.compressionRatio : 0);
    }
    if (typeof r.REL_ERR === 'number' && r.K > 0 && Number.isFinite(r.REL_ERR) && r.REL_ERR < 1.0) {
      const numerator = r.REL_ERR === 0 ? 16.0 : -Math.log10(r.REL_ERR);
      return Math.max(0, numerator / r.K / Math.log10(36));
    }
    return 0;
  };

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
  }, [results, lastSearchExact]);

  // Check for WASM support and detect CPUs
  useEffect(() => {
    const checkWasm = async () => {
      try {
        //const response = await fetch('/wasm/rpn_function.wasm');
        const response = await fetch(withBasePath('/wasm/rpn_function.wasm'));
        setWasmLoaded(response.ok);
      } catch {
        setWasmLoaded(false);
      }
    };
    checkWasm();
    
    const cpus = navigator.hardwareConcurrency || 4;
    setDetectedCPUs(cpus);
    setThreadCount(cpus);
    
  }, []);

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
    document.documentElement.classList.add('calculator-viewport');
    document.body.classList.add('calculator-viewport');

    return () => {
      document.documentElement.classList.remove('calculator-viewport');
      document.body.classList.remove('calculator-viewport');
    };
  }, []);


  const handleWorkerMessage = (cpuId: number, e: MessageEvent, onComplete?: () => void) => {
    const data = e.data;
    
    // Skip ready message
    if (data.type === 'ready') return;

    const newResults = mapWorkerResultPayload(data, cpuId, recognitionTarget, domain);
    if (newResults.length > 0) {
      setResults(prev => [...prev, ...newResults]);
    }

    if (data.error) {
      setBackendNotice(`Worker ${data.cpuId ?? cpuId}: ${data.error}`);
    }

    const isSuccess = data.result === 'SUCCESS' && recognitionTarget !== 'multiple';
    if (isSuccess && !searchEndedRef.current) {
      searchEndedRef.current = true;
      workersRef.current.forEach(w => w.terminate());
      workersRef.current = [];
      setActiveWorkers([]);
      resolveAllRef.current?.();
      return;
    }

    // Worker finished, even if it returned no displayable candidates.
    setActiveWorkers(prev => prev.filter(w => w.id !== cpuId));
    onComplete?.();
  };

  const handleWorkerError = (cpuId: number, error: ErrorEvent) => {
    console.error(`Worker ${cpuId} error:`, error.message || error);
    setActiveWorkers(prev => prev.filter(w => w.id !== cpuId));
    setIsCalculating(false);
  };

  const calculate = async () => {
    if (!inputValue.trim()) return;

    setInputError(null);
    setBackendNotice(null);

    let parsedRecognition;

    try {
      parsedRecognition = parseRecognitionInput(inputValue, recognitionTarget, domain);
    } catch (err) {
      setInputError(err instanceof Error ? err.message : 'Could not parse the target value.');
      return;
    }

    const targetInputForPrecision = recognitionTarget === 'constant'
      ? inputValue.trim()
      : parsedRecognition.primaryInput;
    const targetValue = parsedRecognition.primaryValue;
    const targetMagnitude = parsedRecognition.targetMagnitude;
    const zNum = targetValue.real;
    
    setIsCalculating(true);
    setResults([]);
    setSearchFinished(false);
    searchEndedRef.current = false;
    isAbortedRef.current = false;
    resolveAllRef.current = null;
    
    // Start timer (update every 500ms to reduce re-renders)
    setElapsedTime(0);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(Date.now() - startTimeRef.current);
    }, 500);
    
    const deltaZNum = resolveInputUncertainty(
      targetInputForPrecision,
      errorMode,
      manualError,
      targetMagnitude
    );
    
    // Update precision display
    const relDeltaZ = targetMagnitude !== 0 ? deltaZNum / targetMagnitude : 0;
    setPrecision({
      z: parsedRecognition.precisionLabel,
      deltaZ: deltaZNum === 0 ? '0' : deltaZNum.toExponential(2),
      relDeltaZ: relDeltaZ === 0 ? '0' : relDeltaZ.toExponential(2)
    });
    const exactSearch = deltaZNum === 0;
    setLastSearchExact(exactSearch);
    setSortColumn(exactSearch ? 'REL_ERR' : 'CR');
    setSortDirection(exactSearch ? 'asc' : 'desc');

    const gpuCompatible =
      calculatorMode === 'standard' &&
      (
        recognitionTarget === 'constant' ||
        recognitionTarget === 'multiple' ||
        ((recognitionTarget === 'function' || recognitionTarget === 'sequence') && domain === 'real')
      );

    const wantsGpu = (
      computeMode === 'gpu' ||
      computeMode === 'apple_silicon' ||
      computeMode === 'auto'
    );
    const gpuWorkload = gpuCompatible && wantsGpu
      ? decideGpuWorkload({
          recognitionTarget,
          domain,
          minK: 1,
          maxK: searchDepth,
          targetCount: parsedRecognition.constantTargets.length,
          pointCount: parsedRecognition.functionPoints.length,
          computeMode,
        })
      : null;
    const shouldUseGpu = gpuCompatible && gpuAvailable && wantsGpu && (gpuWorkload?.allowed ?? true);

    if (gpuCompatible && gpuAvailable && wantsGpu && gpuWorkload && !gpuWorkload.allowed) {
      setBackendNotice(`${gpuWorkload.reason} Using CPU/WASM fallback to avoid excessive GPU load.`);
    }

    if (shouldUseGpu) {
      setActiveWorkers([]);
      try {
        const gpuTarget = toGpuValue(parsedRecognition.primaryValue, domain);
        const gpuOptions = {
          minK: 1,
          maxK: searchDepth,
          absoluteTolerance: deltaZNum,
          domain,
          recognitionTarget,
          targets: recognitionTarget === 'multiple'
            ? parsedRecognition.constantTargets.map((value) => toGpuValue(value, domain))
            : undefined,
          functionPoints: (recognitionTarget === 'function' || recognitionTarget === 'sequence')
            ? parsedRecognition.functionPoints.map((point) => ({
                x: point.x.real,
                y: point.y.real,
                label: point.label,
              }))
            : undefined,
        };
        const gpuResults = await searchGPU(gpuTarget, {
          ...gpuOptions,
        });

        const mappedResults: SearchResult[] = gpuResults.map(result => {
          let numericValue: string;
          if (recognitionTarget === 'function' || recognitionTarget === 'sequence') {
            numericValue = `MSE ${result.REL_ERR.toExponential(2)}`;
          } else try {
            numericValue = evaluateRPNDisplay(result.RPN, domain);
          } catch {
            numericValue = 'N/A';
          }

          return {
            cpuId: result.cpuId ?? 0,
            K: result.K,
            RPN: result.RPN,
            result: numericValue,
            REL_ERR: result.REL_ERR,
            status: result.status,
            targetIndex: result.targetIndex,
            targetLabel: result.targetLabel,
          };
        });

        if (mappedResults.length === 0) {
          throw new Error('GPU returned no verified candidates');
        }

        setResults(mappedResults);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setElapsedTime(Date.now() - startTimeRef.current);
        setIsCalculating(false);
        setSearchFinished(true);
        return;
      } catch (err) {
        console.warn('GPU search failed, falling back to CPU/WASM:', err);
        setBackendNotice('GPU search failed; using CPU/WASM fallback.');
      }
    }

    // CPU/WASM computation
    const effectiveThreads = resolveWorkerCount(recognitionTarget, autoThreads, detectedCPUs, threadCount);
    
    // Terminate existing workers
    workersRef.current.forEach(w => w.terminate());
    workersRef.current = [];
    
    // Create new workers with completion tracking
    const workers: Worker[] = [];
    const initialActiveWorkers: ActiveWorker[] = [];
    let completedCount = 0;

    const allComplete = new Promise<void>(resolve => {
      resolveAllRef.current = resolve;
    });
    


    //let resolveAll: () => void;
    //const allComplete = new Promise<void>(resolve => { resolveAll = resolve; });
    //resolveAllRef.current = resolveAll;
    
    for (let i = 0; i < effectiveThreads; i++) {
      //const worker = new Worker('/wasm/worker.js');
      const worker = new Worker(withBasePath('/wasm/worker.js'));
      const cpuId = i;
      
      const onComplete = () => {
        completedCount++;
        if (completedCount >= effectiveThreads) {
          resolveAllRef.current?.();
        }
      };
      
      worker.onmessage = (e) => handleWorkerMessage(cpuId, e, onComplete);
      worker.onerror = (e) => handleWorkerError(cpuId, e);
      
      workers.push(worker);
      initialActiveWorkers.push({ id: cpuId, status: 'running', currentK: 1 });
    }
    
    workersRef.current = workers;
    setActiveWorkers(initialActiveWorkers);
    
    // Start computation on each worker
    workers.forEach((worker, i) => {
        const workerParams = {
          initDelay: i * 5,
          z: zNum,
          targetValue,
          inputValue: inputValue,
          constantTargets: parsedRecognition.constantTargets,
          functionPoints: parsedRecognition.functionPoints,
          recognitionTarget: recognitionTarget,
          calculatorMode: calculatorMode,
          calculatorSpec,
          inputPrecision: deltaZNum,
          MinCodeLength: 1,
          MaxCodeLength: searchDepth,
          cpuId: i,
          ncpus: effectiveThreads,
          earlyExitCRThreshold,
          domain
        };
        worker.postMessage(workerParams);
    });
    
    // Wait for all workers to complete
    await allComplete;
    
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setElapsedTime(Date.now() - startTimeRef.current);
    
    if (!isAbortedRef.current) {
      setIsCalculating(false);
      setSearchFinished(true);
    }
  };

  const handleAbort = () => {
    isAbortedRef.current = true;
    workersRef.current.forEach(w => w.terminate());
    workersRef.current = [];
    setActiveWorkers([]);
    abortGPU();
    resolveAllRef.current?.();
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setElapsedTime(Date.now() - startTimeRef.current);
    setIsCalculating(false);
  };

  const handleReset = () => {
    handleAbort();
    setInputValue('');
    setResults([]);
    setPrecision({});
    setSortColumn(null);
    setSortDirection('asc');
    setFilters(defaultFilters);
    setLastSearchExact(false);
    setSearchFinished(false);
    setElapsedTime(0);
    setInputError(null);
    setBackendNotice(null);
  };

  const handleExampleClick = (value: string) => {
    setInputValue(value);
  };

  return (
    <div className="fixed inset-0 flex h-dvh w-dvw overflow-hidden bg-gray-50 dark:bg-[#1a1a1d]">
      {/* Sidebar */}
      <Sidebar
        wasmLoaded={wasmLoaded}
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
        gpuAvailable={gpuAvailable}
        gpuName={gpuName}
        computeMode={computeMode}
        setComputeMode={setComputeMode}
        selectedCalculatorId={selectedCalculatorId}
        setSelectedCalculatorId={setSelectedCalculatorId}
        recognitionTarget={recognitionTarget}
        setRecognitionTarget={setRecognitionTarget}
        domain={domain}
        setDomain={setDomain}
        calculatorMode={calculatorMode}
        setCalculatorMode={setCalculatorMode}
        calculatorSpec={calculatorSpec}
        defaultCalculatorSpec={defaultCalculatorSpec}
        setCustomCalculatorSpec={setCustomCalculatorSpec}
      />

      {/* Main content */}
      <main className="min-w-0 flex-1 flex flex-col overflow-hidden bg-white dark:bg-[#1a1a1d]">
        <InputBar
          inputValue={inputValue}
          setInputValue={setInputValue}
          isCalculating={isCalculating}
          onCalculate={calculate}
          onReset={handleReset}
          onAbort={handleAbort}
          recognitionTarget={recognitionTarget}
          domain={domain}
          inputError={inputError}
        />

        {/* Search Status */}
        {isCalculating && (
          <div className="bg-blue-500 text-white py-3 px-4 text-center flex items-center justify-center gap-4">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="font-bold">Searching for formulas...</span>
            <span className="font-mono">{(elapsedTime / 1000).toFixed(1)}s</span>
            {precision.deltaZ && (
              <span className="text-sm opacity-75">(±{precision.deltaZ})</span>
            )}
          </div>
        )}

        {backendNotice && (
          <div className="bg-amber-500 text-white py-2 px-4 text-center text-sm">
            {backendNotice}
          </div>
        )}

        {results.length > 0 && bestResult ? (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-white dark:bg-[#1a1a1d]">
            {/* Success banner */}
            {searchFinished && !isCalculating && (
              <div className="bg-green-500 text-white py-2 px-4 text-center text-sm">
                Found {results.length} result{results.length !== 1 ? 's' : ''} in {(elapsedTime / 1000).toFixed(2)}s
              </div>
            )}
            {/* Best result card */}
            <ResultCard
              result={bestResult}
              allResults={results}
              crThreshold={earlyExitCRThreshold}
            />
            {/* Results table */}
            <ResultsTable
              results={results}
              filters={filters}
              setFilters={setFilters}
              sortColumn={sortColumn}
              setSortColumn={setSortColumn}
              sortDirection={sortDirection}
              setSortDirection={setSortDirection}
            />
          </div>
        ) : (
          <EmptyState onExampleClick={handleExampleClick} />
        )}
      </main>
    </div>
  );
}
