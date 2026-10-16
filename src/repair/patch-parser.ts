/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/repair/patch-parser.ts
 * Owner: Pratham
 * Purpose: Patch parser & validator: parse unified diffs, guard against path traversal
 */

import { posix, win32, resolve, relative, isAbsolute } from 'node:path';

export interface DiffHunkHeader {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  heading?: string;
}

export type DiffLineType = 'context' | 'addition' | 'deletion';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  header: DiffHunkHeader;
  rawHeader: string;
  lines: DiffLine[];
}

export interface ParsedPatchFile {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
  isNewFile: boolean;
  isDeletedFile: boolean;
  rawHeaderLines: string[];
}

export interface PathValidationResult {
  safe: boolean;
  error?: string;
  normalizedPath?: string;
}

export interface PatchValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  files: ParsedPatchFile[];
}

export interface PatchParseOptions {
  repoRoot?: string;
  strictLineCounts?: boolean;
}

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Validates that a file path is safe, relative, and does not escape the repository root.
 * Blocks directory traversal (../), absolute paths, cross-drive escapes, null bytes,
 * and dangerous Windows device names.
 */
export function validateSafePath(filePath: string, repoRoot?: string): PathValidationResult {
  if (!filePath || filePath.trim() === '') {
    return { safe: false, error: 'Path cannot be empty or whitespace only.' };
  }

  const trimmed = filePath.trim();

  // Null-byte injection check
  if (trimmed.includes('\0')) {
    return { safe: false, error: 'Path contains prohibited null-byte character.' };
  }

  // Windows drive letter check (e.g. C:\ or c:/)
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return { safe: false, error: `Absolute Windows drive path prohibited: "${trimmed}".` };
  }

  // UNC network share check (e.g. \\server\share)
  if (/^[\\]{2}|^\/{2}/.test(trimmed)) {
    return { safe: false, error: `UNC network path prohibited: "${trimmed}".` };
  }

  // POSIX or Win32 absolute path check
  if (posix.isAbsolute(trimmed) || win32.isAbsolute(trimmed)) {
    return { safe: false, error: `Absolute system path prohibited: "${trimmed}".` };
  }

  // Convert backslashes to forward slashes for unified POSIX checks
  const posixPath = trimmed.replace(/\\/g, '/');

  // Strip leading ./ if present
  const cleaned = posixPath.replace(/^(\.\/)+/, '');

  // Split into segments and check for traversal or reserved names
  const segments = cleaned.split('/');

  for (const segment of segments) {
    if (segment === '..') {
      return { safe: false, error: `Path traversal segment ".." prohibited: "${trimmed}".` };
    }
    if (WINDOWS_RESERVED_NAMES.test(segment)) {
      return { safe: false, error: `Prohibited device name "${segment}" in path: "${trimmed}".` };
    }
  }

  const normalized = posix.normalize(cleaned);
  if (normalized === '..' || normalized.startsWith('../') || normalized.startsWith('..\\')) {
    return { safe: false, error: `Path escapes directory root: "${trimmed}".` };
  }

  // If repoRoot is provided, perform strict containment check against absolute repo path
  if (repoRoot) {
    const absRoot = resolve(repoRoot);
    const absTarget = resolve(absRoot, normalized);
    const rel = relative(absRoot, absTarget);

    if (
      rel.startsWith('..') ||
      isAbsolute(rel) ||
      /^[a-zA-Z]:/.test(rel) ||
      rel === ''
    ) {
      return {
        safe: false,
        error: `Resolved path "${absTarget}" escapes repository root "${absRoot}".`,
      };
    }

    return { safe: true, normalizedPath: rel.replace(/\\/g, '/') };
  }

  return { safe: true, normalizedPath: normalized };
}

/**
 * Convenient boolean check for path safety.
 */
export function isPathSafe(filePath: string, repoRoot?: string): boolean {
  return validateSafePath(filePath, repoRoot).safe;
}

/**
 * Strips git prefixes (a/, b/) or quotes/timestamps from diff path strings.
 */
export function stripDiffPath(rawPath: string): string {
  let cleaned = rawPath.trim();

  // Strip surrounding quotes if present
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }

  // Remove timestamps (e.g. "path/to/file\t2026-10-13 12:00:00")
  const tabIndex = cleaned.indexOf('\t');
  if (tabIndex !== -1) {
    cleaned = cleaned.substring(0, tabIndex).trim();
  }

  // Strip a/ or b/ git prefixes if present
  if (/^[ab]\//.test(cleaned)) {
    cleaned = cleaned.substring(2);
  }

  return cleaned;
}

const HUNK_HEADER_REGEX = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/;

/**
 * Parses unified diff text into structured file representations with hunks and lines.
 */
export function parseUnifiedDiff(
  diffText: string,
  _options?: PatchParseOptions
): ParsedPatchFile[] {
  if (!diffText || diffText.trim() === '') {
    return [];
  }

  const lines = diffText.split(/\r?\n/);
  const files: ParsedPatchFile[] = [];

  let currentFile: ParsedPatchFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let currentOldLine = 0;
  let currentNewLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Diff file header: --- (old path)
    if (line.startsWith('--- ')) {
      if (currentFile) {
        if (currentHunk) {
          currentFile.hunks.push(currentHunk);
          currentHunk = null;
        }
        files.push(currentFile);
      }

      const rawOldPath = line.substring(4).trim();
      const strippedOld = stripDiffPath(rawOldPath);
      const isNew = rawOldPath === '/dev/null';

      currentFile = {
        oldPath: strippedOld,
        newPath: '',
        hunks: [],
        isNewFile: isNew,
        isDeletedFile: false,
        rawHeaderLines: [line],
      };
      continue;
    }

    // Diff file header: +++ (new path)
    if (line.startsWith('+++ ')) {
      if (currentFile) {
        const rawNewPath = line.substring(4).trim();
        const strippedNew = stripDiffPath(rawNewPath);
        currentFile.newPath = strippedNew;
        if (rawNewPath === '/dev/null') {
          currentFile.isDeletedFile = true;
        }
        currentFile.rawHeaderLines.push(line);
      }
      continue;
    }

    // Git metadata lines before hunks (diff --git, index, mode lines)
    if (
      line.startsWith('diff --git ') ||
      line.startsWith('index ') ||
      line.startsWith('new file mode') ||
      line.startsWith('deleted file mode')
    ) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
        currentHunk = null;
      }
      continue;
    }

    // Hunk header: @@ -oldStart,oldLines +newStart,newLines @@
    if (line.startsWith('@@ ')) {
      if (!currentFile) {
        currentFile = {
          oldPath: 'unknown',
          newPath: 'unknown',
          hunks: [],
          isNewFile: false,
          isDeletedFile: false,
          rawHeaderLines: [],
        };
      } else if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }

      const match = HUNK_HEADER_REGEX.exec(line);
      if (match) {
        const oldStart = parseInt(match[1]!, 10);
        const oldLines = match[2] !== undefined ? parseInt(match[2]!, 10) : 1;
        const newStart = parseInt(match[3]!, 10);
        const newLines = match[4] !== undefined ? parseInt(match[4]!, 10) : 1;
        const heading = match[5]?.trim() || undefined;

        currentOldLine = oldStart;
        currentNewLine = newStart;

        currentHunk = {
          header: { oldStart, oldLines, newStart, newLines, heading },
          rawHeader: line,
          lines: [],
        };
      }
      continue;
    }

    // Lines inside a hunk
    if (currentHunk) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'addition',
          content: line.substring(1),
          newLineNumber: currentNewLine++,
        });
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'deletion',
          content: line.substring(1),
          oldLineNumber: currentOldLine++,
        });
      } else if (line.startsWith(' ') || line === '') {
        currentHunk.lines.push({
          type: 'context',
          content: line.startsWith(' ') ? line.substring(1) : line,
          oldLineNumber: currentOldLine++,
          newLineNumber: currentNewLine++,
        });
      } else if (line.startsWith('\\')) {
        // e.g. "\ No newline at end of file"
        continue;
      }
    }
  }

  // Push final hunk and file
  if (currentFile) {
    if (currentHunk) {
      currentFile.hunks.push(currentHunk);
    }
    files.push(currentFile);
  }

  return files;
}

/**
 * Validates a unified diff patch string.
 * Checks for path traversal, absolute system paths, malformed hunks, and line count discrepancies.
 */
export function validatePatch(
  diffText: string,
  options: PatchParseOptions = {}
): PatchValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!diffText || diffText.trim() === '') {
    return {
      valid: false,
      errors: ['Patch content is empty or contains no diff data.'],
      warnings: [],
      files: [],
    };
  }

  const files = parseUnifiedDiff(diffText, options);

  if (files.length === 0) {
    return {
      valid: false,
      errors: ['Malformed patch: No diff hunks or file headers could be identified.'],
      warnings: [],
      files: [],
    };
  }

  for (const file of files) {
    const pathsToCheck: string[] = [];
    if (!file.isNewFile && file.oldPath && file.oldPath !== '/dev/null') {
      pathsToCheck.push(file.oldPath);
    }
    if (!file.isDeletedFile && file.newPath && file.newPath !== '/dev/null') {
      pathsToCheck.push(file.newPath);
    }

    if (pathsToCheck.length === 0) {
      errors.push('Patch contains file with missing target paths.');
      continue;
    }

    for (const path of pathsToCheck) {
      const pathValidation = validateSafePath(path, options.repoRoot);
      if (!pathValidation.safe) {
        errors.push(`Unsafe path in patch ("${path}"): ${pathValidation.error}`);
      }
    }

    if (file.hunks.length === 0) {
      errors.push(`Patch for file "${file.newPath || file.oldPath}" contains no change hunks.`);
    }

    for (const hunk of file.hunks) {
      if (hunk.lines.length === 0) {
        errors.push(`Hunk ${hunk.rawHeader} contains no diff lines.`);
        continue;
      }

      // Verify line counts if requested
      if (options.strictLineCounts) {
        const oldActual = hunk.lines.filter(
          (l) => l.type === 'context' || l.type === 'deletion'
        ).length;
        const newActual = hunk.lines.filter(
          (l) => l.type === 'context' || l.type === 'addition'
        ).length;

        if (oldActual !== hunk.header.oldLines) {
          warnings.push(
            `Hunk ${hunk.rawHeader} old line count mismatch: header expects ${hunk.header.oldLines}, found ${oldActual}.`
          );
        }
        if (newActual !== hunk.header.newLines) {
          warnings.push(
            `Hunk ${hunk.rawHeader} new line count mismatch: header expects ${hunk.header.newLines}, found ${newActual}.`
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    files,
  };
}

/**
 * PatchParser class wrapper.
 */
export class PatchParser {
  private readonly defaultOptions: PatchParseOptions;

  constructor(defaultOptions: PatchParseOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  public parse(diffText: string, options?: PatchParseOptions): ParsedPatchFile[] {
    return parseUnifiedDiff(diffText, { ...this.defaultOptions, ...options });
  }

  public validate(diffText: string, options?: PatchParseOptions): PatchValidationResult {
    return validatePatch(diffText, { ...this.defaultOptions, ...options });
  }

  public isSafe(filePath: string, repoRoot?: string): boolean {
    return validateSafePath(filePath, repoRoot ?? this.defaultOptions.repoRoot).safe;
  }
}

