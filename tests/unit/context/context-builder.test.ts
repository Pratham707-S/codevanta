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

  describe('Multiline Secret Redaction Hardening (Phase 3 Step 7)', () => {
    it('fully redacts a multiline PEM private key block so secret body is completely absent from context and prompt', async () => {
      const secretBodyChunk1 = 'MIIEowIBAAKCAQEA0YFAKEKEYCHUNK111111111111111111';
      const secretBodyChunk2 = 'wJalrXUtnFEMIK7MDENGbPxRfiCYFAKEKEYCHUNK22222222';
      const secretBodyChunk3 = '7xYzAbCdEfGhIjKlMnOpQrStUvWxYz0123456789FAKEKEY3';

      const fileWithPem = [
        'import crypto from "crypto";',
        '// Service authentication setup',
        'const privateKeyPem = `-----BEGIN RSA PRIVATE KEY-----',
        secretBodyChunk1,
        secretBodyChunk2,
        secretBodyChunk3,
        '-----END RSA PRIVATE KEY-----`;',
        'export function signPayload(data: string) {',
        '  return crypto.sign("sha256", Buffer.from(data), privateKeyPem);',
        '}',
      ].join('\n');

      const relativePath = 'src/auth/signer.ts';
      await fs.mkdir(join(tempDir, 'src/auth'), { recursive: true });
      await fs.writeFile(join(tempDir, relativePath), fileWithPem, 'utf-8');

      const finding: StorageFinding = {
        id: 'FINDING-PEM-001',
        category: 'SEC-001',
        severity: 'CRITICAL',
        title: 'Hardcoded RSA Private Key',
        path: relativePath,
        lineRange: { start: 3, end: 7 },
        explanation: 'Plaintext PEM RSA private key found committed in signer.ts',
        evidence: `const privateKeyPem = \`-----BEGIN RSA PRIVATE KEY-----\n${secretBodyChunk1}\n...`,
      };

      const result = await buildSanitizedContext(finding, tempDir, { contextLines: 5 });

      expect(result.hasRedactedSecrets).toBe(true);

      // Verify the secret body is COMPLETELY ABSENT from all context outputs
      expect(result.codeSlice.rawSnippet).not.toContain(secretBodyChunk1);
      expect(result.codeSlice.rawSnippet).not.toContain(secretBodyChunk2);
      expect(result.codeSlice.rawSnippet).not.toContain(secretBodyChunk3);
      expect(result.formattedPromptContext).not.toContain(secretBodyChunk1);
      expect(result.formattedPromptContext).not.toContain(secretBodyChunk2);
      expect(result.formattedPromptContext).not.toContain(secretBodyChunk3);
      expect(result.finding.evidence).not.toContain(secretBodyChunk1);

      // Verify placeholder marker is present
      expect(result.codeSlice.rawSnippet).toContain(REDACTION_MARKERS.PRIVATE_KEY);
      expect(result.formattedPromptContext).toContain(REDACTION_MARKERS.PRIVATE_KEY);

      // Verify non-secret code context is preserved
      expect(result.codeSlice.rawSnippet).toContain('import crypto from "crypto";');
      expect(result.codeSlice.rawSnippet).toContain('export function signPayload(data: string)');
      expect(result.formattedPromptContext).toContain('export function signPayload(data: string)');

      // Verify line count and line coordinates are preserved
      expect(result.codeSlice.lines.length).toBe(10);
      expect(result.codeSlice.lines[0]?.lineNumber).toBe(1);
      expect(result.codeSlice.lines[9]?.lineNumber).toBe(10);
    });

    it('safely handles multiple secret blocks (AWS key, multiline EC key, GitHub PAT) in one file', async () => {
      const ecSecret1 = 'MHcCAQEEIPFAKEECPRIVATEKEYDATA11111111111111111111';
      const ecSecret2 = 'AoGCCqGSM49AwEHoUQDQgAEFAKEPUBLICKEYDATA2222222222';
      const fakeAwsKey = 'AKIAIOSFODNN7FAKEKEY';
      const fakeGithubPat = 'github_pat_11FAKEPAT_TOKEN_SECRET_DATA_XYZ_9876543210';

      const multiSecretFile = [
        '// Cloud integration config',
        `const awsKey = "${fakeAwsKey}";`,
        'function getClient() {',
        '  return new S3Client({ key: awsKey });',
        '}',
        'const ecKey = `-----BEGIN EC PRIVATE KEY-----',
        ecSecret1,
        ecSecret2,
        '-----END EC PRIVATE KEY-----`;',
        'function getDeployToken() {',
        `  const pat = "${fakeGithubPat}";`,
        '  return pat;',
        '}',
      ].join('\n');

      const relativePath = 'src/config/multi.ts';
      await fs.mkdir(join(tempDir, 'src/config'), { recursive: true });
      await fs.writeFile(join(tempDir, relativePath), multiSecretFile, 'utf-8');

      const finding: StorageFinding = {
        id: 'FINDING-MULTI-001',
        category: 'SEC-001',
        severity: 'CRITICAL',
        title: 'Multiple secrets in configuration',
        path: relativePath,
        lineRange: { start: 2, end: 12 },
        explanation: 'Multiple credentials committed to source code',
      };

      const result = await buildSanitizedContext(finding, tempDir);

      expect(result.hasRedactedSecrets).toBe(true);

      // Verify none of the secret bodies exist in prompt or snippet
      expect(result.codeSlice.rawSnippet).not.toContain(fakeAwsKey);
      expect(result.codeSlice.rawSnippet).not.toContain(ecSecret1);
      expect(result.codeSlice.rawSnippet).not.toContain(ecSecret2);
      expect(result.codeSlice.rawSnippet).not.toContain(fakeGithubPat);

      expect(result.formattedPromptContext).not.toContain(fakeAwsKey);
      expect(result.formattedPromptContext).not.toContain(ecSecret1);
      expect(result.formattedPromptContext).not.toContain(ecSecret2);
      expect(result.formattedPromptContext).not.toContain(fakeGithubPat);

      // Verify all redaction markers appear
      expect(result.formattedPromptContext).toContain('AKIA****************');
      expect(result.formattedPromptContext).toContain(REDACTION_MARKERS.PRIVATE_KEY);
      expect(result.formattedPromptContext).toContain('github_pat_********************');

      // Verify non-secret code remains intact
      expect(result.formattedPromptContext).toContain('function getClient()');
      expect(result.formattedPromptContext).toContain('function getDeployToken()');
    });

    it('redacts multiline private key even when bounded slice window cuts into the middle of the key', async () => {
      const middleSecret = 'SECRET_MIDDLE_CHUNK_999999999999999999999999999';

      // 40 line file: lines 5-15 is PEM key, finding is line 10 with contextLines: 2 (window lines 8-12)
      const fileLines: string[] = [];
      for (let i = 1; i <= 4; i++) fileLines.push(`// Normal line ${i}`);
      fileLines.push('const pem = `-----BEGIN PRIVATE KEY-----');
      for (let i = 6; i <= 14; i++) {
        fileLines.push(i === 10 ? middleSecret : `BASE64_LINE_${i}_SECRET_DATA_PADDING_AAAAAA`);
      }
      fileLines.push('-----END PRIVATE KEY-----`;');
      for (let i = 16; i <= 40; i++) fileLines.push(`// Normal line ${i}`);

      const relativePath = 'src/nested/key.ts';
      await fs.mkdir(join(tempDir, 'src/nested'), { recursive: true });
      await fs.writeFile(join(tempDir, relativePath), fileLines.join('\n'), 'utf-8');

      const finding: StorageFinding = {
        id: 'FINDING-MIDDLE-001',
        category: 'SEC-001',
        severity: 'CRITICAL',
        title: 'Exposed secret inside private key',
        path: relativePath,
        lineRange: { start: 10, end: 10 },
        explanation: 'Exposed secret inside multiline private key body',
      };

      const result = await buildSanitizedContext(finding, tempDir, { contextLines: 2 });

      // Slice covers lines 8 to 12 (all inside the key body!)
      expect(result.codeSlice.startLine).toBe(8);
      expect(result.codeSlice.endLine).toBe(12);

      // Ensure secret body is absent even though slice doesn't contain BEGIN or END tags
      expect(result.codeSlice.rawSnippet).not.toContain(middleSecret);
      expect(result.codeSlice.rawSnippet).not.toContain('BASE64_LINE_8_SECRET_DATA');
      expect(result.formattedPromptContext).not.toContain(middleSecret);

      for (const line of result.codeSlice.lines) {
        expect(line.content).toBe(REDACTION_MARKERS.PRIVATE_KEY);
      }
    });
  });
});
