/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/repair/approval-gate.test.ts
 * Owner: Pratham
 * Purpose: Unit tests for interactive human approval gate and safety guards
 */

import { describe, it, expect } from 'vitest';
import { Readable, Writable, PassThrough } from 'node:stream';
import {
  ApprovalGate,
  requestApproval,
  type PatchCandidate,
} from '../../../src/repair/approval-gate.js';

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

describe('ApprovalGate', () => {
  const sampleCandidate: PatchCandidate = {
    id: 'patch-001',
    findingId: 'vuln-sql-01',
    filePath: 'src/database/query.ts',
    riskLevel: 'HIGH',
    description: 'Use parameterized queries instead of string concatenation.',
    diff: `--- a/src/database/query.ts\n+++ b/src/database/query.ts\n@@ -10,3 +10,3 @@\n-const res = db.query("SELECT * FROM users WHERE id = " + id);\n+const res = db.query("SELECT * FROM users WHERE id = ?", [id]);`,
  };

  describe('Non-interactive and Flag Guards', () => {
    it('skips patch application when dryRun is true', async () => {
      const gate = new ApprovalGate();
      const decision = await gate.requestApproval(sampleCandidate, { dryRun: true });

      expect(decision.status).toBe('SKIPPED');
      expect(decision.approved).toBe(false);
      expect(decision.reason).toContain('Dry-run mode active');
      expect(decision.filePath).toBe('src/database/query.ts');
    });

    it('approves automatically when autoApprove is true', async () => {
      const gate = new ApprovalGate();
      const decision = await gate.requestApproval(sampleCandidate, { autoApprove: true });

      expect(decision.status).toBe('APPROVED');
      expect(decision.approved).toBe(true);
      expect(decision.reason).toContain('auto-approve flag');
      expect(decision.patchId).toBe('patch-001');
    });

    it('rejects in non-interactive environment when autoApprove is false', async () => {
      const gate = new ApprovalGate();
      const decision = await gate.requestApproval(sampleCandidate, { interactive: false });

      expect(decision.status).toBe('REJECTED');
      expect(decision.approved).toBe(false);
      expect(decision.reason).toContain('non-interactive');
    });
  });

  describe('Interactive Prompts', () => {
    it('approves when developer types "y"', async () => {
      const gate = new ApprovalGate();
      const input = Readable.from(['y\n']);
      const output = new MemoryWritable();

      const decision = await gate.requestApproval(sampleCandidate, {
        input,
        output,
        renderPreview: true,
      });

      expect(decision.status).toBe('APPROVED');
      expect(decision.approved).toBe(true);
      expect(decision.reason).toContain('Explicitly approved');
      expect(output.output).toContain('REPAIR PROPOSAL PENDING HUMAN APPROVAL');
      expect(output.output).toContain('src/database/query.ts');
    });

    it('approves when developer types "yes" with uppercase letters', async () => {
      const gate = new ApprovalGate();
      const input = Readable.from(['  YES  \n']);
      const output = new MemoryWritable();

      const decision = await gate.requestApproval(sampleCandidate, { input, output });

      expect(decision.status).toBe('APPROVED');
      expect(decision.approved).toBe(true);
    });

    it('rejects when developer types "n"', async () => {
      const gate = new ApprovalGate();
      const input = Readable.from(['n\n']);
      const output = new MemoryWritable();

      const decision = await gate.requestApproval(sampleCandidate, { input, output });

      expect(decision.status).toBe('REJECTED');
      expect(decision.approved).toBe(false);
      expect(decision.reason).toContain('Explicitly rejected');
    });

    it('rejects by default when developer presses Enter (empty input)', async () => {
      const gate = new ApprovalGate();
      const input = Readable.from(['\n']);
      const output = new MemoryWritable();

      const decision = await gate.requestApproval(sampleCandidate, { input, output });

      expect(decision.status).toBe('REJECTED');
      expect(decision.approved).toBe(false);
      expect(decision.reason).toContain('pressed Enter without confirmation');
    });

    it('re-prompts on invalid input and approves upon valid "y"', async () => {
      const gate = new ApprovalGate();
      const input = new PassThrough();
      const output = new MemoryWritable();

      input.write('maybe\n');
      setTimeout(() => input.write('huh?\n'), 10);
      setTimeout(() => input.write('y\n'), 20);

      const decision = await gate.requestApproval(sampleCandidate, { input, output });

      expect(decision.status).toBe('APPROVED');
      expect(decision.approved).toBe(true);
      expect(output.output).toContain('Invalid choice "maybe"');
      expect(output.output).toContain('Invalid choice "huh?"');
    });

    it('rejects when maximum retries are exhausted', async () => {
      const gate = new ApprovalGate();
      const input = new PassThrough();
      const output = new MemoryWritable();

      input.write('invalid-1\n');
      setTimeout(() => input.write('invalid-2\n'), 10);
      setTimeout(() => input.write('invalid-3\n'), 20);

      const decision = await gate.requestApproval(sampleCandidate, {
        input,
        output,
        maxRetries: 3,
      });

      expect(decision.status).toBe('REJECTED');
      expect(decision.approved).toBe(false);
      expect(decision.reason).toContain('Exceeded maximum invalid response attempts');
    });

    it('rejects safely when input stream ends unexpectedly before confirmation', async () => {
      const gate = new ApprovalGate();
      const input = Readable.from(['invalid-input\n']);
      const output = new MemoryWritable();

      const decision = await gate.requestApproval(sampleCandidate, { input, output });

      expect(decision.status).toBe('REJECTED');
      expect(decision.approved).toBe(false);
      expect(decision.reason).toContain('Input stream ended');
    });

    it('aborts when timeout is reached', async () => {
      const gate = new ApprovalGate();
      // An unclosed readable stream that never emits data
      const input = new Readable({ read() {} });
      const output = new MemoryWritable();

      const decision = await gate.requestApproval(sampleCandidate, {
        input,
        output,
        timeoutMs: 50,
      });

      expect(decision.status).toBe('ABORTED');
      expect(decision.approved).toBe(false);
      expect(decision.reason).toContain('timed out after 50ms');
    });
  });

  describe('formatPreview', () => {
    it('renders colorized boxes, metadata, and diff preview', () => {
      const gate = new ApprovalGate();
      const preview = gate.formatPreview(sampleCandidate);

      expect(preview).toContain('Proposal ID:');
      expect(preview).toContain('patch-001');
      expect(preview).toContain('Finding ID:');
      expect(preview).toContain('vuln-sql-01');
      expect(preview).toContain('src/database/query.ts');
      expect(preview).toContain('HIGH');
      expect(preview).toContain('Diff Preview:');
      expect(preview).toContain('const res = db.query');
    });
  });

  describe('requestBatchApproval', () => {
    it('processes batch candidates sequentially', async () => {
      const gate = new ApprovalGate();
      const candidate1: PatchCandidate = { filePath: 'file1.ts' };
      const candidate2: PatchCandidate = { filePath: 'file2.ts' };

      const decisions = await gate.requestBatchApproval([candidate1, candidate2], {
        autoApprove: true,
      });

      expect(decisions).toHaveLength(2);
      expect(decisions[0]?.filePath).toBe('file1.ts');
      expect(decisions[1]?.filePath).toBe('file2.ts');
      expect(decisions[0]?.approved).toBe(true);
      expect(decisions[1]?.approved).toBe(true);
    });

    it('halts batch processing if an item is aborted', async () => {
      const gate = new ApprovalGate();
      const candidate1: PatchCandidate = { filePath: 'file1.ts' };
      const candidate2: PatchCandidate = { filePath: 'file2.ts' };

      const input = new Readable({ read() {} });
      const output = new MemoryWritable();

      const decisions = await gate.requestBatchApproval([candidate1, candidate2], {
        input,
        output,
        timeoutMs: 30,
      });

      expect(decisions).toHaveLength(1);
      expect(decisions[0]?.status).toBe('ABORTED');
    });
  });

  describe('Standalone Helper', () => {
    it('requestApproval helper function delegates correctly', async () => {
      const decision = await requestApproval(sampleCandidate, { autoApprove: true });
      expect(decision.status).toBe('APPROVED');
      expect(decision.approved).toBe(true);
    });
  });
});
