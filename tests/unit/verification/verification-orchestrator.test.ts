/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/verification/verification-orchestrator.test.ts
 * Owner: Pratham
 * Purpose: Unit tests for VerificationOrchestrator check discovery, execution, fail-fast, and output sanitization
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  VerificationOrchestrator,
  VerificationCheckDefinition,
} from '../../../src/verification/verification-orchestrator.js';

describe('Verification: VerificationOrchestrator Workflow', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'repoguard-orch-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('autoDiscoverChecks', () => {
    it('discovers typecheck, lint, test, and build from package.json', async () => {
      const orchestrator = new VerificationOrchestrator();
      const pkgJson = {
        scripts: {
          test: 'vitest run',
          lint: 'eslint .',
          typecheck: 'tsc --noEmit',
          build: 'tsc -p tsconfig.build.json',
        },
      };
      await writeFile(join(tempDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

      const checks = await orchestrator.autoDiscoverChecks(tempDir, { includeBuild: true });
      expect(checks).toHaveLength(4);
      expect(checks.map((c) => c.command)).toEqual([
        'npm run typecheck',
        'npm run lint',
        'npm test',
        'npm run build',
      ]);
    });

    it('falls back to default test check if package.json has no scripts', async () => {
      const orchestrator = new VerificationOrchestrator();
      await writeFile(join(tempDir, 'package.json'), JSON.stringify({ name: 'empty-pkg' }));

      const checks = await orchestrator.autoDiscoverChecks(tempDir);
      expect(checks).toHaveLength(1);
      expect(checks[0]?.command).toBe('npm test');
    });

    it('falls back to default test check if package.json does not exist', async () => {
      const orchestrator = new VerificationOrchestrator();
      const checks = await orchestrator.autoDiscoverChecks(join(tempDir, 'non-existent-subfolder'));
      expect(checks).toHaveLength(1);
      expect(checks[0]?.command).toBe('npm test');
    });
  });

  describe('verify execution & lifecycle', () => {
    it('executes suite and aggregates successful results', async () => {
      const orchestrator = new VerificationOrchestrator({
        cwd: tempDir,
        allowlist: ['node -e "process.exit(0)"', 'node -e "console.log(\'all good\')"'],
      });

      const started: string[] = [];
      const completed: string[] = [];

      const suite: VerificationCheckDefinition[] = [
        { name: 'Check 1', command: 'node -e "console.log(\'all good\')"' },
        { name: 'Check 2', command: 'node -e "process.exit(0)"' },
      ];

      const result = await orchestrator.verify(suite, {
        onCheckStart: (c) => started.push(c.name),
        onCheckComplete: (r) => completed.push(r.checkName),
      });

      expect(result.passed).toBe(true);
      expect(result.overallOutcome).toBe('PASSED');
      expect(result.totalChecks).toBe(2);
      expect(result.passedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(started).toEqual(['Check 1', 'Check 2']);
      expect(completed).toEqual(['Check 1', 'Check 2']);
    });

    it('enforces failFast: true, halts subsequent execution, and records remaining checks as SKIPPED', async () => {
      const orchestrator = new VerificationOrchestrator({
        cwd: tempDir,
        failFast: true,
        allowlist: [
          'node -e "process.exit(1)"',
          'node -e "console.log(\'should not run\')"',
        ],
      });

      const started: string[] = [];
      const completed: string[] = [];
      const suite: VerificationCheckDefinition[] = [
        { name: 'Failing Check', command: 'node -e "process.exit(1)"' },
        { name: 'Subsequent Check', command: 'node -e "console.log(\'should not run\')"' },
      ];

      const result = await orchestrator.verify(suite, {
        onCheckStart: (c) => started.push(c.name),
        onCheckComplete: (r) => completed.push(r.checkName),
      });

      expect(result.passed).toBe(false);
      expect(result.overallOutcome).toBe('FAILED');
      expect(result.totalChecks).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.skippedCount).toBe(1);
      expect(result.checks[0]?.outcome).toBe('FAILED');
      expect(result.checks[1]?.outcome).toBe('SKIPPED');
      expect(result.checks[1]?.explanation).toContain('skipped due to earlier failure');
      expect(started).toEqual(['Failing Check']);
      expect(completed).toEqual(['Failing Check', 'Subsequent Check']);
    });

    it('correctly records 1 failure and 3 skipped checks in a four-check suite when check 1 fails with failFast', async () => {
      const orchestrator = new VerificationOrchestrator({
        cwd: tempDir,
        failFast: true,
        allowlist: [
          'node -e "process.exit(1)"',
          'node -e "process.exit(0)"',
        ],
      });

      const started: string[] = [];
      const suite: VerificationCheckDefinition[] = [
        { name: 'Check 1 (Fails)', command: 'node -e "process.exit(1)"' },
        { name: 'Check 2', command: 'node -e "process.exit(0)"' },
        { name: 'Check 3', command: 'node -e "process.exit(0)"' },
        { name: 'Check 4', command: 'node -e "process.exit(0)"' },
      ];

      const result = await orchestrator.verify(suite, {
        onCheckStart: (c) => started.push(c.name),
      });

      expect(result.passed).toBe(false);
      expect(result.overallOutcome).toBe('FAILED');
      expect(result.totalChecks).toBe(4);
      expect(result.failedCount).toBe(1);
      expect(result.skippedCount).toBe(3);
      expect(result.passedCount).toBe(0);
      expect(started).toEqual(['Check 1 (Fails)']);
      expect(result.checks[0]?.outcome).toBe('FAILED');
      expect(result.checks[1]?.outcome).toBe('SKIPPED');
      expect(result.checks[2]?.outcome).toBe('SKIPPED');
      expect(result.checks[3]?.outcome).toBe('SKIPPED');
    });

    it('aborts subsequent checks and marks them SKIPPED when a check times out with failFast', async () => {
      const orchestrator = new VerificationOrchestrator({
        cwd: tempDir,
        failFast: true,
        defaultTimeoutMs: 150,
        allowlist: [
          'node -e "setTimeout(() => {}, 5000)"',
          'node -e "process.exit(0)"',
        ],
      });

      const suite: VerificationCheckDefinition[] = [
        { name: 'Timing Out Check', command: 'node -e "setTimeout(() => {}, 5000)"' },
        { name: 'Unreached Check', command: 'node -e "process.exit(0)"' },
      ];

      const result = await orchestrator.verify(suite);
      expect(result.passed).toBe(false);
      expect(result.overallOutcome).toBe('TIMED_OUT');
      expect(result.totalChecks).toBe(2);
      expect(result.timedOutCount).toBe(1);
      expect(result.skippedCount).toBe(1);
      expect(result.checks[0]?.outcome).toBe('TIMED_OUT');
      expect(result.checks[1]?.outcome).toBe('SKIPPED');
    });

    it('aborts subsequent checks and marks them SKIPPED when an execution error occurs with failFast', async () => {
      const orchestrator = new VerificationOrchestrator({
        cwd: tempDir,
        failFast: true,
        allowlist: ['node -e "process.exit(0)"'],
      });

      const suite: VerificationCheckDefinition[] = [
        { name: 'Disallowed Check', command: 'curl http://malicious.com' },
        { name: 'Unreached Check', command: 'node -e "process.exit(0)"' },
      ];

      const result = await orchestrator.verify(suite);
      expect(result.passed).toBe(false);
      expect(result.overallOutcome).toBe('ERROR');
      expect(result.totalChecks).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.skippedCount).toBe(1);
      expect(result.checks[0]?.outcome).toBe('ERROR');
      expect(result.checks[1]?.outcome).toBe('SKIPPED');
    });

    it('does not abort on optional check failures even with failFast enabled', async () => {
      const orchestrator = new VerificationOrchestrator({
        cwd: tempDir,
        failFast: true,
        allowlist: [
          'node -e "process.exit(1)"',
          'node -e "process.exit(0)"',
        ],
      });

      const suite: VerificationCheckDefinition[] = [
        { name: 'Optional Flaky Check', command: 'node -e "process.exit(1)"', optional: true },
        { name: 'Mandatory Check', command: 'node -e "process.exit(0)"' },
      ];

      const result = await orchestrator.verify(suite);
      expect(result.totalChecks).toBe(2);
      expect(result.checks[0]?.outcome).toBe('FAILED');
      expect(result.checks[1]?.outcome).toBe('PASSED');
      expect(result.overallOutcome).toBe('PASSED');
    });

    it('sanitizes leaked secrets from stdout and stderr in check results', async () => {
      const orchestrator = new VerificationOrchestrator({
        cwd: tempDir,
        allowlist: [
          'node -e "console.log(\'AWS_KEY: AKIA1234567890ABCDEF\')"',
          'node -e "console.error(\'TOKEN: ghp_123456789012345678901234567890123456\')"',
        ],
      });

      const suite: VerificationCheckDefinition[] = [
        { name: 'Stdout Secret', command: 'node -e "console.log(\'AWS_KEY: AKIA1234567890ABCDEF\')"' },
        { name: 'Stderr Secret', command: 'node -e "console.error(\'TOKEN: ghp_123456789012345678901234567890123456\')"' },
      ];

      const result = await orchestrator.verify(suite);
      expect(result.checks[0]?.stdout).toContain('AKIA****************');
      expect(result.checks[0]?.stdout).not.toContain('AKIA1234567890ABCDEF');

      expect(result.checks[1]?.stderr).toContain('ghp_********************************');
      expect(result.checks[1]?.stderr).not.toContain('ghp_123456789012345678901234567890123456');
    });
  });

  describe('formatSummary', () => {
    it('produces clean formatted summary with icon and counts', () => {
      const orchestrator = new VerificationOrchestrator();
      const mockResult = {
        passed: true,
        totalChecks: 2,
        passedCount: 2,
        failedCount: 0,
        timedOutCount: 0,
        skippedCount: 0,
        durationMs: 45,
        overallOutcome: 'PASSED' as const,
        timestamp: new Date().toISOString(),
        checks: [
          {
            checkName: 'Typecheck',
            command: 'npm run typecheck',
            outcome: 'PASSED' as const,
            exitCode: 0,
            durationMs: 25,
            stdout: '',
            stderr: '',
            explanation: 'Check passed cleanly with exit code 0',
          },
          {
            checkName: 'Lint',
            command: 'npm run lint',
            outcome: 'PASSED' as const,
            exitCode: 0,
            durationMs: 20,
            stdout: '',
            stderr: '',
            explanation: 'Check passed cleanly with exit code 0',
          },
        ],
      };

      const summary = orchestrator.formatSummary(mockResult);
      expect(summary).toContain('=== ✔ VERIFICATION PASSED (45ms) ===');
      expect(summary).toContain('Total Checks: 2 | Passed: 2 | Failed: 0');
      expect(summary).toContain('✔ [PASSED] Typecheck');
      expect(summary).toContain('✔ [PASSED] Lint');
    });
  });
});
