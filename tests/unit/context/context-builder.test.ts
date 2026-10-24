/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/context/context-builder.test.ts
 * Owner: Security / Context (Manni / Team Lead)
 * Purpose: Unit tests for bounded context builder and secret sanitization
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildSanitizedContext } from '../../../src/context/context-builder.js';
import { StorageFinding } from '../../../src/storage/run-store.js';
import { REDACTION_MARKERS } from '../../../src/context/secret-redactor.js';

describe('Context: ContextBuilder', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'repoguard-ctx-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('bounds code slice to finding range with configured context lines', async () => {
    // Generate a 100-line sample file
    const lines: string[] = [];
    for (let i = 1; i <= 100; i++) {
      lines.push(`// Line ${i}: const val_${i} = ${i};`);
    }
    const relativeFilePath = 'src/service.ts';
    await fs.mkdir(join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(join(tempDir, relativeFilePath), lines.join('\n'), 'utf-8');

    const finding: StorageFinding = {
      id: 'FINDING-001',
      category: 'BUG-001',
      severity: 'HIGH',
      title: 'Potential null pointer dereference',
      path: relativeFilePath,
      lineRange: { start: 40, end: 42 },
      explanation: 'Unchecked return value at line 40',
    };

    const result = await buildSanitizedContext(finding, tempDir, {
      contextLines: 5,
    });

    expect(result.codeSlice.filePath).toBe(relativeFilePath);
    expect(result.codeSlice.totalFileLines).toBe(100);
    // 40 - 5 = 35, 42 + 5 = 47
    expect(result.codeSlice.startLine).toBe(35);
    expect(result.codeSlice.endLine).toBe(47);
    expect(result.codeSlice.lines.length).toBe(13);

    // Verify target lines are flagged
    const targetLines = result.codeSlice.lines.filter((l) => l.isTargetLine);
    expect(targetLines.length).toBe(3);
    expect(targetLines.map((l) => l.lineNumber)).toEqual([40, 41, 42]);
  });

  it('redacts secrets found inside the target source code before returning context', async () => {
    const sensitiveCode = `
import { Client } from 'sdk';

export function connect() {
  const apiKey = "api_key_secret_1234567890abcdef";
  const client = new Client({ key: apiKey });
  return client.init();
}
`;
    const relativePath = 'src/client.ts';
    await fs.mkdir(join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(join(tempDir, relativePath), sensitiveCode.trim(), 'utf-8');

    const finding: StorageFinding = {
      id: 'FINDING-SEC-001',
      category: 'SEC-001',
      severity: 'CRITICAL',
      title: 'Hardcoded API Key',
      path: relativePath,
      lineRange: { start: 4, end: 4 },
      explanation: 'Found api_key = "api_key_secret_1234567890abcdef"',
      evidence: 'api_key = "api_key_secret_1234567890abcdef"',
    };

    const result = await buildSanitizedContext(finding, tempDir);

    expect(result.hasRedactedSecrets).toBe(true);
    // Raw snippet and lines must NOT contain the secret
    expect(result.codeSlice.rawSnippet).not.toContain('api_key_secret_1234567890abcdef');
    expect(result.codeSlice.rawSnippet).toContain(REDACTION_MARKERS.SECRET);

    // Finding explanation and evidence must also be sanitized
    expect(result.finding.explanation).not.toContain('api_key_secret_1234567890abcdef');
    expect(result.finding.explanation).toContain(REDACTION_MARKERS.SECRET);
    expect(result.finding.evidence).not.toContain('api_key_secret_1234567890abcdef');
    expect(result.finding.evidence).toContain(REDACTION_MARKERS.SECRET);

    // Formatted prompt must not leak secrets
    expect(result.formattedPromptContext).not.toContain('api_key_secret_1234567890abcdef');
  });

  it('blocks path traversal attempts in finding path', async () => {
    const maliciousFinding: StorageFinding = {
      id: 'FINDING-BAD-PATH',
      category: 'SEC-TRAVERSAL',
      severity: 'CRITICAL',
      title: 'Path escape attempt',
      path: '../../../../etc/passwd',
      lineRange: { start: 1, end: 1 },
      explanation: 'Malicious path traversal',
    };

    await expect(buildSanitizedContext(maliciousFinding, tempDir)).rejects.toThrow(
      /path traversal|unsafe/i
    );
  });

  it('fails gracefully when source file does not exist', async () => {
    const missingFinding: StorageFinding = {
      id: 'FINDING-MISSING',
      category: 'MISC',
      severity: 'LOW',
      title: 'Missing file',
      path: 'nonexistent/file.ts',
      explanation: 'Does not exist',
    };

    await expect(buildSanitizedContext(missingFinding, tempDir)).rejects.toThrow(
      /Failed to read source file/i
    );
  });

  it('formats clean markdown prompt context with metadata and line numbers', async () => {
    const sampleCode = `const a = 1;\nconst b = 2;\nconst c = 3;`;
    const relativePath = 'src/math.ts';
    await fs.mkdir(join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(join(tempDir, relativePath), sampleCode, 'utf-8');

    const finding: StorageFinding = {
      id: 'FINDING-PROMPT',
      category: 'RELIABILITY',
      severity: 'MEDIUM',
      title: 'Unused variable',
      path: relativePath,
      lineRange: { start: 2, end: 2 },
      explanation: 'Variable b is never used',
    };

    const result = await buildSanitizedContext(finding, tempDir);

    expect(result.formattedPromptContext).toContain('### Security Finding Details');
    expect(result.formattedPromptContext).toContain('- Finding ID: FINDING-PROMPT');
    expect(result.formattedPromptContext).toContain('- Target File: src/math.ts');
    expect(result.formattedPromptContext).toContain('### Bounded Source Code Slice');
    expect(result.formattedPromptContext).toContain('L2: const b = 2;');
  });
});
