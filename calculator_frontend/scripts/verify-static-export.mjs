import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputRoot = resolve('out');
const requiredFiles = [
  'index.html',
  'calculator/index.html',
  'wasm/rpn_function.wasm',
  'wasm/constant-recognition-v2.wgsl',
];

for (const relativePath of requiredFiles) {
  const absolutePath = resolve(outputRoot, relativePath);
  const file = await stat(absolutePath).catch(() => null);
  if (!file?.isFile() || file.size === 0) {
    throw new Error(`Static export is missing required asset: out/${relativePath}`);
  }
}

const shader = await readFile(
  resolve(outputRoot, 'wasm/constant-recognition-v2.wgsl'),
  'utf8',
);
if (!shader.includes('@compute @workgroup_size(256)') || !shader.includes('fn search(')) {
  throw new Error('Exported WebGPU shader is incomplete or is not the expected search kernel.');
}

process.stdout.write('Static export verified: calculator, WASM and WebGPU shader are deployable.\n');
