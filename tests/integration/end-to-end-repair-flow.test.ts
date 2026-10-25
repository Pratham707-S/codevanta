/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/integration/end-to-end-repair-flow.test.ts
 * Owner: Shared — Pratham coordinates
 * Purpose: End-to-end integration tests for repair orchestration, verification, rollback, and confidence calibration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable, Writable } from 'node:stream';
import {
  RepairOrchestrator,
  type FindingRepairInput,
  type RepairProposal,
} from '../../src/repair/index.js';
import { MockAdapter } from '../../src/providers/mock-adapter.js';
import { createCliProgram } from '../../src/cli/cli.js';
import { RunStore, type ScanRunRecord } from '../../src/storage/run-store.js';

class MemoryWritable extends Writable {
  public output = '';
  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.output += chunk.toString();
    callback();
  }
}

describe('Integration: End-to-End Repair Orchestration & Intelligence', () => {
  let tempRepo: string;

  beforeEach(async () => {
    tempRepo = await mkdtemp(join(tmpdir(), 'repoguard-e2e-step6-'));
  });

  afterEach(async () => {
    await rm(tempRepo, { recursive: true, force: true });
  });

  it('successfully executes end-to-end: finding -> context -> AI patch -> approval -> apply -> verified -> high confidence', async () => {
    const relPath = 'src/config/secrets.ts';
    const absPath = join(tempRepo, relPath);
    await mkdir(join(tempRepo, 'src/config'), { recursive: true });

    const originalContent = [
      '// Configuration initialization',
      'const secretKey = "hardcoded_sensitive_credential";',
      'export default secretKey;',
    ].join('\n');
    await writeFile(absPath, originalContent, 'utf8');

    const finding: FindingRepairInput = {
      id: 'SEC-001-secrets-L2',
      category: 'SEC-001 / Hardcoded Credentials',
      severity: 'CRITICAL',
      title: 'Hardcoded sensitive credential found in config',
      path: relPath,
      lineRange: { start: 2, end: 2 },
      explanation: 'Plaintext secret credential committed to source repository',
      evidence: 'const secretKey = "hardcoded_sensitive_credential";',
    };

    const orchestrator = new RepairOrchestrator({
      repoRoot: tempRepo,
      autoApprove: true,
      runVerification: true,
      verificationSuite: {
        name: 'Safe-Pass-Verification',
        checks: [{ name: 'safe-check', command: 'node -e "process.exit(0)"' }],
      },
    });

    const result = await orchestrator.orchestrateFinding(finding, {
      repoRoot: tempRepo,
      autoApprove: true,
      runVerification: true,
      verificationSuite: {
        name: 'Safe-Pass-Verification',
        checks: [{ name: 'safe-check', command: 'node -e "process.exit(0)"' }],
      },
    });

    // Verify workflow outcome
    expect(result.status).toBe('VERIFIED');
    expect(result.approved).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.rollbackOccurred).toBe(false);

    // Verify verification execution
    expect(result.verificationResult).toBeDefined();
    expect(result.verificationResult?.overallOutcome).toBe('PASSED');
    expect(result.verificationResult?.passedCount).toBe(1);

    // Verify evidence-based confidence calibration
    expect(result.confidence).toBeDefined();
    expect(result.confidence?.tier).toBe('VERY_HIGH');
    expect(result.confidence?.finalScore).toBeGreaterThanOrEqual(0.85);
    expect(result.confidence?.flags).toHaveLength(0);

    // Verify target file on disk was modified with fix
    const patchedContent = await readFile(absPath, 'utf8');
    expect(patchedContent).toContain('process.env.SERVICE_SECRET');
    expect(patchedContent).not.toContain('hardcoded_sensitive_credential');
  });

  it('halts without touching disk when developer rejects prompt at human approval gate', async () => {
    const relPath = 'src/service.ts';
    const absPath = join(tempRepo, relPath);
    await mkdir(join(tempRepo, 'src'), { recursive: true });

    const originalContent = 'function getSecret() { return "secret"; }\n';
    await writeFile(absPath, originalContent, 'utf8');

    const finding: FindingRepairInput = {
      id: 'FINDING-REJECT',
      category: 'SEC-001',
      severity: 'HIGH',
      title: 'Secret in service',
      path: relPath,
      lineRange: { start: 1, end: 1 },
      explanation: 'Secret found in service.ts',
    };

    const input = Readable.from(['n\n']);
    const output = new MemoryWritable();

    const orchestrator = new RepairOrchestrator({
      repoRoot: tempRepo,
      input,
      output,
    });

    const result = await orchestrator.orchestrateFinding(finding, {
      repoRoot: tempRepo,
      input,
      output,
    });

    expect(result.status).toBe('REJECTED');
    expect(result.approved).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.summary).toContain('Approval gate halted repair');

    // File remains completely untouched
    const currentContent = await readFile(absPath, 'utf8');
    expect(currentContent).toBe(originalContent);
  });

  it('rejects malformed AI proposal and preserves working tree without modification', async () => {
    const relPath = 'src/app.ts';
    const absPath = join(tempRepo, relPath);
    await mkdir(join(tempRepo, 'src'), { recursive: true });
    await writeFile(absPath, 'const app = true;\n', 'utf8');

    const finding: FindingRepairInput = {
      id: 'FINDING-MALFORMED',
      category: 'SEC-001',
      title: 'Bad fix',
      path: relPath,
    };

    const brokenProvider = new MockAdapter();
    brokenProvider.setCustomRepair(() => ({
      provider: 'mock',
      model: 'broken',
      findingId: finding.id,
      targetFilePath: relPath,
      description: 'Bad diff syntax',
      rootCause: 'test',
      diff: 'Invalid non-unified diff content',
      confidence: 0.99,
      isValidDiff: false,
      isSafePath: true,
      validationErrors: ['Missing unified diff headers'],
      timestamp: new Date().toISOString(),
    }));

    const orchestrator = new RepairOrchestrator({
      repoRoot: tempRepo,
      autoApprove: true,
      provider: brokenProvider,
    });

    const result = await orchestrator.orchestrateFinding(finding, {
      repoRoot: tempRepo,
      autoApprove: true,
      provider: brokenProvider,
    });

    expect(result.status).toBe('REJECTED');
    expect(result.approved).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.summary).toContain('AI proposal rejected');
  });

  it('strictly blocks path traversal attempts in finding targets', async () => {
    const finding: FindingRepairInput = {
      id: 'FINDING-TRAVERSAL',
      category: 'SEC-002',
      title: 'Traversal attempt',
      path: '../../outside.ts',
    };

    const orchestrator = new RepairOrchestrator({
      repoRoot: tempRepo,
      autoApprove: true,
    });

    const result = await orchestrator.orchestrateFinding(finding, {
      repoRoot: tempRepo,
      autoApprove: true,
    });

    expect(result.status).toBe('REJECTED');
    expect(result.approved).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.summary).toContain('unsafe target path rejected');
  });

  it('handles patch application failure safely and reports failure without throwing', async () => {
    const relPath = 'src/diverged.ts';
    const absPath = join(tempRepo, relPath);
    await mkdir(join(tempRepo, 'src'), { recursive: true });
    await writeFile(absPath, 'const completelyDifferentCode = 999;\n', 'utf8');

    const proposal: RepairProposal = {
      id: 'PROP-MISMATCH',
      filePath: relPath,
      diff: [
        `--- a/${relPath}`,
        `+++ b/${relPath}`,
        '@@ -1,3 +1,3 @@',
        '-const expectedLineOne = 1;',
        '+const fixedLineOne = 2;',
      ].join('\n'),
    };

    const orchestrator = new RepairOrchestrator({
      repoRoot: tempRepo,
      autoApprove: true,
    });

    const result = await orchestrator.orchestrate(proposal, {
      repoRoot: tempRepo,
      autoApprove: true,
    });

    expect(result.status).toBe('FAILED');
    expect(result.applied).toBe(false);
    expect(result.summary).toContain('Patch application failed');

    // Original file remains preserved
    const current = await readFile(absPath, 'utf8');
    expect(current).toContain('const completelyDifferentCode = 999;');
  });

  it('automatically rolls back modified file when verification checks fail and truthfully reports failure', async () => {
    const relPath = 'src/service.ts';
    const absPath = join(tempRepo, relPath);
    await mkdir(join(tempRepo, 'src'), { recursive: true });

    const originalContent = [
      '// Configuration initialization',
      'const secretKey = "hardcoded_sensitive_credential";',
      'export default secretKey;',
    ].join('\n');
    await writeFile(absPath, originalContent, 'utf8');

    const finding: FindingRepairInput = {
      id: 'SEC-001-fail-verification',
      category: 'SEC-001',
      severity: 'HIGH',
      title: 'Secret key with failing verification',
      path: relPath,
      lineRange: { start: 2, end: 2 },
    };

    const orchestrator = new RepairOrchestrator({
      repoRoot: tempRepo,
      autoApprove: true,
      runVerification: true,
      autoRollbackOnVerificationFailure: true,
      verificationSuite: {
        name: 'Failing-Suite',
        checks: [{ name: 'failing-test', command: 'node -e "process.exit(1)"' }],
      },
    });

    const result = await orchestrator.orchestrateFinding(finding, {
      repoRoot: tempRepo,
      autoApprove: true,
      runVerification: true,
      autoRollbackOnVerificationFailure: true,
      verificationSuite: {
        name: 'Failing-Suite',
        checks: [{ name: 'failing-test', command: 'node -e "process.exit(1)"' }],
      },
    });

    // Truthful outcome verification
    expect(result.status).toBe('ROLLED_BACK');
    expect(result.approved).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.rollbackOccurred).toBe(true);
    expect(result.verificationResult?.overallOutcome).toBe('FAILED');

    // Invariant: Failed verification caps confidence at VERY_LOW
    expect(result.confidence?.tier).toBe('VERY_LOW');
    expect(result.confidence?.finalScore).toBeLessThanOrEqual(0.25);
    expect(result.confidence?.flags).toContain('VERIFICATION_FAILED');

    // File MUST be restored to exact original content
    const restoredContent = await readFile(absPath, 'utf8');
    expect(restoredContent).toBe(originalContent);
  });

  it('triggers rollback when verification command times out and penalizes score', async () => {
    const relPath = 'src/timeout.ts';
    const absPath = join(tempRepo, relPath);
    await mkdir(join(tempRepo, 'src'), { recursive: true });

    const originalContent = [
      '// Configuration initialization',
      'const secretKey = "hardcoded_sensitive_credential";',
      'export default secretKey;',
    ].join('\n');
    await writeFile(absPath, originalContent, 'utf8');

    const finding: FindingRepairInput = {
      id: 'SEC-001-timeout',
      category: 'SEC-001',
      title: 'Timeout check',
      path: relPath,
      lineRange: { start: 2, end: 2 },
    };

    const orchestrator = new RepairOrchestrator({
      repoRoot: tempRepo,
      autoApprove: true,
      runVerification: true,
      autoRollbackOnVerificationFailure: true,
      checkRunner: new (await import('../../src/verification/check-runner.js')).CheckRunner({
        cwd: tempRepo,
        defaultTimeoutMs: 100, // Short timeout
      }),
      verificationSuite: {
        name: 'Timeout-Suite',
        checks: [{ name: 'hangs', command: 'node -e "setTimeout(() => {}, 20000)"' }],
      },
    });

    const result = await orchestrator.orchestrateFinding(finding, {
      repoRoot: tempRepo,
      autoApprove: true,
      runVerification: true,
      autoRollbackOnVerificationFailure: true,
      verificationSuite: {
        name: 'Timeout-Suite',
        checks: [{ name: 'hangs', command: 'node -e "setTimeout(() => {}, 20000)"' }],
      },
    });

    expect(result.status).toBe('ROLLED_BACK');
    expect(result.rollbackOccurred).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.verificationResult?.overallOutcome).toBe('TIMED_OUT');
    expect(result.confidence?.flags).toContain('VERIFICATION_TIMED_OUT');

    // Verified rollback
    const restored = await readFile(absPath, 'utf8');
    expect(restored).toBe(originalContent);
  });

  it('applies patch with UNVERIFIED status when verification is skipped and caps score at <= 0.65', async () => {
    const relPath = 'src/unverified.ts';
    const absPath = join(tempRepo, relPath);
    await mkdir(join(tempRepo, 'src'), { recursive: true });

    const originalContent = [
      '// Configuration initialization',
      'const secretKey = "hardcoded_sensitive_credential";',
      'export default secretKey;',
    ].join('\n');
    await writeFile(absPath, originalContent, 'utf8');

    const finding: FindingRepairInput = {
      id: 'SEC-001-unverified',
      category: 'SEC-001',
      title: 'Skipped verification test',
      path: relPath,
      lineRange: { start: 2, end: 2 },
    };

    const orchestrator = new RepairOrchestrator({
      repoRoot: tempRepo,
      autoApprove: true,
      runVerification: false, // Verification skipped!
    });

    const result = await orchestrator.orchestrateFinding(finding, {
      repoRoot: tempRepo,
      autoApprove: true,
      runVerification: false,
    });

    expect(result.status).toBe('APPLIED');
    expect(result.applied).toBe(true);
    expect(result.verificationResult).toBeUndefined();

    // Invariant: Unverified patch cannot achieve VERY_HIGH and is capped at <= 0.65
    expect(result.confidence?.tier).not.toBe('VERY_HIGH');
    expect(result.confidence?.finalScore).toBeLessThanOrEqual(0.65);
    expect(result.confidence?.flags).toContain('UNVERIFIED_PATCH');
  });

  describe('CLI repoguard review command end-to-end integration', () => {
    let logOutput: string[] = [];
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logOutput = [];
      logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        logOutput.push(args.map(String).join(' '));
      });
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it('executes full review CLI flow with passing verification and outputs calibrated confidence', async () => {
      const fixtureDir = join(tempRepo, 'tests', 'fixtures');
      await mkdir(fixtureDir, { recursive: true });
      const targetFile = join(fixtureDir, 'cli-review-target.ts');
      await writeFile(targetFile, 'const unvalidatedInput = req.body;\n', 'utf8');

      const findingRun: ScanRunRecord = {
        runId: 'run-e2e-cli-verify-pass',
        timestamp: new Date().toISOString(),
        projectName: 'cli-e2e-test',
        repositoryRoot: tempRepo,
        filesScanned: 1,
        findingsCount: 1,
        durationMs: 15,
        summary: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
        findings: [
          {
            id: 'SEC-004-cli-L1',
            category: 'Security / Input Validation',
            severity: 'HIGH',
            title: 'Unvalidated Request Body Usage',
            path: 'tests/fixtures/cli-review-target.ts',
            lineRange: { start: 1, end: 1 },
            explanation: 'Unvalidated request body used directly without schema validation',
            evidence: 'const unvalidatedInput = req.body;',
          },
        ],
      };
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempRepo);

      try {
        const scopedRunStore = new RunStore('.repoguard/state', tempRepo);
        await scopedRunStore.saveRun(findingRun);

        const program = createCliProgram('0.1.3');
        await program.parseAsync([
          'node',
          'repoguard',
          'review',
          '--yes',
          '--check',
          'node -e "process.exit(0)"',
        ]);

        const fullOutput = logOutput.join('\n');
        expect(fullOutput).toContain('RepoGuard Human-in-the-Loop Review Gate');
        expect(fullOutput).toContain('explicitly APPROVED');
        expect(fullOutput).toContain('Patch successfully applied to disk');
        expect(fullOutput).toContain('Automated verification PASSED (exit code 0)');
        expect(fullOutput).toContain('Calibrated Confidence:');

        const updated = await readFile(targetFile, 'utf8');
        expect(updated).toContain('const validatedInput = schema.parse(req.body);');
      } finally {
        cwdSpy.mockRestore();
      }
    });

    it('executes review CLI flow with failing verification and rolls back automatically', async () => {
      const fixtureDir = join(tempRepo, 'tests', 'fixtures');
      await mkdir(fixtureDir, { recursive: true });
      const targetFile = join(fixtureDir, 'cli-review-rollback.ts');
      const original = 'const unvalidatedInput = req.body;\n';
      await writeFile(targetFile, original, 'utf8');

      const findingRun: ScanRunRecord = {
        runId: 'run-e2e-cli-verify-fail',
        timestamp: new Date().toISOString(),
        projectName: 'cli-e2e-test',
        repositoryRoot: tempRepo,
        filesScanned: 1,
        findingsCount: 1,
        durationMs: 15,
        summary: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
        findings: [
          {
            id: 'SEC-004-cli-fail-L1',
            category: 'Security / Input Validation',
            severity: 'HIGH',
            title: 'Unvalidated Request Body Usage',
            path: 'tests/fixtures/cli-review-rollback.ts',
            lineRange: { start: 1, end: 1 },
            explanation: 'Unvalidated request body used directly without schema validation',
            evidence: 'const unvalidatedInput = req.body;',
          },
        ],
      };

      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempRepo);

      try {
        const scopedRunStore = new RunStore('.repoguard/state', tempRepo);
        await scopedRunStore.saveRun(findingRun);

        const program = createCliProgram('0.1.3');
        await program.parseAsync([
          'node',
          'repoguard',
          'review',
          '--yes',
          '--check',
          'node -e "process.exit(1)"',
        ]);

        const fullOutput = logOutput.join('\n');
        expect(fullOutput).toContain('Automated verification FAILED');
        expect(fullOutput).toContain('Workspace automatically rolled back to clean pre-patch state');

        // File must be restored
        const current = await readFile(targetFile, 'utf8');
        expect(current).toBe(original);
      } finally {
        cwdSpy.mockRestore();
      }
    });
  });
});
