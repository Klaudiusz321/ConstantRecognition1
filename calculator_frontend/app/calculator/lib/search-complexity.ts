/**
 * Scientific search-space accounting for the exhaustive RPN enumerator.
 *
 * K keeps one meaning throughout the project: the number of RPN tokens in a
 * candidate program.  Calculator size, data size and hardware parallelism are
 * separate quantities.  The selected calculator controls the number of valid
 * programs at each K through the terminal/unary/binary arities below.
 */

export const GPU_PROGRAM_BUDGET = BigInt(100_000_000);
export const GPU_TIME_BUDGET_MS = 30_000;

export interface SearchAlphabet {
  /** Selected zero-arity constants plus variables supplied by the mode. */
  readonly terminals: number;
  readonly unary: number;
  readonly binary: number;
}

export interface SearchComplexityLevel {
  readonly K: number;
  /** Syntactically valid RPN programs at exactly this K. */
  readonly programs: bigint;
  /** Syntactically valid RPN programs from K=1 through this K. */
  readonly cumulativePrograms: bigint;
  /** Program evaluations multiplied by independent targets/observations. */
  readonly scalarEvaluations: bigint;
}

export interface SearchComplexityPlan {
  readonly alphabet: SearchAlphabet;
  readonly alphabetSize: number;
  readonly samplesPerProgram: number;
  readonly levels: readonly SearchComplexityLevel[];
  readonly selected: SearchComplexityLevel;
  /** Fixed-width description length for a K-token program over this alphabet. */
  readonly descriptionBits: number;
  /** Deepest complete level under the browser GPU program budget. */
  readonly gpuCompleteThroughK: number;
}

function validateCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
}

/**
 * Exact dynamic-programming count of stack-valid RPN programs.
 *
 * dp[s] is the number of prefixes that leave s values on the stack. A
 * terminal increases s, a unary instruction preserves it, and a binary
 * instruction decreases it. Only prefixes ending with one stack value are
 * complete programs. Counts include syntactic aliases/equivalent formulas;
 * they are deliberately not described as distinct mathematical functions.
 */
export function countRpnProgramsByK(
  maxK: number,
  alphabet: SearchAlphabet,
): readonly bigint[] {
  if (!Number.isSafeInteger(maxK) || maxK < 1) {
    throw new RangeError('maxK must be a positive safe integer.');
  }
  validateCount(alphabet.terminals, 'terminals');
  validateCount(alphabet.unary, 'unary');
  validateCount(alphabet.binary, 'binary');

  const terminals = BigInt(alphabet.terminals);
  const unary = BigInt(alphabet.unary);
  const binary = BigInt(alphabet.binary);
  const counts: bigint[] = [];
  let prefixes: bigint[] = [BigInt(1)]; // empty prefix, empty stack

  for (let K = 1; K <= maxK; K++) {
    const next = Array<bigint>(K + 2).fill(BigInt(0));
    for (let stack = 0; stack < prefixes.length; stack++) {
      const prefixCount = prefixes[stack] ?? BigInt(0);
      if (prefixCount === BigInt(0)) continue;
      if (terminals > BigInt(0)) next[stack + 1] += prefixCount * terminals;
      if (stack >= 1 && unary > BigInt(0)) next[stack] += prefixCount * unary;
      if (stack >= 2 && binary > BigInt(0)) next[stack - 1] += prefixCount * binary;
    }
    prefixes = next;
    counts.push(prefixes[1] ?? BigInt(0));
  }

  return counts;
}

export function deepestCompleteK(
  countsByK: readonly bigint[],
  programBudget: bigint,
): number {
  if (programBudget < BigInt(0)) {
    throw new RangeError('programBudget must be non-negative.');
  }
  let cumulative = BigInt(0);
  let completeThroughK = 0;
  for (let index = 0; index < countsByK.length; index++) {
    cumulative += countsByK[index];
    if (cumulative > programBudget) break;
    completeThroughK = index + 1;
  }
  return completeThroughK;
}

export function buildSearchComplexityPlan(
  maxK: number,
  alphabet: SearchAlphabet,
  samplesPerProgram = 1,
  programBudget = GPU_PROGRAM_BUDGET,
): SearchComplexityPlan {
  validateCount(samplesPerProgram, 'samplesPerProgram');
  if (samplesPerProgram < 1) {
    throw new RangeError('samplesPerProgram must be at least one.');
  }
  const counts = countRpnProgramsByK(maxK, alphabet);
  const sampleCount = BigInt(samplesPerProgram);
  let cumulativePrograms = BigInt(0);
  const levels = counts.map((programs, index): SearchComplexityLevel => {
    cumulativePrograms += programs;
    return {
      K: index + 1,
      programs,
      cumulativePrograms,
      scalarEvaluations: cumulativePrograms * sampleCount,
    };
  });
  const alphabetSize = alphabet.terminals + alphabet.unary + alphabet.binary;

  return {
    alphabet,
    alphabetSize,
    samplesPerProgram,
    levels,
    selected: levels[levels.length - 1],
    descriptionBits: alphabetSize > 1 ? maxK * Math.log2(alphabetSize) : 0,
    gpuCompleteThroughK: deepestCompleteK(counts, programBudget),
  };
}

export function formatBigInt(value: bigint): string {
  return value.toLocaleString('en-US');
}
