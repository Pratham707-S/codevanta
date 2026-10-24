/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/context/context-builder.ts
 * Owner: Manni
 * Purpose: Context builder: assemble bounded code slices, ranking and token budgeting
 */

import { promises as fs } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { StorageFinding } from '../storage/run-store.js';
import { redactSecrets } from './secret-redactor.js';
import { validateSafePath } from '../repair/patch-parser.js';

export interface ContextBuilderOptions {
  /** Lines of context to include before and after the finding range. Default: 15 */
  contextLines?: number;
  /** Maximum total lines allowed in the code slice. Default: 60 */
  maxTotalLines?: number;
  /** Repository root directory for resolving file paths safely */
  repoRoot?: string;
}

export interface CodeSliceLine {
  lineNumber: number;
  content: string;
  isTargetLine: boolean;
}

export interface BoundedCodeSlice {
  filePath: string;
  startLine: number;
  endLine: number;
  lines: CodeSliceLine[];
  rawSnippet: string;
  totalFileLines: number;
}

export interface SanitizedFindingMetadata {
  id: string;
  category: string;
  severity: string;
  title: string;
  path: string;
  lineRange?: { start: number; end: number };
  explanation: string;
  evidence?: string;
}

export interface SanitizedPromptContext {
  finding: SanitizedFindingMetadata;
  codeSlice: BoundedCodeSlice;
  formattedPromptContext: string;
  hasRedactedSecrets: boolean;
}

/**
 * Reads and bounds a target source file to a small window centered on the finding,
 * strictly sanitizing any discovered credentials or secrets before prompt assembly.
 */
export async function buildSanitizedContext(
  finding: StorageFinding,
  repoRoot: string = process.cwd(),
  options: ContextBuilderOptions = {}
): Promise<SanitizedPromptContext> {
  const contextLines = Math.max(1, Math.min(options.contextLines ?? 15, 50));
  const maxTotalLines = Math.max(10, Math.min(options.maxTotalLines ?? 60, 150));

  // 1. Guard against path traversal attempts in finding path
  const pathCheck = validateSafePath(finding.path, repoRoot);
  if (!pathCheck.safe) {
    throw new Error(`Path traversal or unsafe path rejected in context builder: ${pathCheck.error || finding.path}`);
  }

  // 2. Resolve safe absolute file path
  const absolutePath = isAbsolute(finding.path)
    ? resolve(finding.path)
    : resolve(repoRoot, finding.path);

  let fileContent = '';
  try {
    fileContent = await fs.readFile(absolutePath, 'utf-8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read source file "${finding.path}" for context extraction: ${message}`);
  }

  // 2b. Sanitize complete source file content before line extraction
  // Guarantees multiline secrets (like PEM private key blocks) are fully scrubbed
  // even if they span multiple lines or extend across slice boundaries.
  const sanitizedFileContent = redactSecrets(fileContent);
  let hasRedactedSecrets = sanitizedFileContent !== fileContent;

  const allLines = sanitizedFileContent.split(/\r?\n/);
  const totalFileLines = allLines.length;

  // 3. Determine target line boundaries
  const targetStart = finding.lineRange?.start ?? 1;
  const targetEnd = finding.lineRange?.end ?? targetStart;

  // 4. Calculate bounded slice window
  let sliceStart = Math.max(1, targetStart - contextLines);
  let sliceEnd = Math.min(totalFileLines, targetEnd + contextLines);

  // If window exceeds maxTotalLines, clamp symmetrically
  if (sliceEnd - sliceStart + 1 > maxTotalLines) {
    const excess = (sliceEnd - sliceStart + 1) - maxTotalLines;
    sliceStart = Math.min(sliceStart + Math.floor(excess / 2), targetStart);
    sliceEnd = Math.max(sliceStart + maxTotalLines - 1, targetEnd);
    if (sliceEnd > totalFileLines) {
      sliceEnd = totalFileLines;
      sliceStart = Math.max(1, sliceEnd - maxTotalLines + 1);
    }
  }

  // 5. Extract lines and apply defense-in-depth line sanitization
  const sliceLines: CodeSliceLine[] = [];
  const rawSnippetLines: string[] = [];

  for (let lineNum = sliceStart; lineNum <= sliceEnd; lineNum++) {
    const rawLine = allLines[lineNum - 1] ?? '';
    const redactedLine = redactSecrets(rawLine);
    if (redactedLine !== rawLine) {
      hasRedactedSecrets = true;
    }

    const isTarget = lineNum >= targetStart && lineNum <= targetEnd;
    sliceLines.push({
      lineNumber: lineNum,
      content: redactedLine,
      isTargetLine: isTarget,
    });
    rawSnippetLines.push(`L${lineNum}: ${redactedLine}`);
  }

  // 6. Sanitize finding explanation and evidence
  const originalExplanation = finding.explanation || '';
  const sanitizedExplanation = redactSecrets(originalExplanation);
  if (sanitizedExplanation !== originalExplanation) {
    hasRedactedSecrets = true;
  }

  let sanitizedEvidence: string | undefined = undefined;
  if (finding.evidence !== undefined) {
    const originalEvidence = String(finding.evidence);
    sanitizedEvidence = redactSecrets(originalEvidence);
    if (sanitizedEvidence !== originalEvidence) {
      hasRedactedSecrets = true;
    }
  }

  const sanitizedFinding: SanitizedFindingMetadata = {
    id: finding.id,
    category: finding.category,
    severity: finding.severity,
    title: finding.title,
    path: finding.path,
    lineRange: finding.lineRange,
    explanation: sanitizedExplanation,
    evidence: sanitizedEvidence,
  };

  const codeSlice: BoundedCodeSlice = {
    filePath: finding.path,
    startLine: sliceStart,
    endLine: sliceEnd,
    lines: sliceLines,
    rawSnippet: rawSnippetLines.join('\n'),
    totalFileLines,
  };

  // 7. Format clean prompt context string with final defense-in-depth sanitization
  const rawPromptContext = [
    `### Security Finding Details`,
    `- Finding ID: ${sanitizedFinding.id}`,
    `- Rule Category: ${sanitizedFinding.category}`,
    `- Severity: ${sanitizedFinding.severity}`,
    `- Target File: ${sanitizedFinding.path}`,
    `- Target Line Range: Lines ${targetStart}-${targetEnd}`,
    `- Description: ${sanitizedFinding.title}`,
    `- Explanation: ${sanitizedFinding.explanation}`,
    sanitizedFinding.evidence ? `- Evidence: ${sanitizedFinding.evidence}` : '',
    '',
    `### Bounded Source Code Slice (Lines ${sliceStart}-${sliceEnd} of ${totalFileLines})`,
    '```',
    codeSlice.rawSnippet,
    '```',
  ]
    .filter((line) => line !== '')
    .join('\n');

  const formattedPromptContext = redactSecrets(rawPromptContext);

  return {
    finding: sanitizedFinding,
    codeSlice,
    formattedPromptContext,
    hasRedactedSecrets,
  };
}
