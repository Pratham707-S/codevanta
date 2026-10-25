/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/verification/check-runner.test.ts
 * Owner: Pratham
 * Purpose: Unit tests for CheckRunner subprocess execution, timeouts, and allowlist validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CheckRunner } from '../../../src/verification/check-runner.js';

describe('Verification: CheckRunner Subprocess Execution', () => {
  let tempDir: string;
  let runner: CheckRunner;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'repoguard-runner-test-'));
    runner = new CheckRunner({
      cwd: tempDir,
      defaultTimeoutMs: 5000,
      allowlist: [
        'npm test',
        'npm run lint',
        'node -e "console.log(123)"',
        'node -e "process.exit(0)"',
        'node -e "process.exit(1)"',
        'node -e "console.error(\'err\'); process.exit(2)"',
        'node -e "setTimeout(()=>{}, 10000)"',
      ],
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('successfully executes an allowlisted command and captures exitCode 0 and stdout', async () => {
    const result = await runner.runCheck('Echo Check', 'node -e "console.log(123)"');
    expect(result.outcome).toBe('PASSED');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('123');
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('truthfully reports non-zero exit code as FAILED and captures stderr', async () => {
    const result = await runner.runCheck('Failing Check', 'node -e "console.error(\'err\'); process.exit(2)"');
    expect(result.outcome).toBe('FAILED');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('err');
  });

  it('enforces wall-clock timeout and terminates hung process with TIMED_OUT', async () => {
    const shortTimeoutRunner = new CheckRunner({
      cwd: tempDir,
      defaultTimeoutMs: 200, // 200ms timeout
      allowlist: ['node -e "setTimeout(()=>{}, 10000)"'],
    });

    const result = await shortTimeoutRunner.runCheck('Hung Process', 'node -e "setTimeout(()=>{}, 10000)"');
    expect(result.outcome).toBe('TIMED_OUT');
    expect(result.explanation).toMatch(/exceeded the configured execution timeout/i);
  });

  it('handles spawn errors truthfully when binary does not exist', async () => {
    const customRunner = new CheckRunner({
      cwd: tempDir,
      allowlist: ['non-existent-binary-cmd --flag'],
    });

    const result = await customRunner.runCheck('Missing Binary', 'non-existent-binary-cmd --flag');
    expect(result.outcome).toBe('ERROR');
    expect(result.explanation).toMatch(/error|ENOENT/i);
  });

  it('runs multi-check verification suite and aggregates results', async () => {
    const suite = await runner.runVerificationSuite([
      { name: 'Passing Task', command: 'node -e "process.exit(0)"' },
      { name: 'Failing Task', command: 'node -e "process.exit(1)"' },
      { name: 'Skipped Task', command: '' },
    ]);

    expect(suite.totalChecks).toBe(3);
    expect(suite.passedCount).toBe(1);
    expect(suite.failedCount).toBe(1);
    expect(suite.skippedCount).toBe(1);
    expect(suite.overallOutcome).toBe('FAILED');
    expect(suite.passed).toBe(false);
  });

  it('reports suite as passed when all non-skipped checks pass', async () => {
    const suite = await runner.runVerificationSuite([
      { name: 'Check 1', command: 'node -e "process.exit(0)"' },
      { name: 'Check 2', command: '' },
    ]);

    expect(suite.passed).toBe(true);
    expect(suite.overallOutcome).toBe('PASSED');
  });
});
