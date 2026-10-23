/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/e2e/review-command.test.ts
 * Owner: Team Lead
 * Purpose: E2E test: repoguard review command execution and approval gate integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFile, rm, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createCliProgram } from '../../src/cli/cli.js';
import { RunStore, ScanRunRecord } from '../../src/storage/run-store.js';

describe('E2E: repoguard review command', () => {
  let logOutput: string[] = [];
  let logSpy: ReturnType<typeof vi.spyOn>;
  const runStore = new RunStore();

  beforeEach(() => {
    logOutput = [];
    logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logOutput.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('reports repository is clean when no findings exist in latest scan', async () => {
    const cleanRun: ScanRunRecord = {
      runId: 'run-test-clean-999',
      timestamp: new Date(Date.now() + 1000).toISOString(),
      projectName: 'review-clean-test',
      repositoryRoot: process.cwd(),
      filesScanned: 5,
      findingsCount: 0,
      durationMs: 5,
      summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      findings: [],
    };
    await runStore.saveRun(cleanRun);

    const program = createCliProgram('0.1.2');
    await program.parseAsync(['node', 'repoguard', 'review']);

    const fullOutput = logOutput.join('\n');
    expect(fullOutput).toContain('RepoGuard Human-in-the-Loop Review Gate');
    expect(fullOutput).toContain('No actionable security findings found');
    expect(fullOutput).toContain('Repository is clean');
  });

  it('executes review command with --dry-run and previews real finding patch without modification', async () => {
    const findingRun: ScanRunRecord = {
      runId: 'run-test-finding-dryrun',
      timestamp: new Date(Date.now() + 2000).toISOString(),
      projectName: 'review-test',
      repositoryRoot: process.cwd(),
      filesScanned: 1,
      findingsCount: 1,
      durationMs: 10,
      summary: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
      findings: [
        {
          id: 'SEC-002-users-L15',
          category: 'Security / SQL Injection',
          severity: 'HIGH',
          title: 'Potential SQL Injection (Dynamic Query Concatenation)',
          path: 'src/api/users.ts',
          lineRange: { start: 15, end: 15 },
          explanation: 'Raw SQL query constructed via dynamic string concatenation.',
          evidence: '> 15 | const query = "SELECT * FROM users WHERE id = " + req.params.id;',
        },
      ],
    };
    await runStore.saveRun(findingRun);

    const program = createCliProgram('0.1.2');
    await program.parseAsync(['node', 'repoguard', 'review', '--dry-run']);

    const fullOutput = logOutput.join('\n');
    expect(fullOutput).toContain('RepoGuard Human-in-the-Loop Review Gate');
    expect(fullOutput).toContain('Patch application was skipped (dry-run mode)');
    expect(fullOutput).toContain('REPAIR-SEC-002-users-L15');
  });

  it('executes review command with --yes and confirms automatic approval of real finding', async () => {
    const findingRun: ScanRunRecord = {
      runId: 'run-test-finding-yes',
      timestamp: new Date(Date.now() + 3000).toISOString(),
      projectName: 'review-test',
      repositoryRoot: process.cwd(),
      filesScanned: 1,
      findingsCount: 1,
      durationMs: 10,
      summary: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
      findings: [
        {
          id: 'SEC-003-server-L42',
          category: 'Security / Command Injection',
          severity: 'CRITICAL',
          title: 'Command Injection via Dynamic Shell Execution',
          path: 'src/server.ts',
          lineRange: { start: 42, end: 42 },
          explanation: 'Shell command constructed with dynamic variables passed to exec().',
          evidence: '> 42 | exec(`rm -rf ${userDir}`);',
        },
      ],
    };
    await runStore.saveRun(findingRun);

    const program = createCliProgram('0.1.2');
    await program.parseAsync(['node', 'repoguard', 'review', '--yes']);

    const fullOutput = logOutput.join('\n');
    expect(fullOutput).toContain('RepoGuard Human-in-the-Loop Review Gate');
    expect(fullOutput).toContain('explicitly APPROVED');
    expect(fullOutput).toContain('REPAIR-SEC-003-server-L42');
  });

  it('executes review command with --yes and successfully applies patch when target file exists on disk', async () => {
    const fixtureDir = join(process.cwd(), 'tests', 'fixtures');
    await mkdir(fixtureDir, { recursive: true });
    const targetFile = join(fixtureDir, 'review-apply-target.ts');
    await writeFile(targetFile, 'const unvalidatedInput = req.body;\n');

    try {
      const applyRun: ScanRunRecord = {
        runId: 'run-test-finding-apply-success',
        timestamp: new Date(Date.now() + 4000).toISOString(),
        projectName: 'review-apply-test',
        repositoryRoot: process.cwd(),
        filesScanned: 1,
        findingsCount: 1,
        durationMs: 10,
        summary: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
        findings: [
          {
            id: 'SEC-004-target-L1',
            category: 'Security / Input Validation',
            severity: 'HIGH',
            title: 'Unvalidated Request Body Usage',
            path: 'tests/fixtures/review-apply-target.ts',
            lineRange: { start: 1, end: 1 },
            explanation: 'Unvalidated body used directly.',
          },
        ],
      };
      await runStore.saveRun(applyRun);

      const program = createCliProgram('0.1.2');
      await program.parseAsync(['node', 'repoguard', 'review', '--yes']);

      const fullOutput = logOutput.join('\n');
      expect(fullOutput).toContain('explicitly APPROVED');
      expect(fullOutput).toContain('Patch successfully applied to disk');

      const contentAfter = await readFile(targetFile, 'utf8');
      expect(contentAfter).toContain('const validatedInput = schema.parse(req.body);');
    } finally {
      if (existsSync(targetFile)) {
        await rm(targetFile, { force: true });
      }
    }
  });
});
