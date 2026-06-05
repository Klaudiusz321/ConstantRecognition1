/**
 * WebGPU Module - Public API
 * 
 * This module provides WebGPU-accelerated constant recognition.
 * 
 * Usage:
 *   import { ConstantRecognitionGPU, getGPUInstance, evaluateShortRPN } from './webgpu';
 */

// Re-export types
export type { 
  GPUSearchResult, 
  GPUInfo, 
  FormDescriptor, 
  Candidate,
  SearchOptions 
} from './types';

// Re-export RPN utilities
export { 
  evaluateShortRPN, 
  evaluateShortRPNComplex,
  evaluateNamedRPNWithComplexVariable,
  evaluateNamedRPNWithVariable,
  indexToRPN,
  indexToFunctionRPN,
  CONST_CHARS,
  CONST_CHARS_COMPLEX,
  CONST_TOKENS,
  CONST_TOKENS_COMPLEX,
  UNARY_CHARS,
  UNARY_TOKENS,
  BINARY_CHARS,
  BINARY_TOKENS,
  N_CONST,
  N_CONST_COMPLEX,
  N_UNARY,
  N_BINARY
} from './rpn-evaluator';
export type { ComplexNumber, SearchDomain } from './rpn-evaluator';

// Re-export form generator
export { 
  generateValidForms, 
  checkSyntax3,
  getTotalCombinations 
} from './form-generator';

// Re-export GPU engine
export { 
  ConstantRecognitionGPU, 
  getGPUInstance 
} from './gpu-engine';
