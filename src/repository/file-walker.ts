/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/repository/file-walker.ts
 * Owner: Manni
 * Purpose: File traversal: safe directory walk respecting ignores, limits, binary skips
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface SourceFileEntry {
  filePath: string;
  relativePath: string;
  content: string;
  sizeBytes: number;
}

export interface FileWalkOptions {
  maxFileSize?: number;
  excludeDirs?: string[];
  binaryExtensions?: string[];
}

export interface FileWalkResult {
  files: SourceFileEntry[];
  unreadableFiles: Array<{ path: string; error: string }>;
  skippedCount: number;
}

const DEFAULT_EXCLUDE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.repoguard',
  '.tempmediaStorage',
  '.user_uploaded',
  'coverage',
  '.turbo',
  '.next',
]);

const DEFAULT_BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.svg',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.bz2',
  '.7z',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.wasm',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.bin',
  '.iso',
  '.dmg',
  '.lockb',
]);

const DEFAULT_MAX_FILE_SIZE = 1024 * 1024; // 1 MB

export async function walkSourceFiles(
  rootDir: string,
  options: FileWalkOptions = {}
): Promise<FileWalkResult> {
  const root = path.resolve(rootDir);
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const excludeDirs = options.excludeDirs
    ? new Set(options.excludeDirs)
    : DEFAULT_EXCLUDE_DIRS;
  const binaryExtensions = options.binaryExtensions
    ? new Set(options.binaryExtensions)
    : DEFAULT_BINARY_EXTENSIONS;

  const files: SourceFileEntry[] = [];
  const unreadableFiles: Array<{ path: string; error: string }> = [];
  let skippedCount = 0;

  async function traverse(currentDir: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (err) {
      unreadableFiles.push({
        path: currentDir,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (excludeDirs.has(entry.name)) {
          skippedCount++;
          continue;
        }
        await traverse(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (binaryExtensions.has(ext)) {
          skippedCount++;
          continue;
        }

        try {
          const stats = await fs.stat(fullPath);
          if (stats.size > maxFileSize) {
            skippedCount++;
            continue;
          }

          const content = await fs.readFile(fullPath, 'utf8');
          // Binary content safety fallback
          if (content.includes('\0')) {
            skippedCount++;
            continue;
          }

          const relativePath = path.relative(root, fullPath) || path.basename(fullPath);
          files.push({
            filePath: fullPath,
            relativePath,
            content,
            sizeBytes: stats.size,
          });
        } catch (err) {
          unreadableFiles.push({
            path: fullPath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  // Check if rootDir itself is a single file
  try {
    const rootStat = await fs.stat(root);
    if (rootStat.isFile()) {
      if (rootStat.size <= maxFileSize) {
        const content = await fs.readFile(root, 'utf8');
        if (!content.includes('\0')) {
          files.push({
            filePath: root,
            relativePath: path.basename(root),
            content,
            sizeBytes: rootStat.size,
          });
        }
      }
      return { files, unreadableFiles, skippedCount };
    }
  } catch (err) {
    unreadableFiles.push({
      path: root,
      error: err instanceof Error ? err.message : String(err),
    });
    return { files, unreadableFiles, skippedCount };
  }

  await traverse(root);
  return { files, unreadableFiles, skippedCount };
}
