/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/context/context-builder.ts
 * Owner: Manni
 * Purpose: Context builder: assemble bounded code slices, ranking and token budgeting
 *
 * @todo Implementation planned in assigned milestone.
 */

import { redactSecrets } from './secret-redactor.js';

export interface ContextSourceFile {
  relativePath: string;
  content: string;
  language?: string;
}

export interface ContextBuilderOptions {
  maxFiles?: number;
  maxTotalCharacters?: number;
  maxFileCharacters?: number;
}

export interface ContextFile {
  relativePath: string;
  language?: string;
  content: string;
}

export interface BuiltContext {
  files: ContextFile[];
  totalCharacters: number;
  skippedFiles: string[];
}

const DEFAULT_MAX_FILES = 30;
const DEFAULT_MAX_TOTAL_CHARACTERS = 50_000;
const DEFAULT_MAX_FILE_CHARACTERS = 10_000;

/**
 * Selects source files in deterministic order and redacts secrets
 * before returning the context for downstream AI analysis.
 */
export function buildContext(
  sourceFiles: readonly ContextSourceFile[],
  options: ContextBuilderOptions = {},
): BuiltContext {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxTotalCharacters =
    options.maxTotalCharacters ?? DEFAULT_MAX_TOTAL_CHARACTERS;
  const maxFileCharacters =
    options.maxFileCharacters ?? DEFAULT_MAX_FILE_CHARACTERS;

  for (const [name, value] of Object.entries({
    maxFiles,
    maxTotalCharacters,
    maxFileCharacters,
  })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer.`);
    }
  }

  const sortedFiles = [...sourceFiles].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath),
  );

  const files: ContextFile[] = [];
  const skippedFiles: string[] = [];
  let totalCharacters = 0;

  for (const sourceFile of sortedFiles) {
    if (files.length >= maxFiles) {
      skippedFiles.push(sourceFile.relativePath);
      continue;
    }

    // Redact the complete content before applying character limits.
    const redactedContent = redactSecrets(sourceFile.content);

    if (redactedContent.length === 0) {
      skippedFiles.push(sourceFile.relativePath);
      continue;
    }

    const remainingCharacters =
      maxTotalCharacters - totalCharacters;

    if (remainingCharacters <= 0) {
      skippedFiles.push(sourceFile.relativePath);
      continue;
    }

    const contentLimit = Math.min(
      maxFileCharacters,
      remainingCharacters,
    );

    if (contentLimit <= 0) {
      skippedFiles.push(sourceFile.relativePath);
      continue;
    }

    let boundedContent = redactedContent.slice(0, contentLimit);

    // Avoid returning an incomplete redaction marker.
    const markerStart = boundedContent.lastIndexOf('[REDA');
    
    if (markerStart !== -1 && !boundedContent.slice(markerStart).includes(']')) {
      boundedContent = boundedContent.slice(0, markerStart);
    }

    files.push({
      relativePath: sourceFile.relativePath,
      language: sourceFile.language,
      content: boundedContent,
    });

    totalCharacters += boundedContent.length;
  }

  return {
    files,
    totalCharacters,
    skippedFiles,
  };
}