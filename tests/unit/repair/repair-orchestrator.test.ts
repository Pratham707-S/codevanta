/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/repair/repair-orchestrator.test.ts
 * Owner: Pratham
 * Purpose: Unit tests for full repair workflow orchestration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable, Writable } from 'node:stream';
import {
  RepairOrchestrator,
  orchestrateRepair,
  type RepairProposal,
} from '../../../src/repair/repair-orchestrator.js';

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

describe('RepairOrchestrator', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'repoguard-orch-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const validDiff = `--- a/service.ts
+++ b/service.ts
@@ -1,3 +1,3 @@
 function serve() {
-  return 80;
+  return 8080;
 }`;

  describe('orchestrate', () => {
    it('applies repair when autoApprove is true', async () => {
      const filePath = join(tempDir, 'service.ts');
      await writeFile(filePath, 'function serve() {\n  return 80;\n}\n');

      const proposal: RepairProposal = {
        id: 'prop-1',
        findingId: 'vuln-01',
        title: 'Fix Port',
        filePath: 'service.ts',
        diff: validDiff,
        riskLevel: 'LOW',
      };

      const result = await orchestrateRepair(proposal, {
        repoRoot: tempDir,
        autoApprove: true,
      });

      expect(result.status).toBe('APPLIED');
      expect(result.approved).toBe(true);
      expect(result.applied).toBe(true);
      expect(result.summary).toContain('applied successfully');

      const updated = await readFile(filePath, 'utf8');
      expect(updated).toContain('return 8080;');
    });

    it('rejects immediately when patch is invalid (malformed or path traversal)', async () => {
      const proposal: RepairProposal = {
        id: 'prop-bad',
        filePath: '../../escape.ts',
        diff: `--- a/../../escape.ts
+++ b/../../escape.ts
@@ -1,1 +1,1 @@
-bad
+good`,
      };

      const result = await orchestrateRepair(proposal, {
        repoRoot: tempDir,
        autoApprove: true,
      });

      expect(result.status).toBe('REJECTED');
      expect(result.approved).toBe(false);
      expect(result.applied).toBe(false);
      expect(result.summary).toContain('Patch validation failed');
    });

    it('halts and does not apply patch when user rejects prompt', async () => {
      const filePath = join(tempDir, 'service.ts');
      await writeFile(filePath, 'function serve() {\n  return 80;\n}\n');

      const proposal: RepairProposal = {
        id: 'prop-reject',
        filePath: 'service.ts',
        diff: validDiff,
      };

      const input = Readable.from(['n\n']);
      const output = new MemoryWritable();

      const result = await orchestrateRepair(proposal, {
        repoRoot: tempDir,
        input,
        output,
      });

      expect(result.status).toBe('REJECTED');
      expect(result.approved).toBe(false);
      expect(result.applied).toBe(false);
      expect(result.summary).toContain('Approval gate halted repair');

      // File was not modified
      const current = await readFile(filePath, 'utf8');
      expect(current).toContain('return 80;');
    });

    it('skips disk modification in dryRun mode', async () => {
      const filePath = join(tempDir, 'service.ts');
      await writeFile(filePath, 'function serve() {\n  return 80;\n}\n');

      const proposal: RepairProposal = {
        id: 'prop-dry',
        filePath: 'service.ts',
        diff: validDiff,
      };

      const result = await orchestrateRepair(proposal, {
        repoRoot: tempDir,
        dryRun: true,
      });

      expect(result.status).toBe('SKIPPED');
      expect(result.approved).toBe(false);
      expect(result.applied).toBe(false);

      const current = await readFile(filePath, 'utf8');
      expect(current).toContain('return 80;');
    });
  });

  describe('orchestrateBatch', () => {
    it('executes batch proposals sequentially', async () => {
      const file1 = join(tempDir, 'f1.ts');
      const file2 = join(tempDir, 'f2.ts');
      await writeFile(file1, 'const a = 1;');
      await writeFile(file2, 'const b = 2;');

      const p1: RepairProposal = {
        id: 'p1',
        filePath: 'f1.ts',
        diff: `--- a/f1.ts\n+++ b/f1.ts\n@@ -1,1 +1,1 @@\n-const a = 1;\n+const a = 10;`,
      };
      const p2: RepairProposal = {
        id: 'p2',
        filePath: 'f2.ts',
        diff: `--- a/f2.ts\n+++ b/f2.ts\n@@ -1,1 +1,1 @@\n-const b = 2;\n+const b = 20;`,
      };

      const orchestrator = new RepairOrchestrator({
        repoRoot: tempDir,
        autoApprove: true,
      });

      const results = await orchestrator.orchestrateBatch([p1, p2]);
      expect(results).toHaveLength(2);
      expect(results[0]?.status).toBe('APPLIED');
      expect(results[1]?.status).toBe('APPLIED');

      expect(await readFile(file1, 'utf8')).toBe('const a = 10;');
      expect(await readFile(file2, 'utf8')).toBe('const b = 20;');
    });
  });

  describe('Verification & Rollback Integration', () => {
    it('marks status VERIFIED when verification checks pass', async () => {
      const filePath = join(tempDir, 'service.ts');
      await writeFile(filePath, 'function serve() {\n  return 80;\n}\n');

      const proposal: RepairProposal = {
        id: 'prop-pass',
        filePath: 'service.ts',
        diff: validDiff,
      };

      const result = await orchestrateRepair(proposal, {
        repoRoot: tempDir,
        autoApprove: true,
        runVerification: true,
        verificationSuite: {
          name: 'Passing-Suite',
          checks: [{ name: 'quick-pass', command: 'node -e "process.exit(0)"' }],
        },
      });

      expect(result.status).toBe('VERIFIED');
      expect(result.applied).toBe(true);
      expect(result.rollbackOccurred).toBe(false);
      expect(result.verificationResult?.overallOutcome).toBe('PASSED');
      expect(await readFile(filePath, 'utf8')).toContain('return 8080;');
    });

    it('marks status ROLLED_BACK when verification check fails and successfully restores files', async () => {
      const filePath = join(tempDir, 'service.ts');
      await writeFile(filePath, 'function serve() {\n  return 80;\n}\n');

      const proposal: RepairProposal = {
        id: 'prop-fail',
        filePath: 'service.ts',
        diff: validDiff,
      };

      const result = await orchestrateRepair(proposal, {
        repoRoot: tempDir,
        autoApprove: true,
        runVerification: true,
        verificationSuite: {
          name: 'Failing-Suite',
          checks: [{ name: 'failing-test', command: 'node -e "process.exit(1)"' }],
        },
      });

      expect(result.status).toBe('ROLLED_BACK');
      expect(result.applied).toBe(false);
      expect(result.rollbackOccurred).toBe(true);
      expect(result.verificationResult?.overallOutcome).toBe('FAILED');
      // Original content restored
      expect(await readFile(filePath, 'utf8')).toContain('return 80;');
    });

    it('marks status ROLLBACK_FAILED and retains rollbackErrors when rollback restoration fails', async () => {
      const filePath = join(tempDir, 'service.ts');
      await writeFile(filePath, 'function serve() {\n  return 80;\n}\n');

      const proposal: RepairProposal = {
        id: 'prop-rollback-fail',
        filePath: 'service.ts',
        diff: validDiff,
      };

      const orchestrator = new RepairOrchestrator({
        repoRoot: tempDir,
        autoApprove: true,
      });

      // Spy on patchApplicator to return a failing rollbackHandle
      const origApply = orchestrator['patchApplicator'].applyPatch.bind(orchestrator['patchApplicator']);
      orchestrator['patchApplicator'].applyPatch = async (diffText, options) => {
        const res = await origApply(diffText, options);
        return {
          ...res,
          rollbackHandle: async () => ({
            success: false,
            restoredFiles: [],
            errors: ['Simulated disk full / EACCES permission denied on restore'],
          }),
        };
      };

      const result = await orchestrator.orchestrate(proposal, {
        runVerification: true,
        verificationSuite: {
          name: 'Failing-Suite',
          checks: [{ name: 'failing-test', command: 'node -e "process.exit(1)"' }],
        },
      });

      expect(result.status).toBe('ROLLBACK_FAILED');
      expect(result.applied).toBe(false);
      expect(result.rollbackOccurred).toBe(false);
      expect(result.rollbackErrors).toEqual([
        'Simulated disk full / EACCES permission denied on restore',
      ]);
      expect(result.summary).toContain('CRITICAL: Automatic rollback failed');
      // Confidence must be heavily penalized
      expect(result.confidence?.finalScore).toBeLessThanOrEqual(0.1);
      expect(result.confidence?.flags).toContain('ROLLBACK_FAILED');
    });

    it('auto-discovers verification checks from package.json when verificationSuite is omitted', async () => {
      const filePath = join(tempDir, 'service.ts');
      await writeFile(filePath, 'function serve() {\n  return 80;\n}\n');

      await writeFile(
        join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'discovered-repo',
          scripts: {
            test: 'node -e "process.exit(0)"',
          },
        })
      );

      const proposal: RepairProposal = {
        id: 'prop-autodiscover',
        filePath: 'service.ts',
        diff: validDiff,
      };

      const result = await orchestrateRepair(proposal, {
        repoRoot: tempDir,
        autoApprove: true,
        runVerification: true,
      });

      expect(result.status).toBe('VERIFIED');
      expect(result.verificationResult?.checks.some((c) => c.checkName === 'Unit Tests')).toBe(true);
    });

    it('respects failFast and marks remaining checks as SKIPPED', async () => {
      const filePath = join(tempDir, 'service.ts');
      await writeFile(filePath, 'function serve() {\n  return 80;\n}\n');

      const proposal: RepairProposal = {
        id: 'prop-failfast',
        filePath: 'service.ts',
        diff: validDiff,
      };

      const result = await orchestrateRepair(proposal, {
        repoRoot: tempDir,
        autoApprove: true,
        runVerification: true,
        failFast: true,
        verificationSuite: {
          name: 'FailFast-Suite',
          checks: [
            { name: 'check-1-fail', command: 'node -e "process.exit(1)"' },
            { name: 'check-2-skipped', command: 'node -e "process.exit(0)"' },
          ],
        },
      });

      expect(result.status).toBe('ROLLED_BACK');
      expect(result.verificationResult?.checks).toHaveLength(2);
      expect(result.verificationResult?.checks[0]?.outcome).toBe('FAILED');
      expect(result.verificationResult?.checks[1]?.outcome).toBe('SKIPPED');
    });

    it('leaves verification disabled by default when runVerification is omitted', async () => {
      const filePath = join(tempDir, 'service.ts');
      await writeFile(filePath, 'function serve() {\n  return 80;\n}\n');

      const proposal: RepairProposal = {
        id: 'prop-default',
        filePath: 'service.ts',
        diff: validDiff,
      };

      const result = await orchestrateRepair(proposal, {
        repoRoot: tempDir,
        autoApprove: true,
      });

      expect(result.status).toBe('APPLIED');
      expect(result.verificationResult).toBeUndefined();
    });

    it('strictly executes verification checks in the designated repoRoot worktree', async () => {
      const filePath = join(tempDir, 'service.ts');
      await writeFile(filePath, 'function serve() {\n  return 80;\n}\n');

      const proposal: RepairProposal = {
        id: 'prop-worktree',
        filePath: 'service.ts',
        diff: validDiff,
      };

      const result = await orchestrateRepair(proposal, {
        repoRoot: tempDir,
        autoApprove: true,
        runVerification: true,
        verificationSuite: {
          name: 'Cwd-Verification',
          checks: [
            {
              name: 'write-proof',
              command: 'node -e "require(\'fs\').writeFileSync(\'worktree-proof.txt\', \'verified\')"',
            },
          ],
        },
      });

      expect(result.status).toBe('VERIFIED');
      // Proof file must exist inside tempDir, never outside
      expect(await readFile(join(tempDir, 'worktree-proof.txt'), 'utf8')).toBe('verified');
    });
  });
});
