/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/integration/provider-contract.test.ts
 * Owner: Shared — Team Lead coordinates
 * Purpose: Integration test: AI provider contract compliance and schema validation
 */

import { describe, it, expect } from 'vitest';
import {
  IAIProvider,
  MockAdapter,
  GeminiAdapter,
  validateAIRepairPayload,
  extractJsonFromText,
} from '../../src/providers/index.js';
import { SanitizedPromptContext } from '../../src/context/index.js';

describe('Integration: Provider Contract & Schema Compliance', () => {
  const sampleContext: SanitizedPromptContext = {
    finding: {
      id: 'FINDING-CONTRACT-1',
      category: 'SEC-001',
      severity: 'CRITICAL',
      title: 'Secret Leak',
      path: 'src/config/app.ts',
      lineRange: { start: 10, end: 12 },
      explanation: 'Hardcoded credentials in config',
    },
    codeSlice: {
      filePath: 'src/config/app.ts',
      startLine: 1,
      endLine: 20,
      lines: [],
      rawSnippet: 'const token = "secret";',
      totalFileLines: 20,
    },
    formattedPromptContext: 'mock context',
    hasRedactedSecrets: false,
  };

  it('both MockAdapter and GeminiAdapter satisfy the IAIProvider contract', async () => {
    const mock: IAIProvider = new MockAdapter();
    const gemini: IAIProvider = new GeminiAdapter({ apiKey: 'dummy-key' });

    expect(typeof mock.name).toBe('string');
    expect(typeof mock.isAvailable).toBe('function');
    expect(typeof mock.generateInvestigation).toBe('function');
    expect(typeof mock.generateRepair).toBe('function');

    expect(typeof gemini.name).toBe('string');
    expect(typeof gemini.isAvailable).toBe('function');
    expect(typeof gemini.generateInvestigation).toBe('function');
    expect(typeof gemini.generateRepair).toBe('function');

    const repair = await mock.generateRepair(sampleContext);
    expect(repair.isValidDiff).toBe(true);
    expect(repair.isSafePath).toBe(true);
  });

  it('extractJsonFromText parses naked JSON, fenced JSON, and nested JSON safely', () => {
    const raw1 = '{"explanation": "valid", "diff": "test"}';
    expect(extractJsonFromText(raw1)).toEqual({ explanation: 'valid', diff: 'test' });

    const raw2 = 'Here is the response:\n```json\n{"key": "value"}\n```\nHope it helps!';
    expect(extractJsonFromText(raw2)).toEqual({ key: 'value' });

    const raw3 = 'Prefix info {"nested": {"a": 1}} trailing note';
    expect(extractJsonFromText(raw3)).toEqual({ nested: { a: 1 } });
  });

  it('validateAIRepairPayload rejects path traversal in diff or target path', () => {
    const badPayload = {
      explanation: 'Valid explanation here',
      rootCause: 'Valid root cause here',
      suggestedFixDescription: 'Valid description here',
      diff: [
        '--- a/../../escape.txt',
        '+++ b/../../escape.txt',
        '@@ -1,2 +1,2 @@',
        '-old',
        '+new',
      ].join('\n'),
      confidence: 0.9,
    };

    const result = validateAIRepairPayload(badPayload, '../../escape.txt');
    expect(result.valid).toBe(false);
    expect(result.isSafePath).toBe(false);
  });
});
