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
});
