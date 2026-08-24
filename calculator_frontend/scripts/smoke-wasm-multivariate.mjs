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
  const c1 = [3, 5, 8, 7, 20];
  const c2 = [4, 12, 15, 24, 21];
  const values = [5, 13, 17, 25, 29];
  const uncertainties = [0, 0, 0, 0, 0];
  const bytes = c1.length * Float64Array.BYTES_PER_ELEMENT;
  const c1Ptr = Module._malloc(bytes);
  const c2Ptr = Module._malloc(bytes);
  const valuePtr = Module._malloc(bytes);
  const uncertaintyPtr = Module._malloc(bytes);

  try {
    HEAPF64.set(c1, c1Ptr / 8);
    HEAPF64.set(c2, c2Ptr / 8);
    HEAPF64.set(values, valuePtr / 8);
    HEAPF64.set(uncertainties, uncertaintyPtr / 8);

    const resultPtr = Module.ccall(
      'search_multivariate_custom_wasm',
      'number',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'string', 'string', 'string'],
      [c1Ptr, c2Ptr, valuePtr, uncertaintyPtr, c1.length, 1, 6, 0, 1, '', 'SQRT,SQR', 'PLUS'],
    );
    const report = JSON.parse(UTF8ToString(resultPtr));
    Module._free(resultPtr);

    if (report.mode !== 'MULTIVARIATE' || report.result !== 'SUCCESS') {
      throw new Error('WASM did not return a successful MULTIVARIATE report.');
    }
    if (report.K !== 6 || report.REL_ERR > 1e-12) {
      throw new Error('WASM did not identify the exact length-6 formula.');
    }
    const tokens = report.RPN.split(/,\\s*/);
    for (const required of ['C1', 'C2', 'SQR', 'PLUS', 'SQRT']) {
      if (!tokens.includes(required)) throw new Error('Missing RPN token: ' + required);
    }

    console.log('WASM multivariate smoke test passed: F(C1,C2)=sqrt(C1^2+C2^2), MSE <= 1e-12.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    Module._free(c1Ptr);
    Module._free(c2Ptr);
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
