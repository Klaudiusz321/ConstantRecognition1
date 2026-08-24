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

    console.log('WASM batch smoke test passed: 2/2 exact targets with stable IDs.');
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
