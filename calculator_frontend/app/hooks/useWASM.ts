'use client';

import { useEffect, useState } from 'react';
import { createMockWASM } from '../lib/mockWASM';

const USE_MOCK_WASM = true;

type WASMArgument = string | number | boolean | null;

interface WASMModule {
  ccall: (
    name: string,
    returnType: string,
    argTypes: string[],
    args: WASMArgument[]
  ) => string;
  onRuntimeInitialized?: () => void;
}

declare global {
  interface Window {
    Module?: WASMModule;
  }
}

interface SearchResult {
  RPN: string;
  Mathematica: string;
  Error: number;
  results?: unknown[];
}

const withBasePath = (path: string) => {
  const base = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/+$/g, '') ?? '';
  const normalizedBase = base ? (base.startsWith('/') ? base : `/${base}`) : '';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

export function useWASM() {
  const [Module, setModule] = useState<WASMModule | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let script: HTMLScriptElement | null = null;

    const loadWASM = async () => {
      try {
        if (USE_MOCK_WASM) {
          const mockModule = await createMockWASM();
          if (mounted) {
            setModule(mockModule);
            setIsReady(true);
            console.log('[WASM] Mock module loaded successfully');
          }
          return;
        }

        script = document.createElement('script');
        script.src = withBasePath('/wasm/rpn_function.js');
        script.async = true;

        script.onload = () => {
          if (window.Module) {
            window.Module.onRuntimeInitialized = () => {
              if (mounted && window.Module) {
                setModule(window.Module);
                setIsReady(true);
                console.log('[WASM] Module loaded successfully');
              }
            };
          }
        };

        script.onerror = () => {
          if (mounted) {
            setError('Failed to load WASM module');
            console.error('[WASM] Failed to load module');
          }
        };

        document.body.appendChild(script);
      } catch (err) {
        if (mounted) {
          setError('Error initializing WASM');
          console.error('[WASM] Initialization error:', err);
        }
      }
    };

    loadWASM();

    return () => {
      mounted = false;
      if (script?.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  const searchRPN = async (
    z: number,
    deltaZ: number = 0,
    minCodeLength: number = 1,
    maxCodeLength: number = 5,
    cpuId: number = 0,
    ncpus: number = 1
  ): Promise<SearchResult | null> => {
    if (!Module || !isReady) {
      console.warn('[WASM] Module not ready');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const resultString = Module.ccall(
        'search_RPN',
        'string',
        ['number', 'number', 'number', 'number', 'number', 'number'],
        [z, deltaZ, minCodeLength, maxCodeLength, cpuId, ncpus]
      );

      const result = JSON.parse(resultString) as SearchResult;
      console.log('[WASM] Calculation result:', result);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Calculation failed';
      setError(errorMsg);
      console.error('[WASM] Calculation error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    Module,
    isReady,
    isLoading,
    error,
    searchRPN,
  };
}
