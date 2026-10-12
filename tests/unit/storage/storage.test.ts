/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/storage/storage.test.ts
 * Owner: Ayan
 * Purpose: Unit tests for state persistence and run storage engines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  StateStore,
  RunStore,
  ScanRunRecord,
} from '../../../src/storage/index.js';

describe('Storage Engine — StateStore & RunStore', () => {
  let tempDir: string;
  let stateStore: StateStore;
  let runStore: RunStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'repoguard-storage-test-'));
    stateStore = new StateStore({ baseDir: tempDir });
    runStore = new RunStore({ baseDir: tempDir });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('StateStore', () => {
    it('initializes storage directories and default state on fresh repo', async () => {
      const state = await stateStore.loadState();
      expect(state.version).toBe('1.0.0');
      expect(state.history).toEqual([]);

      // Verify directory was created
      const stat = await fs.stat(tempDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('saves state atomically and retrieves accurately', async () => {
      const initialState = await stateStore.loadState();
      initialState.lastRunId = 'run_abc_123';
      initialState.baselineFindingsCount = 4;

      await stateStore.saveState(initialState);
      const retrieved = await stateStore.loadState();

      expect(retrieved.lastRunId).toBe('run_abc_123');
      expect(retrieved.baselineFindingsCount).toBe(4);
    });

    it('recovers cleanly from corrupted JSON state by archiving corrupted file', async () => {
      await stateStore.init();
      const stateFilePath = join(tempDir, '.repoguard/state', 'state.json');
      await fs.mkdir(join(tempDir, '.repoguard/state'), { recursive: true });
      await fs.writeFile(stateFilePath, '{ malformed: json !@#$', 'utf-8');

      // Loading should not throw, but recover with default state
      const recovered = await stateStore.loadState();
      expect(recovered.version).toBe('1.0.0');
      expect(recovered.history).toEqual([]);

      // Verify that corrupted file was archived
      const files = await fs.readdir(join(tempDir, '.repoguard/state'));
      const corruptedArchive = files.find((f) => f.startsWith('state.corrupted.'));
      expect(corruptedArchive).toBeDefined();
    });

    it('records run history and trims beyond maxHistory limit', async () => {
      const smallHistoryStore = new StateStore({ baseDir: tempDir, maxHistory: 3 });

      for (let i = 1; i <= 5; i++) {
        const mockRun: ScanRunRecord = {
          runId: `run_${i}`,
          projectName: 'test-proj',
          timestamp: new Date().toISOString(),
          durationMs: 100 * i,
          repositoryRoot: '/test',
          filesScanned: 10,
          findingsCount: i,
          summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          findings: [],
        };
        await smallHistoryStore.recordRun(mockRun);
      }

      const history = await smallHistoryStore.getHistory();
      expect(history.length).toBe(3);
      // Newest should be first
      expect(history[0]?.runId).toBe('run_5');
      expect(history[1]?.runId).toBe('run_4');
      expect(history[2]?.runId).toBe('run_3');
    });

    it('clears state cleanly with resetState', async () => {
      const state = await stateStore.loadState();
      state.lastRunId = 'to-be-cleared';
      await stateStore.saveState(state);

      await stateStore.resetState();
      const fresh = await stateStore.loadState();
      expect(fresh.lastRunId).toBeUndefined();
    });
  });

  describe('RunStore', () => {
    it('generates unique run IDs with repoguard prefix', () => {
      const id1 = runStore.generateRunId();
      const id2 = runStore.generateRunId();

      expect(id1).toMatch(/^run-[0-9]+-[a-z0-9]+$/);
      expect(id2).toMatch(/^run-[0-9]+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('saves and loads a complete ScanRunRecord', async () => {
      const runId = runStore.generateRunId();
      const record: ScanRunRecord = {
        runId,
        projectName: 'demo-app',
        timestamp: new Date().toISOString(),
        durationMs: 420,
        repositoryRoot: '/path/to/demo',
        filesScanned: 15,
        findingsCount: 1,
        summary: { critical: 1, high: 0, medium: 1, low: 0, info: 0 },
        findings: [
          {
            id: 'F-001',
            title: 'Hardcoded Secret',
            severity: 'CRITICAL',
            category: 'SECURITY',
            path: 'src/auth.ts',
            lineRange: { start: 10, end: 12 },
            explanation: 'Private API key detected in source code',
            evidence: 'const KEY = "sk_live_12345"',
            confidence: 0.99,
          },
        ],
      };

      const savedPath = await runStore.saveRun(record);
      expect(savedPath).toContain(`${runId}.json`);

      const loaded = await runStore.loadRun(runId);
      expect(loaded).toBeDefined();
      expect(loaded?.runId).toBe(runId);
      expect(loaded?.projectName).toBe('demo-app');
      expect(loaded?.findings.length).toBe(1);
      expect(loaded?.findings[0]?.id).toBe('F-001');
    });

    it('returns null when loading a non-existent runId', async () => {
      const result = await runStore.loadRun('non-existent-id');
      expect(result).toBeNull();
    });

    it('blocks path traversal attacks on runId when loading or saving', async () => {
      const maliciousId = '../../../etc/passwd';

      await expect(runStore.loadRun(maliciousId)).rejects.toThrow(/Invalid run ID/);

      const maliciousRecord: ScanRunRecord = {
        runId: maliciousId,
        projectName: 'exploit',
        timestamp: new Date().toISOString(),
        durationMs: 1,
        repositoryRoot: '/test',
        filesScanned: 0,
        findingsCount: 0,
        summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        findings: [],
      };

      await expect(runStore.saveRun(maliciousRecord)).rejects.toThrow();
    });

    it('lists stored runs sorted by timestamp descending', async () => {
      const run1: ScanRunRecord = {
        runId: 'run-20260101-aaa',
        projectName: 'app',
        timestamp: '2026-01-01T10:00:00.000Z',
        durationMs: 100,
        repositoryRoot: '/app',
        filesScanned: 5,
        findingsCount: 0,
        summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        findings: [],
      };

      const run2: ScanRunRecord = {
        runId: 'run-20260102-bbb',
        projectName: 'app',
        timestamp: '2026-01-02T12:00:00.000Z',
        durationMs: 200,
        repositoryRoot: '/app',
        filesScanned: 8,
        findingsCount: 1,
        summary: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
        findings: [],
      };

      await runStore.saveRun(run1);
      await runStore.saveRun(run2);

      const runs = await runStore.listRuns();
      expect(runs.length).toBe(2);
      expect(runs[0]?.runId).toBe('run-20260102-bbb'); // newer first
      expect(runs[1]?.runId).toBe('run-20260101-aaa');
    });
  });
});
