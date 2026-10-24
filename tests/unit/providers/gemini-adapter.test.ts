/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/providers/gemini-adapter.test.ts
 * Owner: Team Lead
 * Purpose: Unit tests for GeminiAdapter (error handling, schemas, diff validation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiAdapter } from '../../../src/providers/gemini-adapter.js';
import {
  ProviderConfigurationError,
  ProviderExecutionError,
  ProviderValidationError,
} from '../../../src/providers/provider.contract.js';
import { SanitizedPromptContext } from '../../../src/context/context-builder.js';

function createMockContext(path: string = 'src/service.ts'): SanitizedPromptContext {
  return {
    finding: {
      id: 'FINDING-GEMINI-1',
      category: 'SEC-001',
      severity: 'CRITICAL',
      title: 'Hardcoded secret',
      path,
      lineRange: { start: 5, end: 5 },
      explanation: 'Exposed secret key',
    },
    codeSlice: {
      filePath: path,
      startLine: 1,
      endLine: 10,
      lines: [],
      rawSnippet: 'const key = "secret";',
      totalFileLines: 10,
    },
    formattedPromptContext: 'prompt formatted',
    hasRedactedSecrets: false,
  };
}

describe('Providers: GeminiAdapter', () => {
  const originalFetch = globalThis.fetch;
  const originalEnvKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnvKey) {
      process.env.GEMINI_API_KEY = originalEnvKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    vi.restoreAllMocks();
  });

  describe('Configuration & Availability', () => {
    it('reports unavailable when no API key is provided', async () => {
      const adapter = new GeminiAdapter();
      expect(await adapter.isAvailable()).toBe(false);
    });

    it('reports available when valid API key is configured', async () => {
      const adapter = new GeminiAdapter({ apiKey: 'test-fake-key-12345' });
      expect(await adapter.isAvailable()).toBe(true);
    });

    it('throws ProviderConfigurationError when generateRepair is invoked without API key', async () => {
      const adapter = new GeminiAdapter();
      const ctx = createMockContext();
      await expect(adapter.generateRepair(ctx)).rejects.toThrow(ProviderConfigurationError);
    });
  });

  describe('API & Network Error Handling', () => {
    it('throws ProviderConfigurationError on HTTP 401 Unauthorized', async () => {
      const adapter = new GeminiAdapter({ apiKey: 'invalid-key' });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'API_KEY_INVALID',
      } as Response);

      const ctx = createMockContext();
      await expect(adapter.generateRepair(ctx)).rejects.toThrow(ProviderConfigurationError);
    });

    it('throws ProviderExecutionError on HTTP 500 server error', async () => {
      const adapter = new GeminiAdapter({ apiKey: 'test-key' });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as Response);

      const ctx = createMockContext();
      await expect(adapter.generateRepair(ctx)).rejects.toThrow(ProviderExecutionError);
    });

    it('throws ProviderExecutionError on fetch network rejection', async () => {
      const adapter = new GeminiAdapter({ apiKey: 'test-key' });
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection timed out'));

      const ctx = createMockContext();
      await expect(adapter.generateRepair(ctx)).rejects.toThrow(ProviderExecutionError);
    });
  });

  describe('Response Schema & Patch Validation', () => {
    it('throws ProviderValidationError when model returns non-JSON text', async () => {
      const adapter = new GeminiAdapter({ apiKey: 'test-key' });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Here is some freeform text without any json.' }],
              },
            },
          ],
        }),
      } as Response);

      const ctx = createMockContext();
      await expect(adapter.generateRepair(ctx)).rejects.toThrow(ProviderValidationError);
    });

    it('throws ProviderValidationError when diff is malformed', async () => {
      const adapter = new GeminiAdapter({ apiKey: 'test-key' });
      const malformedDiffResponse = {
        explanation: 'Fixing the bug',
        rootCause: 'Defective logic',
        suggestedFixDescription: 'Updated code',
        diff: 'NOT A VALID UNIFIED DIFF STRING',
        confidence: 0.9,
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(malformedDiffResponse) }],
              },
            },
          ],
        }),
      } as Response);

      const ctx = createMockContext('src/app.ts');
      await expect(adapter.generateRepair(ctx)).rejects.toThrow(ProviderValidationError);
    });

    it('successfully extracts JSON and validates clean repair output', async () => {
      const adapter = new GeminiAdapter({ apiKey: 'test-key' });
      const targetPath = 'src/security.ts';
      const validDiff = [
        `--- a/${targetPath}`,
        `+++ b/${targetPath}`,
        `@@ -5,3 +5,3 @@`,
        ` // Surrounding context line`,
        `-const secret = "raw_hardcoded_key";`,
        `+const secret = process.env.API_KEY || '';`,
        ` export default secret;`,
      ].join('\n');

      const geminiJson = {
        explanation: 'Extracted secret into environment variable',
        rootCause: 'Plaintext secret stored in source file',
        suggestedFixDescription: 'Use process.env instead of hardcoded string',
        diff: validDiff,
        confidence: 0.95,
      };

      // Wrap in markdown code fence as Gemini often outputs
      const rawOutput = `Here is the requested patch:\n\`\`\`json\n${JSON.stringify(geminiJson)}\n\`\`\``;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: rawOutput }],
              },
            },
          ],
        }),
      } as Response);

      const ctx = createMockContext(targetPath);
      const result = await adapter.generateRepair(ctx);

      expect(result.provider).toBe('gemini');
      expect(result.targetFilePath).toBe(targetPath);
      expect(result.isValidDiff).toBe(true);
      expect(result.isSafePath).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(result.diff).toContain('process.env.API_KEY');
    });
  });
});
