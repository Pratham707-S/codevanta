/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/integration/repair-verification.test.ts
 * Owner: Shared — Pratham coordinates
 * Purpose: Integration test: patch generation, diff preview, approval gate, and safe application workflow
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateUnifiedDiff,
  validatePatch,
  renderProposalPreview,
  orchestrateRepair,
  type RepairProposal,
} from '../../src/repair/index.js';

describe('Integration: Repair Pipeline End-to-End Workflow', () => {
  let tempRepo: string;

  beforeEach(async () => {
    tempRepo = await mkdtemp(join(tmpdir(), 'repoguard-e2e-repair-'));
  });

  afterEach(async () => {
    await rm(tempRepo, { recursive: true, force: true });
  });

  it('runs complete lifecycle: diff generation -> validation -> preview -> approval -> application', async () => {
    // 1. Setup buggy file in workspace
    const targetFile = 'src/calculator.ts';
    const originalContent = [
      'export function divide(a: number, b: number): number {',
      '  return a / b;',
      '}',
    ].join('\n');

    await writeFile(join(tempRepo, 'package.json'), JSON.stringify({ name: 'sample-project' }));
    const targetAbsPath = join(tempRepo, targetFile);
    const { mkdir } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    await mkdir(dirname(targetAbsPath), { recursive: true });
    await writeFile(targetAbsPath, originalContent);

    // 2. Generate fix
    const fixedContent = [
      'export function divide(a: number, b: number): number {',
      '  if (b === 0) throw new Error("Division by zero");',
      '  return a / b;',
      '}',
    ].join('\n');

    const diff = generateUnifiedDiff(originalContent, fixedContent, { filePath: targetFile });
    expect(diff).toContain('--- a/src/calculator.ts');
    expect(diff).toContain('+++ b/src/calculator.ts');
    expect(diff).toContain('+  if (b === 0) throw new Error("Division by zero");');

    // 3. Validate patch & path traversal safety
    const validation = validatePatch(diff, { repoRoot: tempRepo });
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // 4. Generate reviewable diff preview
    const proposal: RepairProposal = {
      id: 'fix-div-01',
      findingId: 'vuln-div-by-zero',
      title: 'Prevent Unhandled Division by Zero',
      filePath: targetFile,
      diff,
      rationale: 'Guard against ZeroDivisionError by throwing explicit validation error',
      riskLevel: 'LOW',
    };

    const preview = renderProposalPreview(proposal, { color: false });
    expect(preview).toContain('REPAIR PROPOSAL PREVIEW');
    expect(preview).toContain('Proposal ID:  fix-div-01');
    expect(preview).toContain('src/calculator.ts');
    expect(preview).toContain('Division by zero');

    // 5. Orchestrate repair with approval
    const execution = await orchestrateRepair(proposal, {
      repoRoot: tempRepo,
      autoApprove: true,
    });

    expect(execution.status).toBe('APPLIED');
    expect(execution.approved).toBe(true);
    expect(execution.applied).toBe(true);

    // 6. Verify actual file content on disk
    const patchedContent = await readFile(targetAbsPath, 'utf8');
    expect(patchedContent).toContain('if (b === 0) throw new Error("Division by zero");');
    expect(patchedContent).toContain('return a / b;');
  });
});

