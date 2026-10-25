/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/verification/result-classifier.ts
 * Owner: Pratham
 * Purpose: Outcome classifier: truthfully classify PASSED, FAILED, TIMED_OUT, SKIPPED, ERROR
 */

import {
  CheckOutcome,
  CommandExecutionResult,
  VerificationCheckResult,
} from '../domain/verification.js';

/**
 * Truthfully classifies a raw command execution outcome.
 * Invariant: Never returns PASSED unless exit code is strictly 0, no timeout occurred,
 * and no process error was encountered.
 */
export function classifyExecutionOutcome(result: CommandExecutionResult): CheckOutcome {
  if (result.timedOut) {
    return 'TIMED_OUT';
  }

  if (result.error) {
    return 'ERROR';
  }

  if (result.exitCode === 0) {
    return 'PASSED';
  }

  return 'FAILED';
}

/**
 * Computes the aggregate outcome for an entire verification check suite.
 * Invariant: Required checks must pass cleanly. Optional checks cannot fail the suite if required checks pass.
 */
export function classifySuiteOutcome(checks: VerificationCheckResult[]): CheckOutcome {
  if (checks.length === 0) {
    return 'SKIPPED';
  }

  // Filter required (non-optional) checks
  const requiredChecks = checks.filter((c) => !c.optional);

  // If there are required checks, evaluate based on required checks
  const evaluationTarget = requiredChecks.length > 0 ? requiredChecks : checks;

  const hasTimedOut = evaluationTarget.some((c) => c.outcome === 'TIMED_OUT');
  if (hasTimedOut) {
    return 'TIMED_OUT';
  }

  const hasError = evaluationTarget.some((c) => c.outcome === 'ERROR');
  if (hasError) {
    return 'ERROR';
  }

  const hasFailed = evaluationTarget.some((c) => c.outcome === 'FAILED');
  if (hasFailed) {
    return 'FAILED';
  }

  const nonSkipped = evaluationTarget.filter((c) => c.outcome !== 'SKIPPED');
  if (nonSkipped.length === 0) {
    return 'SKIPPED';
  }

  const allPassed = nonSkipped.every((c) => c.outcome === 'PASSED');
  if (allPassed) {
    return 'PASSED';
  }

  return 'FAILED';
}

/**
 * Returns a truthful, human-readable explanation of why a check attained its outcome.
 */
export function formatTruthfulExplanation(
  checkName: string,
  outcome: CheckOutcome,
  exitCode: number | null,
  durationMs: number,
  error?: string
): string {
  switch (outcome) {
    case 'PASSED':
      return `Check "${checkName}" completed successfully with exit code 0 (${durationMs}ms).`;
    case 'FAILED':
      return `Check "${checkName}" failed with non-zero exit code ${exitCode ?? 'unknown'} (${durationMs}ms).`;
    case 'TIMED_OUT':
      return `Check "${checkName}" exceeded the configured execution timeout (${durationMs}ms) and was terminated.`;
    case 'ERROR':
      return `Check "${checkName}" encountered an execution error: ${error || 'Unknown process error'}.`;
    case 'SKIPPED':
      return `Check "${checkName}" was skipped (unconfigured or disabled).`;
    default:
      return `Check "${checkName}" concluded with status: ${outcome}.`;
  }
}

/**
 * Hard invariant check ensuring no falsification of verification success.
 */
export function isTruthfullyPassed(outcome: CheckOutcome, exitCode: number | null): boolean {
  return outcome === 'PASSED' && exitCode === 0;
}
