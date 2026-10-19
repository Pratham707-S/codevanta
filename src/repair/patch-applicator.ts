/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/repair/patch-applicator.ts
 * Owner: Pratham
 * Purpose: Patch applicator: safely apply approved patches to target workspace
 */

import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import {
  parseUnifiedDiff,
  validateSafePath,
  type ParsedPatchFile,
  type DiffHunk,
} from './patch-parser.js';

export interface FilePatchResult {
  filePath: string;
  success: boolean;
  backupCreated: boolean;
  rolledBack: boolean;
  error?: string;
  hunksApplied: number;
  totalHunks: number;
  isNewFile?: boolean;
  isDeletedFile?: boolean;
}

export interface PatchApplicationResult {
  success: boolean;
  appliedFiles: FilePatchResult[];
  errors: string[];
  timestamp: string;
}

export interface PatchApplicatorOptions {
  repoRoot?: string;
  dryRun?: boolean;
  strict?: boolean;
  searchWindow?: number;
}

interface FileBackup {
  path: string;
  exists: boolean;
  content?: string;
}

/**
 * Applies hunks of a single file to string content and returns the updated content.
 */
export function applyHunksToString(
  originalContent: string,
  hunks: DiffHunk[],
  options: { strict?: boolean; searchWindow?: number } = {}
): { updatedContent: string; hunksApplied: number } {
  if (hunks.length === 0) {
    return { updatedContent: originalContent, hunksApplied: 0 };
  }

  const isCRLF = originalContent.includes('\r\n');
  const lineEnding = isCRLF ? '\r\n' : '\n';
  const lines = originalContent === '' ? [] : originalContent.split(/\r?\n/);

  let cumulativeOffset = 0;
  let hunksApplied = 0;
  const searchWindow = options.searchWindow ?? 30;

  for (const hunk of hunks) {
    const oldLinesExpected: string[] = [];
    const newLinesReplacement: string[] = [];

    for (const line of hunk.lines) {
      if (line.type === 'context' || line.type === 'deletion') {
        oldLinesExpected.push(line.content);
      }
      if (line.type === 'context' || line.type === 'addition') {
        newLinesReplacement.push(line.content);
      }
    }

    // Determine target index
    const baseTargetIndex = Math.max(0, hunk.header.oldStart - 1 + cumulativeOffset);
    let matchedIndex = -1;

    // 1. Try exact target index
    const checkMatch = (idx: number): boolean => {
      if (idx < 0 || idx + oldLinesExpected.length > lines.length) return false;
      for (let j = 0; j < oldLinesExpected.length; j++) {
        if (lines[idx + j] !== oldLinesExpected[j]) {
          return false;
        }
      }
      return true;
    };

    if (checkMatch(baseTargetIndex)) {
      matchedIndex = baseTargetIndex;
    } else {
      // 2. Window search around base index if not strict
      for (let offset = 1; offset <= searchWindow; offset++) {
        if (checkMatch(baseTargetIndex + offset)) {
          matchedIndex = baseTargetIndex + offset;
          break;
        }
        if (checkMatch(baseTargetIndex - offset)) {
          matchedIndex = baseTargetIndex - offset;
          break;
        }
      }
    }

    if (matchedIndex === -1) {
      throw new Error(
        `Failed to locate matching context for hunk ${hunk.rawHeader} near line ${hunk.header.oldStart}.`
      );
    }

    // Splice replacement lines
    lines.splice(matchedIndex, oldLinesExpected.length, ...newLinesReplacement);
    cumulativeOffset += newLinesReplacement.length - oldLinesExpected.length;
    hunksApplied++;
  }

  return {
    updatedContent: lines.join(lineEnding),
    hunksApplied,
  };
}

/**
 * PatchApplicator class handles applying parsed diff files with atomic rollback safety.
 */
export class PatchApplicator {
  private readonly defaultOptions: PatchApplicatorOptions;

  constructor(defaultOptions: PatchApplicatorOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  /**
   * Applies unified diff text across files with atomic transaction safety.
   * If any file fails, previously modified files in this run are rolled back automatically.
   */
  public async applyPatch(
    diffText: string,
    options: PatchApplicatorOptions = {}
  ): Promise<PatchApplicationResult> {
    const opts: PatchApplicatorOptions = { ...this.defaultOptions, ...options };
    const repoRoot = opts.repoRoot ? resolve(opts.repoRoot) : process.cwd();
    const timestamp = new Date().toISOString();

    const parsedFiles = parseUnifiedDiff(diffText, { repoRoot });
    if (parsedFiles.length === 0) {
      return {
        success: false,
        appliedFiles: [],
        errors: ['No valid diff files found to apply.'],
        timestamp,
      };
    }

    const appliedFiles: FilePatchResult[] = [];
    const backups: FileBackup[] = [];
    const errors: string[] = [];

    let overallSuccess = true;

    try {
      for (const file of parsedFiles) {
        const fileResult = await this.applySingleFile(file, repoRoot, opts, backups);
        appliedFiles.push(fileResult);

        if (!fileResult.success) {
          overallSuccess = false;
          errors.push(fileResult.error || `Failed to apply patch to ${fileResult.filePath}`);
          break; // Stop and trigger rollback
        }
      }
    } catch (err: unknown) {
      overallSuccess = false;
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
    }

    // Rollback if any file failed and dryRun was false
    if (!overallSuccess && !opts.dryRun) {
      await this.rollback(backups);
      for (const res of appliedFiles) {
        if (res.backupCreated) {
          res.rolledBack = true;
        }
      }
    }

    return {
      success: overallSuccess,
      appliedFiles,
      errors,
      timestamp,
    };
  }

  /**
   * Applies changes to a single file.
   */
  private async applySingleFile(
    file: ParsedPatchFile,
    repoRoot: string,
    opts: PatchApplicatorOptions,
    backups: FileBackup[]
  ): Promise<FilePatchResult> {
    const targetRelPath = file.isDeletedFile
      ? file.oldPath
      : file.newPath && file.newPath !== '/dev/null'
        ? file.newPath
        : file.oldPath;
    const pathValidation = validateSafePath(targetRelPath, repoRoot);

    if (!pathValidation.safe) {
      return {
        filePath: targetRelPath,
        success: false,
        backupCreated: false,
        rolledBack: false,
        error: `Unsafe path rejected: ${pathValidation.error}`,
        hunksApplied: 0,
        totalHunks: file.hunks.length,
      };
    }

    const targetAbsPath = resolve(repoRoot, pathValidation.normalizedPath || targetRelPath);

    try {
      // 1. Creation of new file
      if (file.isNewFile) {
        let newContent = '';
        const lines: string[] = [];
        for (const hunk of file.hunks) {
          for (const l of hunk.lines) {
            if (l.type === 'addition') {
              lines.push(l.content);
            }
          }
        }
        newContent = lines.join('\n');

        backups.push({ path: targetAbsPath, exists: false });

        if (!opts.dryRun) {
          await mkdir(dirname(targetAbsPath), { recursive: true });
          await writeFile(targetAbsPath, newContent, 'utf8');
        }

        return {
          filePath: targetRelPath,
          success: true,
          backupCreated: true,
          rolledBack: false,
          hunksApplied: file.hunks.length,
          totalHunks: file.hunks.length,
          isNewFile: true,
        };
      }

      // 2. Deletion of existing file
      if (file.isDeletedFile) {
        let content = '';
        try {
          content = await readFile(targetAbsPath, 'utf8');
        } catch {
          // File does not exist
          return {
            filePath: targetRelPath,
            success: false,
            backupCreated: false,
            rolledBack: false,
            error: `Target file to delete does not exist: ${targetRelPath}`,
            hunksApplied: 0,
            totalHunks: file.hunks.length,
            isDeletedFile: true,
          };
        }

        backups.push({ path: targetAbsPath, exists: true, content });

        if (!opts.dryRun) {
          await unlink(targetAbsPath);
        }

        return {
          filePath: targetRelPath,
          success: true,
          backupCreated: true,
          rolledBack: false,
          hunksApplied: file.hunks.length,
          totalHunks: file.hunks.length,
          isDeletedFile: true,
        };
      }

      // 3. Modification of existing file
      let originalContent = '';
      try {
        originalContent = await readFile(targetAbsPath, 'utf8');
      } catch (err: unknown) {
        return {
          filePath: targetRelPath,
          success: false,
          backupCreated: false,
          rolledBack: false,
          error: `Could not read target file "${targetRelPath}": ${err instanceof Error ? err.message : String(err)}`,
          hunksApplied: 0,
          totalHunks: file.hunks.length,
        };
      }

      backups.push({ path: targetAbsPath, exists: true, content: originalContent });

      const { updatedContent, hunksApplied } = applyHunksToString(originalContent, file.hunks, {
        strict: opts.strict,
        searchWindow: opts.searchWindow,
      });

      if (!opts.dryRun) {
        await writeFile(targetAbsPath, updatedContent, 'utf8');
      }

      return {
        filePath: targetRelPath,
        success: true,
        backupCreated: true,
        rolledBack: false,
        hunksApplied,
        totalHunks: file.hunks.length,
      };
    } catch (err: unknown) {
      return {
        filePath: targetRelPath,
        success: false,
        backupCreated: backups.some((b) => b.path === targetAbsPath),
        rolledBack: false,
        error: err instanceof Error ? err.message : String(err),
        hunksApplied: 0,
        totalHunks: file.hunks.length,
      };
    }
  }

  /**
   * Rolls back all modified/created files to their state prior to the failed patch application.
   */
  private async rollback(backups: FileBackup[]): Promise<void> {
    for (let i = backups.length - 1; i >= 0; i--) {
      const backup = backups[i]!;
      try {
        if (!backup.exists) {
          // File was newly created; remove it
          await unlink(backup.path).catch(() => {});
        } else if (backup.content !== undefined) {
          // File was modified or deleted; restore original content
          await mkdir(dirname(backup.path), { recursive: true });
          await writeFile(backup.path, backup.content, 'utf8');
        }
      } catch {
        // Rollback best-effort
      }
    }
  }
}

/**
 * Standalone convenience helper to apply a patch.
 */
export async function applyPatch(
  diffText: string,
  options?: PatchApplicatorOptions
): Promise<PatchApplicationResult> {
  const applicator = new PatchApplicator();
  return applicator.applyPatch(diffText, options);
}

