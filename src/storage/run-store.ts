/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/storage/run-store.ts
 * Owner: Ayan
 * Purpose: Storage: persist scan run metadata, findings, and execution records
 */

import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';

export interface StorageFinding {
  id: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  path: string;
  lineRange?: { start: number; end: number };
  explanation: string;
  evidence?: string;
  confidence?: number;
  status?: string;
}

export interface ScanRunRecord {
  runId: string;
  timestamp: string;
  projectName: string;
  repositoryRoot: string;
  filesScanned: number;
  findingsCount: number;
  findings: StorageFinding[];
  durationMs: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

export interface RunStoreOptions {
  runsDir?: string;
  stateDir?: string;
  baseDir?: string;
}

export class RunStore {
  private readonly runsDir: string;

  constructor(
    stateDirOrOptions: string | RunStoreOptions = '.repoguard/state',
    baseDir: string = process.cwd()
  ) {
    if (typeof stateDirOrOptions === 'object' && stateDirOrOptions !== null) {
      const options = stateDirOrOptions;
      const bDir = options.baseDir || process.cwd();
      if (options.runsDir) {
        this.runsDir = resolve(bDir, options.runsDir);
      } else {
        const sDir = options.stateDir || '.repoguard/state';
        this.runsDir = resolve(bDir, sDir, 'runs');
      }
    } else {
      this.runsDir = resolve(baseDir, stateDirOrOptions, 'runs');
    }
  }

  public getRunsDirectory(): string {
    return this.runsDir;
  }

  public async loadRun(runId: string): Promise<ScanRunRecord | null> {
    return this.getRun(runId);
  }

  public async init(): Promise<void> {
    await fs.mkdir(this.runsDir, { recursive: true });
  }

  /**
   * Generates a timestamped unique Run ID.
   */
  public generateRunId(): string {
    const now = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const suffix = Math.random().toString(36).substring(2, 7);
    return `run-${now}-${suffix}`;
  }

  /**
   * Saves a completed scan run record to disk atomically.
   */
  public async saveRun(record: ScanRunRecord): Promise<string> {
    await this.init();
    if (!/^[a-zA-Z0-9_-]+$/.test(record.runId)) {
      throw new Error(`Invalid run ID format: "${record.runId}"`);
    }
    const filePath = join(this.runsDir, `${record.runId}.json`);
    const tempPath = join(this.runsDir, `${record.runId}.tmp.${Date.now()}`);

    const serialized = JSON.stringify(record, null, 2);
    await fs.writeFile(tempPath, serialized, 'utf8');
    await fs.rename(tempPath, filePath);
    return filePath;
  }

  /**
   * Retrieves a specific run record by its run ID.
   */
  public async getRun(runId: string): Promise<ScanRunRecord | null> {
    await this.init();
    // Validate runId format to prevent directory traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(runId)) {
      throw new Error(`Invalid run ID format: "${runId}"`);
    }

    const filePath = join(this.runsDir, `${runId}.json`);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const record = JSON.parse(raw) as ScanRunRecord;
      return record;
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return null;
      }
      throw new Error(`Failed to read run record for "${runId}": ${err.message}`);
    }
  }

  /**
   * Lists all available scan run records sorted by descending timestamp.
   */
  public async listRuns(): Promise<Array<{ runId: string; timestamp: string; findingsCount: number }>> {
    await this.init();
    try {
      const files = await fs.readdir(this.runsDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json') && !f.includes('.corrupted.'));

      const results: Array<{ runId: string; timestamp: string; findingsCount: number }> = [];

      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(join(this.runsDir, file), 'utf8');
          const parsed = JSON.parse(content) as ScanRunRecord;
          if (parsed && parsed.runId && parsed.timestamp) {
            results.push({
              runId: parsed.runId,
              timestamp: parsed.timestamp,
              findingsCount: parsed.findingsCount ?? parsed.findings?.length ?? 0,
            });
          }
        } catch {
          // Skip unparseable run record
        }
      }

      return results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Retrieves the most recent scan run record.
   */
  public async getLatestRun(): Promise<ScanRunRecord | null> {
    const runs = await this.listRuns();
    if (runs.length === 0) {
      return null;
    }
    const latest = runs[0];
    if (!latest) return null;
    return this.getRun(latest.runId);
  }
}
