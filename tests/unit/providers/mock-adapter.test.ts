/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/providers/mock-adapter.test.ts
 * Owner: Team Lead
 * Purpose: Unit tests for deterministic MockAdapter
 */

import { describe, it, expect } from 'vitest';
import { MockAdapter } from '../../../src/providers/mock-adapter.js';
import { SanitizedPromptContext } from '../../../src/context/context-builder.js';
import { validatePatch } from '../../../src/repair/patch-parser.js';

function createMockContext(category: string, path: string): SanitizedPromptContext {
  return {
    finding: {
      id: 'FINDING-123',
      category,
      severity: 'HIGH',
      title: `Test finding for ${category}`,
      path,
      lineRange: { start: 10, end: 12 },
      explanation: 'Vulnerability explanation here',
    },
    codeSlice: {
      filePath: path,
      startLine: 1,
      endLine: 20,
      lines: [],
      rawSnippet: 'code',
      totalFileLines: 20,
    },
    formattedPromptContext: 'mock prompt context',
    hasRedactedSecrets: false,
  };
}

describe('Providers: MockAdapter', () => {
  const adapter = new MockAdapter();

  it('is available by default and reports provider name "mock"', async () => {
    expect(adapter.name).toBe('mock');
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('generates a valid, parseable unified diff for SEC-001 (secrets)', async () => {
    const ctx = createMockContext('SEC-001', 'src/config/secrets.ts');
    const result = await adapter.generateRepair(ctx);

    expect(result.provider).toBe('mock');
    expect(result.findingId).toBe('FINDING-123');
    expect(result.targetFilePath).toBe('src/config/secrets.ts');
    expect(result.isValidDiff).toBe(true);
    expect(result.isSafePath).toBe(true);
    expect(result.diff).toContain('process.env.SERVICE_SECRET');

    // Verify patch parser validates the diff
    const patchCheck = validatePatch(result.diff);
    expect(patchCheck.valid).toBe(true);
  });

  it('generates a valid unified diff for SEC-002 (SQL injection)', async () => {
    const ctx = createMockContext('SEC-002', 'src/db/users.ts');
    const result = await adapter.generateRepair(ctx);

    expect(result.isValidDiff).toBe(true);
    expect(result.diff).toContain('SELECT * FROM users WHERE id = $1');
  });

  it('generates a valid unified diff for SEC-003 (command injection)', async () => {
    const ctx = createMockContext('SEC-003', 'src/system/exec.ts');
    const result = await adapter.generateRepair(ctx);

    expect(result.isValidDiff).toBe(true);
    expect(result.diff).toContain('execFile');
  });

  it('generates a valid investigation report with root cause analysis', async () => {
    const ctx = createMockContext('SEC-001', 'src/auth.ts');
    const result = await adapter.generateInvestigation(ctx);

    expect(result.provider).toBe('mock');
    expect(result.explanation).toContain('SEC-001');
    expect(result.rootCause).toContain('lines 10-12');
    expect(result.suggestedMitigation).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('throws ProviderExecutionError when failure is simulated', async () => {
    const failingAdapter = new MockAdapter({ simulateFailure: true });
    expect(await failingAdapter.isAvailable()).toBe(false);

    const ctx = createMockContext('SEC-001', 'src/auth.ts');
    await expect(failingAdapter.generateRepair(ctx)).rejects.toThrow(/Simulated mock provider failure/);
  });
});
