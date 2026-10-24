/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/verification/result-classifier.test.ts
 * Owner: Pratham
 * Purpose: Unit tests for truthful outcome classification (PASSED, FAILED, TIMED_OUT, SKIPPED, ERROR)
 */

import { describe, it, expect } from 'vitest';
import {
  classifyExecutionOutcome,
  classifySuiteOutcome,
  formatTruthfulExplanation,
  isTruthfullyPassed,
} from '../../../src/verification/result-classifier.js';
import {
  CommandExecutionResult,
  VerificationCheckResult,
} from '../../../src/domain/verification.js';

describe('Verification: ResultClassifier', () => {
  describe('classifyExecutionOutcome', () => {
    it('strictly classifies exitCode 0 with no errors as PASSED', () => {
      const res: CommandExecutionResult = {
        command: 'npm',
        args: ['test'],
        exitCode: 0,
        stdout: 'All tests passed',
        stderr: '',
        durationMs: 150,
        timedOut: false,
      };
      expect(classifyExecutionOutcome(res)).toBe('PASSED');
      expect(isTruthfullyPassed('PASSED', 0)).toBe(true);
    });

    it('classifies non-zero exit code as FAILED', () => {
      const res: CommandExecutionResult = {
        command: 'npm',
        args: ['test'],
        exitCode: 1,
        stdout: '1 test failed',
        stderr: '',
        durationMs: 200,
        timedOut: false,
      };
      expect(classifyExecutionOutcome(res)).toBe('FAILED');
      expect(isTruthfullyPassed('FAILED', 1)).toBe(false);
    });

    it('classifies timedOut as TIMED_OUT even if exitCode was 0 or null', () => {
      const res: CommandExecutionResult = {
        command: 'npm',
        args: ['test'],
        exitCode: 0,
        stdout: '',
        stderr: '',
        durationMs: 15000,
        timedOut: true,
      };
      expect(classifyExecutionOutcome(res)).toBe('TIMED_OUT');
      expect(isTruthfullyPassed('TIMED_OUT', 0)).toBe(false);
    });

    it('classifies process error as ERROR', () => {
      const res: CommandExecutionResult = {
        command: 'missing-bin',
        args: [],
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: 5,
        timedOut: false,
        error: 'spawn ENOENT',
      };
      expect(classifyExecutionOutcome(res)).toBe('ERROR');
    });
  });

  describe('classifySuiteOutcome', () => {
    it('returns PASSED only when all non-skipped checks pass', () => {
      const checks: VerificationCheckResult[] = [
        {
          checkName: 'Lint',
          command: 'npm run lint',
          outcome: 'PASSED',
          exitCode: 0,
          durationMs: 100,
          stdout: '',
          stderr: '',
          explanation: '',
        },
        {
          checkName: 'Unit Tests',
          command: 'npm test',
          outcome: 'PASSED',
          exitCode: 0,
          durationMs: 300,
          stdout: '',
          stderr: '',
          explanation: '',
        },
      ];
      expect(classifySuiteOutcome(checks)).toBe('PASSED');
    });

    it('returns FAILED if any single check failed', () => {
      const checks: VerificationCheckResult[] = [
        {
          checkName: 'Lint',
          command: 'npm run lint',
          outcome: 'PASSED',
          exitCode: 0,
          durationMs: 100,
          stdout: '',
          stderr: '',
          explanation: '',
        },
        {
          checkName: 'Unit Tests',
          command: 'npm test',
          outcome: 'FAILED',
          exitCode: 1,
          durationMs: 300,
          stdout: '',
          stderr: '',
          explanation: '',
        },
      ];
      expect(classifySuiteOutcome(checks)).toBe('FAILED');
    });

    it('prioritizes TIMED_OUT over standard failure', () => {
      const checks: VerificationCheckResult[] = [
        {
          checkName: 'Tests',
          command: 'npm test',
          outcome: 'TIMED_OUT',
          exitCode: null,
          durationMs: 15000,
          stdout: '',
          stderr: '',
          explanation: '',
        },
        {
          checkName: 'Build',
          command: 'npm run build',
          outcome: 'FAILED',
          exitCode: 1,
          durationMs: 200,
          stdout: '',
          stderr: '',
          explanation: '',
        },
      ];
      expect(classifySuiteOutcome(checks)).toBe('TIMED_OUT');
    });

    it('returns SKIPPED if all checks are skipped', () => {
      const checks: VerificationCheckResult[] = [
        {
          checkName: 'Optional',
          command: '',
          outcome: 'SKIPPED',
          exitCode: null,
          durationMs: 0,
          stdout: '',
          stderr: '',
          explanation: '',
        },
      ];
      expect(classifySuiteOutcome(checks)).toBe('SKIPPED');
    });
  });

  describe('formatTruthfulExplanation', () => {
    it('generates descriptive string mentioning checkName and duration', () => {
      const explanation = formatTruthfulExplanation('Unit Tests', 'PASSED', 0, 250);
      expect(explanation).toContain('Unit Tests');
      expect(explanation).toContain('exit code 0');
      expect(explanation).toContain('250ms');
    });
  });
});
