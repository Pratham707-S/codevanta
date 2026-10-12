/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/storage/state-store.ts
 * Owner: Ayan
 * Purpose: Local state store: manage files and project session state inside .repoguard/state
 */

import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';

export interface ProjectState {
  version: string;
  lastRunId?: string;
  lastScanTimestamp?: string;
  baselineFindingsCount?: number;
  history: Array<{
    runId: string;
    timestamp: string;
    findingsCount: number;
    criticalCount?: number;
  }>;
}

export const INITIAL_STATE: ProjectState = {
  version: '1.0.0',
  history: [],
};

export interface StateStoreOptions {
  stateDir?: string;
  baseDir?: string;
  maxHistory?: number;
}

export class StateStore {
  private readonly stateDir: string;
  private readonly stateFilePath: string;
  private readonly maxHistory: number;

  constructor(
    stateDirOrOptions: string | StateStoreOptions = '.repoguard/state',
    baseDir: string = process.cwd(),
    maxHistory: number = 50
  ) {
    if (typeof stateDirOrOptions === 'object' && stateDirOrOptions !== null) {
      const options = stateDirOrOptions;
      const bDir = options.baseDir || process.cwd();
      const sDir = options.stateDir || '.repoguard/state';
      this.stateDir = resolve(bDir, sDir);
      this.maxHistory = options.maxHistory ?? 50;
    } else {
      this.stateDir = resolve(baseDir, stateDirOrOptions);
      this.maxHistory = maxHistory;
    }
    this.stateFilePath = join(this.stateDir, 'state.json');
  }

  public getStatePath(): string {
    return this.stateFilePath;
  }

  public async getHistory(): Promise<ProjectState['history']> {
    const state = await this.loadState();
    return state.history;
  }

  public async resetState(): Promise<void> {
    await this.clearState();
  }

  /**
   * Initializes the state directory if it does not already exist.
   */
  public async init(): Promise<void> {
    await fs.mkdir(this.stateDir, { recursive: true });
  }

  /**
   * Loads the current project state.
   * If missing, returns default state.
   * If corrupted, archives corrupted state safely and resets to default.
   */
  public async loadState(): Promise<ProjectState> {
    await this.init();
    try {
      const raw = await fs.readFile(this.stateFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('State file does not contain a JSON object');
      }
      return {
        ...INITIAL_STATE,
        ...parsed,
        history: Array.isArray(parsed.history) ? parsed.history : [],
      };
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { ...INITIAL_STATE };
      }

      // Handle corrupted data safely without throwing
      const backupPath = join(this.stateDir, `state.corrupted.${Date.now()}.json`);
      try {
        await fs.rename(this.stateFilePath, backupPath);
      } catch {
        // Ignore rename failure
      }
      return { ...INITIAL_STATE };
    }
  }

  /**
   * Persists project state to disk atomically.
   */
  public async saveState(state: ProjectState): Promise<void> {
    await this.init();
    const tempFile = join(this.stateDir, `state.tmp.${Date.now()}`);
    const data = JSON.stringify(state, null, 2);
    await fs.writeFile(tempFile, data, 'utf8');
    await fs.rename(tempFile, this.stateFilePath);
  }

  /**
   * Updates state with a newly completed run.
   */
  public async recordRun(
    runIdOrRecord: string | { runId: string; findingsCount?: number; findings?: unknown[]; summary?: { critical?: number } },
    findingsCount: number = 0,
    criticalCount: number = 0
  ): Promise<ProjectState> {
    const runId = typeof runIdOrRecord === 'string' ? runIdOrRecord : runIdOrRecord.runId;
    const fCount = typeof runIdOrRecord === 'string'
      ? findingsCount
      : (runIdOrRecord.findingsCount ?? runIdOrRecord.findings?.length ?? 0);
    const cCount = typeof runIdOrRecord === 'string'
      ? criticalCount
      : (runIdOrRecord.summary?.critical ?? 0);

    const state = await this.loadState();
    const timestamp = new Date().toISOString();
    state.lastRunId = runId;
    state.lastScanTimestamp = timestamp;
    state.history.unshift({
      runId,
      timestamp,
      findingsCount: fCount,
      criticalCount: cCount,
    });
    // Keep max recent run history entries
    if (state.history.length > this.maxHistory) {
      state.history = state.history.slice(0, this.maxHistory);
    }
    await this.saveState(state);
    return state;
  }

  /**
   * Clears state for testing or project reset.
   */
  public async clearState(): Promise<void> {
    try {
      await fs.unlink(this.stateFilePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }
}
