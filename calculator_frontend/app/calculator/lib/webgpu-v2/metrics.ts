export function getCompressionRatio(
  relativeError: number,
  K: number,
  instructionCount: number,
): number {
  if (
    !Number.isFinite(relativeError) ||
    relativeError < 0 ||
    relativeError >= 1 ||
    !Number.isInteger(K) ||
    K <= 0 ||
    !Number.isInteger(instructionCount) ||
    instructionCount <= 1
  ) {
    return 0;
  }

  const information = K * Math.log10(instructionCount);
  const decimalDigits = relativeError === 0 ? 16 : -Math.log10(relativeError);
  return Math.max(0, decimalDigits / information);
}

export interface AcceptanceInput {
  readonly relativeError: number;
  readonly absoluteError: number;
  readonly compressionRatio: number;
  readonly exactRelativeTolerance: number;
  readonly absoluteTolerance: number;
  readonly compressionRatioThreshold: number;
}

/** Match vsearch_RPN_core.c: exact match, or tolerance plus a CR threshold. */
export function isAcceptedCandidate(input: AcceptanceInput): boolean {
  if (input.relativeError <= input.exactRelativeTolerance) return true;
  return input.absoluteTolerance > 0 &&
    input.absoluteError <= 2 * input.absoluteTolerance &&
    input.compressionRatio >= input.compressionRatioThreshold;
}
