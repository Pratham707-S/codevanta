/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/domain/verification.ts
 * Owner: Pratham
 * Purpose: Domain model: VerificationResult and check outcome taxonomy
 */

export type CheckOutcome = 'PASSED' | 'FAILED' | 'TIMED_OUT' | 'SKIPPED' | 'ERROR';

export interface CommandExecutionResult {
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  error?: string;
}

export interface VerificationCheckResult {
  checkName: string;
  command: string;
  outcome: CheckOutcome;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  explanation: string;
}

export interface VerificationSuiteResult {
  passed: boolean;
  totalChecks: number;
  passedCount: number;
  failedCount: number;
  timedOutCount: number;
  skippedCount: number;
  checks: VerificationCheckResult[];
  overallOutcome: CheckOutcome;
  durationMs: number;
  timestamp: string;
}
