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
  const search = (target, maxK, consts, funcs, ops) => {
    const resultPtr = Module.ccall(
      'search_bidirectional_wasm',
      'number',
      ['number', 'number', 'number', 'string', 'string', 'string', 'number'],
      [target, 0, maxK, consts, funcs, ops, 0.9],
    );
    if (!resultPtr) throw new Error('Bidirectional WASM returned a null report pointer.');
    try {
      return JSON.parse(UTF8ToString(resultPtr));
    } finally {
      Module._free(resultPtr);
    }
  };

  try {
    const direct = search(Math.PI, 9, 'PI,EULER,TWO', '', 'PLUS,TIMES');
    if (direct.result !== 'SUCCESS' || direct.RPN !== 'PI' || direct.K !== 1 || !direct.minimality_proven) {
      throw new Error('Bidirectional WASM did not prove the direct K=1 result.');
    }

    const k5 = search(2 * (Math.PI + Math.E), 5, 'PI,EULER,TWO', '', 'PLUS,TIMES');
    if (k5.result !== 'SUCCESS' || k5.K !== 5 || !k5.minimality_proven || k5.fallback_required) {
      throw new Error('Bidirectional WASM did not prove the K=5 meet-in-the-middle result.');
    }

    const k7 = search((Math.PI + Math.E) * (2 + Math.PI), 7, 'PI,EULER,TWO', '', 'PLUS,TIMES');
    if (k7.result !== 'SUCCESS' || k7.K !== 7 || !k7.fallback_required || k7.fallback_max_k !== 6) {
      throw new Error('Bidirectional WASM did not request the shorter-level verifier for K=7.');
    }
    if (
      k7.memory_model !== 'BOUNDED_HALF_FRONTIER' ||
      k7.frontier_capacity_entries > 150000 ||
      k7.frontier_entries > k7.frontier_capacity_entries ||
      k7.frontier_bytes <= 0
    ) {
      throw new Error('Bidirectional WASM violated its bounded-memory report contract.');
    }

    const unsupportedRoot = search(Math.pow(2, Math.PI + Math.E), 5, 'PI,EULER,TWO', '', 'PLUS,POWER');
    if (!unsupportedRoot.fallback_required || unsupportedRoot.supported_root_operators !== 1) {
      throw new Error('Unsupported inverse roots did not fail closed to the standard verifier.');
    }

    const invalid = search(1, 10, 'PI', '', '');
    if (invalid.result !== 'ERROR' || !/1 <= K <= 9/.test(invalid.error)) {
      throw new Error('Bidirectional WASM did not reject an out-of-contract K.');
    }

    console.log('WASM bidirectional smoke test passed: K=1/K=5/K=7, bounded memory, and safe fallback.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
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
