/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/repository/file-walker.ts
 * Owner: Manni
 * Purpose: Safely enumerate repository files without modifying them.
 */

import {
  lstatSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';

const MAX_FILE_SIZE_BYTES = 1024 * 1024;

const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.cache',
  '.turbo',
  '.idea',
]);

const SENSITIVE_FILE_PATTERNS = [
  /^\.env(?:\..*)?$/i,
  /\.(?:pem|key|cert|pfx)$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)$/i,
];

const IGNORED_FILE_NAMES = new Set([
  '.DS_Store',
  'Thumbs.db',
  'npm-debug.log',
]);

export interface WalkedFile {
  /** Path relative to the repository root, using forward slashes. */
  relativePath: string;
  /** File size in bytes. */
  size: number;
}

export interface FileWalkerOptions {
  /** Maximum file size in bytes. Defaults to 1 MiB. */
  maxFileSizeBytes?: number;
  /** Additional directory names to skip. */
  ignoredDirectories?: readonly string[];
}

/**
 * Returns true when a file name looks like a secret-bearing file.
 */
function isSensitiveFile(fileName: string): boolean {
  return SENSITIVE_FILE_PATTERNS.some((pattern) =>
    pattern.test(fileName),
  );
}

/**
 * Basic .gitignore-style matching for common repository patterns.
 *
 * Supports blank lines, comments, negation, directory patterns,
 * root-anchored patterns and simple wildcard matching.
 * This is intentionally not a complete Git ignore implementation.
 */
function createIgnoreMatcher(
  rootPath: string,
): (relativePath: string, isDirectory: boolean) => boolean {
  let lines: string[];

  try {
    lines = readFileSync(
      path.join(rootPath, '.gitignore'),
      'utf8',
    ).split(/\r?\n/);
  } catch {
    lines = [];
  }

  const rules = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const negated = line.startsWith('!');
      const pattern = negated ? line.slice(1) : line;

      return {
        negated,
        pattern: pattern.replace(/\\/g, '/'),
      };
    });

  return (relativePath, isDirectory) => {
    const normalized = relativePath.replace(/\\/g, '/');
    let ignored = false;

    for (const rule of rules) {
      const pattern = rule.pattern;

      if (!pattern || pattern.startsWith('!')) {
        continue;
      }

      const directoryPattern = pattern.endsWith('/');
      const cleanPattern = pattern.replace(/^\/|\/$/g, '');

      if (!cleanPattern) {
        continue;
      }

      const escaped = cleanPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '§DOUBLESTAR§')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replace(/§DOUBLESTAR§/g, '.*');

      const anchored = pattern.startsWith('/');
      const hasSlash = cleanPattern.includes('/');
      const expression = anchored || hasSlash
        ? new RegExp(`^${escaped}(?:/.*)?$`)
        : new RegExp(`(?:^|/)${escaped}(?:/.*)?$`);

      const matches = expression.test(normalized);

      if (
        matches &&
        (!directoryPattern || isDirectory || normalized.includes('/'))
      ) {
        ignored = !rule.negated;
      }
    }

    return ignored;
  };
}

/**
 * Walks a repository and returns eligible regular files.
 *
 * Security behavior:
 * - Does not follow symbolic links.
 * - Does not return sensitive files.
 * - Skips binary files and files exceeding the size limit.
 * - Does not write, delete, or execute repository files.
 *
 * Note: .gitignore support here covers common patterns, not every Git edge case.
 */
export function walkRepositoryFiles(
  repositoryRoot: string,
  options: FileWalkerOptions = {},
): WalkedFile[] {
  const rootPath = path.resolve(repositoryRoot);
  const maxFileSizeBytes =
    options.maxFileSizeBytes ?? MAX_FILE_SIZE_BYTES;

  if (
    !Number.isSafeInteger(maxFileSizeBytes) ||
    maxFileSizeBytes < 0
  ) {
    throw new RangeError(
      'maxFileSizeBytes must be a non-negative safe integer.',
    );
  }

  let rootStats;

  try {
    rootStats = lstatSync(rootPath);
  } catch {
    return [];
  }

  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    return [];
  }

  const ignoredDirectories = new Set([
    ...IGNORED_DIRECTORIES,
    ...(options.ignoredDirectories ?? []),
  ]);

  const isIgnoredByGitignore = createIgnoreMatcher(rootPath);
  const results: WalkedFile[] = [];

  function visit(directoryPath: string, relativeDirectory: string): void {
    let entries: string[];

    try {
      entries = readdirSync(directoryPath).sort((a, b) =>
        a.localeCompare(b),
      );
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath = path.join(directoryPath, entry);
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry}`
        : entry;

      let stats;

      try {
        stats = lstatSync(absolutePath);
      } catch {
        continue;
      }

      // Never follow symlinks.
      if (stats.isSymbolicLink()) {
        continue;
      }

      if (stats.isDirectory()) {
        if (
          ignoredDirectories.has(entry) ||
          isSensitiveFile(entry) ||
          isIgnoredByGitignore(relativePath, true)
        ) {
          continue;
        }

        visit(absolutePath, relativePath);
        continue;
      }

      if (!stats.isFile()) {
        continue;
      }

      if (
        isSensitiveFile(entry) ||
        IGNORED_FILE_NAMES.has(entry) ||
        isIgnoredByGitignore(relativePath, false) ||
        stats.size > maxFileSizeBytes
      ) {
        continue;
      }

      // Reject files containing NUL bytes instead of indexing binary content.
      try {
        const descriptor = readFileSync(absolutePath);

        if (descriptor.includes(0)) {
          continue;
        }
      } catch {
        continue;
      }

      results.push({
        relativePath,
        size: stats.size,
      });
    }
  }

  visit(rootPath, '');

  return results;
}
