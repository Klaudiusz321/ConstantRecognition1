import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const wasmDirectory = path.resolve(scriptDirectory, '..', 'public', 'wasm');
const modulePath = path.join(wasmDirectory, 'vsearch.js');
const source = fs.readFileSync(modulePath, 'utf8');

const smokeTest = `
Module.onRuntimeInitialized = () => {
  const ids = [101, 202];
  const values = [Math.PI, Math.E];
  const uncertainties = [0, 0];
  const bytes = ids.length * Float64Array.BYTES_PER_ELEMENT;
  const idPtr = Module._malloc(bytes);
  const valuePtr = Module._malloc(bytes);
  const uncertaintyPtr = Module._malloc(bytes);

  try {
    HEAPF64.set(ids, idPtr / 8);
    HEAPF64.set(values, valuePtr / 8);
    HEAPF64.set(uncertainties, uncertaintyPtr / 8);

    const resultPtr = Module.ccall(
      'search_batch_custom_with_cr_wasm',
      'number',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'string', 'string', 'string', 'number'],
      [idPtr, valuePtr, uncertaintyPtr, ids.length, 1, 1, 0, 1, 'PI,EULER', '', '', 0.9],
    );
    const report = JSON.parse(UTF8ToString(resultPtr));
    Module._free(resultPtr);

    const successes = report.results.filter(row => row.result === 'SUCCESS');
    const returnedIds = successes.map(row => row.target_id).sort((a, b) => a - b);
    if (report.mode !== 'BATCH' || report.result !== 'SUCCESS') {
      throw new Error('WASM did not return a successful BATCH report.');
    }
    if (JSON.stringify(returnedIds) !== JSON.stringify(ids)) {
      throw new Error('WASM did not preserve the input target IDs.');
    }
    if (!successes.every(row => row.K === 1 && row.REL_ERR === 0)) {
      throw new Error('WASM did not identify PI and EULER exactly at K=1.');
    }
    if (
      report.results.length !== ids.length ||
      report.memory_model !== 'STREAMING_O_K_PLUS_TARGETS' ||
      report.peak_live_expressions !== 1 ||
      report.retained_candidates !== ids.length ||
      report.output_capacity_bytes !== 16 * 1024 + ids.length * 1024
    ) {
      throw new Error('WASM did not preserve the bounded streaming-memory contract.');
    }

    const boundedCount = 512;
    const allocatedCount = boundedCount + 1;
    const boundedBytes = allocatedCount * Float64Array.BYTES_PER_ELEMENT;
    const boundedIdPtr = Module._malloc(boundedBytes);
    const boundedValuePtr = Module._malloc(boundedBytes);
    const boundedUncertaintyPtr = Module._malloc(boundedBytes);
    try {
      HEAPF64.set(Array.from({ length: allocatedCount }, (_, index) => index + 1), boundedIdPtr / 8);
      HEAPF64.set(new Array(allocatedCount).fill(Math.PI), boundedValuePtr / 8);
      HEAPF64.set(new Array(allocatedCount).fill(0), boundedUncertaintyPtr / 8);
      const boundedResultPtr = Module.ccall(
        'search_batch_custom_with_cr_wasm',
        'number',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'string', 'string', 'string', 'number'],
        [boundedIdPtr, boundedValuePtr, boundedUncertaintyPtr, boundedCount, 1, 1, 0, 1, 'PI', '', '', 0.9],
      );
      const boundedReport = JSON.parse(UTF8ToString(boundedResultPtr));
      Module._free(boundedResultPtr);
      if (
        boundedReport.results.length !== boundedCount ||
        boundedReport.retained_candidates !== boundedCount ||
        boundedReport.output_capacity_bytes !== 16 * 1024 + boundedCount * 1024
      ) {
        throw new Error('WASM failed the maximum bounded-batch report test.');
      }
      const rejectedResultPtr = Module.ccall(
        'search_batch_custom_with_cr_wasm',
        'number',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'string', 'string', 'string', 'number'],
        [boundedIdPtr, boundedValuePtr, boundedUncertaintyPtr, allocatedCount, 1, 1, 0, 1, 'PI', '', '', 0.9],
      );
      const rejectedReport = JSON.parse(UTF8ToString(rejectedResultPtr));
      Module._free(rejectedResultPtr);
      if (rejectedReport.status !== 'ERROR' || !/512 targets/i.test(rejectedReport.error)) {
        throw new Error('WASM did not reject a batch beyond its bounded memory contract.');
      }
    } finally {
      Module._free(boundedIdPtr);
      Module._free(boundedValuePtr);
      Module._free(boundedUncertaintyPtr);
    }

    console.log('WASM batch smoke test passed: exact targets, one live expression, bounded 512-row output.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    Module._free(idPtr);
    Module._free(valuePtr);
    Module._free(uncertaintyPtr);
  }
};
`;

const executeModule = new Function(
  'require',
  'module',
  'exports',
  '__filename',
  '__dirname',
  `${source}\n${smokeTest}`,
);
const emscriptenModule = { exports: {} };
const nodeRequire = createRequire(import.meta.url);
executeModule(nodeRequire, emscriptenModule, emscriptenModule.exports, modulePath, wasmDirectory);
