import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RunStore, ScanRunRecord, StateStore } from '../../../src/storage/index.js';

describe('Intelligence Storage Contract & Persistence', () => {
  let tempDir: string;
  let runStore: RunStore;
  let stateStore: StateStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'repoguard-intel-storage-'));
    runStore = new RunStore(join(tempDir, 'state'));
    stateStore = new StateStore(join(tempDir, 'state'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('persists and round-trips full intelligence findings and timeline metadata', async () => {
    const runId = runStore.generateRunId();
    const record: ScanRunRecord = {
      runId,
      projectName: 'cyber-vault',
      timestamp: new Date().toISOString(),
      durationMs: 410,
      repositoryRoot: tempDir,
      filesScanned: 15,
      findingsCount: 1,
      summary: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
      findings: [
        {
          id: 'SEC-001-src-vault.ts-L10',
          ruleId: 'SEC-001',
          cwe: 'CWE-798',
          category: 'Security / Hardcoded Secrets',
          severity: 'CRITICAL',
          title: 'Hardcoded Secret In Vault Configuration',
          path: 'src/vault.ts',
          lineRange: { start: 10, end: 10 },
          explanation: 'Secret credential detected in source.',
          evidence: 'const secret = "ghp_123456789012345678901234567890123456";',
          confidence: 0.99,
          status: 'UNRESOLVED',
          source: 'static-ast',
          agentName: 'SecurityReviewAgent',
          blame: {
            commitSha: '9876543210abcdef9876543210abcdef98765432',
            author: 'Jane Doe',
            date: '2026-10-20T10:00:00Z',
            line: 10,
            summary: 'Initial vault secret setup',
          },
          recommendation: 'Move credentials to secrets manager.',
          patch: '--- a/src/vault.ts\n+++ b/src/vault.ts\n@@ -10,1 +10,1 @@\n-const secret = "ghp_123456789012345678901234567890123456";\n+const secret = process.env.VAULT_SECRET;\n',
          verification: {
            verified: true,
            command: 'npm test',
            exitCode: 0,
            durationMs: 500,
            summary: 'Passed all unit checks.',
          },
          tags: ['security', 'cwe-798', 'automated-repair'],
          fingerprint: 'fp-vault-001',
        },
      ],
      timeline: [
        {
          timestamp: '2026-10-24T10:00:00.000Z',
          step: 'Initial Ingestion',
          status: 'SUCCESS',
          detail: 'Ingested 15 files safely',
          durationMs: 25,
        },
      ],
      metadata: {
        engineVersion: '0.1.3',
        environment: 'ci-runner',
      },
    };

    const filePath = await runStore.saveRun(record);
    expect(filePath).toContain(`${runId}.json`);

    const loaded = await runStore.getRun(runId);
    expect(loaded).not.toBeNull();
    expect(loaded!.runId).toBe(runId);
    expect(loaded!.findings).toHaveLength(1);

    const f = loaded!.findings[0]!;
    expect(f.cwe).toBe('CWE-798');
    expect(f.ruleId).toBe('SEC-001');
    expect(f.agentName).toBe('SecurityReviewAgent');
    expect(f.blame?.author).toBe('Jane Doe');
    expect(f.blame?.commitSha).toBe('9876543210abcdef9876543210abcdef98765432');
    expect(f.verification?.verified).toBe(true);
    expect(f.patch).toContain('process.env.VAULT_SECRET');
    expect(f.fingerprint).toBe('fp-vault-001');
    expect(f.tags).toEqual(['security', 'cwe-798', 'automated-repair']);

    expect(loaded!.timeline).toHaveLength(1);
    expect(loaded!.timeline![0]!.step).toBe('Initial Ingestion');
    expect(loaded!.metadata?.['engineVersion']).toBe('0.1.3');
  });

  it('StateStore records run summary without corrupting state history', async () => {
    const runId = runStore.generateRunId();
    const record: ScanRunRecord = {
      runId,
      projectName: 'test-app',
      timestamp: new Date().toISOString(),
      durationMs: 50,
      repositoryRoot: tempDir,
      filesScanned: 2,
      findingsCount: 0,
      summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      findings: [],
    };

    await stateStore.recordRun(record);
    const history = await stateStore.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.runId).toBe(runId);
  });
});
