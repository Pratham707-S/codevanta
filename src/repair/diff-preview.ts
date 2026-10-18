/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/repair/diff-preview.ts
 * Owner: Pratham
 * Purpose: Patch preview: colored unified diff terminal preview
 */

import chalk from 'chalk';
import { parseUnifiedDiff, type ParsedPatchFile, type DiffHunk } from './patch-parser.js';

export interface DiffPreviewOptions {
  color?: boolean;
  showLineNumbers?: boolean;
  maxLines?: number;
  gutterWidth?: number;
  wrapWidth?: number;
}

export interface GenerateDiffOptions {
  filePath?: string;
  oldFilePath?: string;
  newFilePath?: string;
  contextLines?: number;
}

export interface FileDiffStats {
  path: string;
  additions: number;
  deletions: number;
}

export interface DiffStats {
  filesChanged: number;
  additions: number;
  deletions: number;
  files: FileDiffStats[];
}

export interface RepairProposalSummary {
  id?: string;
  findingId?: string;
  title?: string;
  rationale?: string;
  filePath?: string;
  diff: string;
}

/**
 * Computes summary statistics for a unified diff string.
 */
export function getDiffStats(diffText: string): DiffStats {
  const files = parseUnifiedDiff(diffText);
  let totalAdditions = 0;
  let totalDeletions = 0;
  const fileStats: FileDiffStats[] = [];

  for (const file of files) {
    let fileAdditions = 0;
    let fileDeletions = 0;

    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'addition') fileAdditions++;
        else if (line.type === 'deletion') fileDeletions++;
      }
    }

    totalAdditions += fileAdditions;
    totalDeletions += fileDeletions;

    fileStats.push({
      path: file.newPath || file.oldPath,
      additions: fileAdditions,
      deletions: fileDeletions,
    });
  }

  return {
    filesChanged: files.length,
    additions: totalAdditions,
    deletions: totalDeletions,
    files: fileStats,
  };
}

/**
 * Formats diff statistics into a human-readable one-line summary.
 */
export function formatDiffStats(stats: DiffStats, color = true): string {
  const filesLabel = `${stats.filesChanged} file${stats.filesChanged === 1 ? '' : 's'} changed`;
  const insertionsLabel = `${stats.additions} insertion${stats.additions === 1 ? '' : 's'}(+)`;
  const deletionsLabel = `${stats.deletions} deletion${stats.deletions === 1 ? '' : 's'}(-)`;

  if (!color) {
    return `${filesLabel}, ${insertionsLabel}, ${deletionsLabel}`;
  }

  return (
    `${chalk.bold(filesLabel)}, ` +
    `${chalk.green.bold(insertionsLabel)}, ` +
    `${chalk.red.bold(deletionsLabel)}`
  );
}

/**
 * Generates unified diff text between old and new string contents using Myers diff algorithm.
 */
export function generateUnifiedDiff(
  oldContent: string,
  newContent: string,
  options: GenerateDiffOptions = {}
): string {
  const filePath = options.filePath || 'file';
  const oldPath = options.oldFilePath || `a/${filePath}`;
  const newPath = options.newFilePath || `b/${filePath}`;
  const contextLines = options.contextLines ?? 3;

  if (oldContent === newContent) {
    return '';
  }

  const a = oldContent === '' ? [] : oldContent.split(/\r?\n/);
  const b = newContent === '' ? [] : newContent.split(/\r?\n/);

  // Myers diff algorithm
  const n = a.length;
  const m = b.length;
  const max = n + m;

  if (max === 0) return '';

  const v: Record<number, number> = { 1: 0 };
  const trace: Array<Record<number, number>> = [];

  let finalD = 0;
  let found = false;

  for (let d = 0; d <= max; d++) {
    trace.push({ ...v });
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v[k - 1] ?? 0) < (v[k + 1] ?? 0))) {
        x = v[k + 1] ?? 0;
      } else {
        x = (v[k - 1] ?? 0) + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[k] = x;
      if (x >= n && y >= m) {
        finalD = d;
        found = true;
        break;
      }
    }
    if (found) break;
  }

  // Backtrack to extract edit operations
  const edits: Array<{ type: 'common' | 'delete' | 'add'; line: string; oldIndex?: number; newIndex?: number }> = [];
  let curX = n;
  let curY = m;

  for (let d = finalD; d > 0; d--) {
    const vPrev = trace[d]!;
    const kPrev = curX - curY;
    const prevK =
      kPrev === -d || (kPrev !== d && (vPrev[kPrev - 1] ?? 0) < (vPrev[kPrev + 1] ?? 0))
        ? kPrev + 1
        : kPrev - 1;
    const prevX = vPrev[prevK] ?? 0;
    const prevY = prevX - prevK;

    while (curX > prevX && curY > prevY) {
      edits.unshift({ type: 'common', line: a[curX - 1]!, oldIndex: curX - 1, newIndex: curY - 1 });
      curX--;
      curY--;
    }

    if (curX > prevX) {
      edits.unshift({ type: 'delete', line: a[curX - 1]!, oldIndex: curX - 1 });
      curX--;
    } else if (curY > prevY) {
      edits.unshift({ type: 'add', line: b[curY - 1]!, newIndex: curY - 1 });
      curY--;
    }
  }

  while (curX > 0 && curY > 0) {
    edits.unshift({ type: 'common', line: a[curX - 1]!, oldIndex: curX - 1, newIndex: curY - 1 });
    curX--;
    curY--;
  }

  // Group edits into hunks with context
  interface RawHunk {
    edits: typeof edits;
  }
  const hunks: RawHunk[] = [];
  let currentHunkEdits: typeof edits = [];
  let trailingContextCount = 0;

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i]!;

    if (edit.type !== 'common') {
      if (currentHunkEdits.length === 0) {
        // Collect leading context
        const leadingStart = Math.max(0, i - contextLines);
        for (let j = leadingStart; j < i; j++) {
          currentHunkEdits.push(edits[j]!);
        }
      }
      currentHunkEdits.push(edit);
      trailingContextCount = 0;
    } else if (currentHunkEdits.length > 0) {
      currentHunkEdits.push(edit);
      trailingContextCount++;

      // Check if we should close the hunk
      if (trailingContextCount >= contextLines) {
        // Peek ahead to see if another edit is within 2 * contextLines
        let nextEditWithinWindow = false;
        for (let j = i + 1; j < Math.min(edits.length, i + 1 + contextLines); j++) {
          if (edits[j]!.type !== 'common') {
            nextEditWithinWindow = true;
            break;
          }
        }

        if (!nextEditWithinWindow) {
          hunks.push({ edits: currentHunkEdits });
          currentHunkEdits = [];
          trailingContextCount = 0;
        }
      }
    }
  }

  if (currentHunkEdits.length > 0) {
    hunks.push({ edits: currentHunkEdits });
  }

  if (hunks.length === 0) {
    return '';
  }

  // Format hunks into standard unified diff
  const outputLines: string[] = [];
  outputLines.push(`--- ${oldPath}`);
  outputLines.push(`+++ ${newPath}`);

  for (const hunk of hunks) {
    let oldStart = 0;
    let oldLines = 0;
    let newStart = 0;
    let newLines = 0;

    let firstOld = true;
    let firstNew = true;

    for (const item of hunk.edits) {
      if (item.type === 'common') {
        if (firstOld) {
          oldStart = (item.oldIndex ?? 0) + 1;
          firstOld = false;
        }
        if (firstNew) {
          newStart = (item.newIndex ?? 0) + 1;
          firstNew = false;
        }
        oldLines++;
        newLines++;
      } else if (item.type === 'delete') {
        if (firstOld) {
          oldStart = (item.oldIndex ?? 0) + 1;
          firstOld = false;
        }
        oldLines++;
      } else if (item.type === 'add') {
        if (firstNew) {
          newStart = (item.newIndex ?? 0) + 1;
          firstNew = false;
        }
        newLines++;
      }
    }

    if (oldLines === 0) oldStart = 0;
    if (newLines === 0) newStart = 0;

    outputLines.push(`@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`);

    for (const item of hunk.edits) {
      if (item.type === 'common') {
        outputLines.push(` ${item.line}`);
      } else if (item.type === 'delete') {
        outputLines.push(`-${item.line}`);
      } else if (item.type === 'add') {
        outputLines.push(`+${item.line}`);
      }
    }
  }

  return outputLines.join('\n');
}

/**
 * Formats a parsed file header banner.
 */
function renderFileHeader(file: ParsedPatchFile, color: boolean): string {
  const filePath = file.newPath || file.oldPath;
  let additions = 0;
  let deletions = 0;

  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'addition') additions++;
      else if (line.type === 'deletion') deletions++;
    }
  }

  const statText = `+${additions} / -${deletions}`;
  const title = `📄 ${filePath}`;

  if (!color) {
    return (
      `╭${'─'.repeat(61)}╮\n` +
      `│ ${title.padEnd(46)} ${statText.padStart(12)} │\n` +
      `╰${'─'.repeat(61)}╯`
    );
  }

  const coloredStat = `${chalk.green(`+${additions}`)} / ${chalk.red(`-${deletions}`)}`;
  const paddedTitle = chalk.bold.white(title);

  return (
    `${chalk.cyan('╭─────────────────────────────────────────────────────────────╮')}\n` +
    `${chalk.cyan('│')} ${paddedTitle} ${chalk.dim('│')} ${coloredStat} ${chalk.cyan('│')}\n` +
    `${chalk.cyan('╰─────────────────────────────────────────────────────────────╯')}`
  );
}

/**
 * Formats a hunk's lines with side-by-side line numbering gutter and syntax colors.
 */
function renderHunk(hunk: DiffHunk, options: DiffPreviewOptions): string[] {
  const color = options.color !== false;
  const showLineNumbers = options.showLineNumbers !== false;
  const gutterWidth = options.gutterWidth ?? 5;

  const lines: string[] = [];

  // Hunk header line
  if (color) {
    lines.push(chalk.bold.cyan(hunk.rawHeader));
  } else {
    lines.push(hunk.rawHeader);
  }

  for (const line of hunk.lines) {
    let gutter = '';
    if (showLineNumbers) {
      const oldStr = line.oldLineNumber !== undefined ? String(line.oldLineNumber) : '';
      const newStr = line.newLineNumber !== undefined ? String(line.newLineNumber) : '';
      const paddedOld = oldStr.padStart(gutterWidth);
      const paddedNew = newStr.padStart(gutterWidth);

      if (color) {
        gutter = `${chalk.dim(paddedOld)} ${chalk.dim('│')} ${chalk.dim(paddedNew)} ${chalk.dim('│')} `;
      } else {
        gutter = `${paddedOld} │ ${paddedNew} │ `;
      }
    }

    if (line.type === 'addition') {
      const prefix = '+';
      const content = `${prefix} ${line.content}`;
      if (color) {
        lines.push(`${gutter}${chalk.green(content)}`);
      } else {
        lines.push(`${gutter}${content}`);
      }
    } else if (line.type === 'deletion') {
      const prefix = '-';
      const content = `${prefix} ${line.content}`;
      if (color) {
        lines.push(`${gutter}${chalk.red(content)}`);
      } else {
        lines.push(`${gutter}${content}`);
      }
    } else {
      const prefix = ' ';
      const content = `${prefix} ${line.content}`;
      if (color) {
        lines.push(`${gutter}${chalk.dim(content)}`);
      } else {
        lines.push(`${gutter}${content}`);
      }
    }
  }

  return lines;
}

/**
 * Renders unified diff text into a styled terminal preview.
 */
export function renderDiffPreview(diffText: string, options: DiffPreviewOptions = {}): string {
  if (!diffText || diffText.trim() === '') {
    return options.color !== false
      ? chalk.dim('(empty diff)')
      : '(empty diff)';
  }

  const files = parseUnifiedDiff(diffText);
  if (files.length === 0) {
    return options.color !== false
      ? chalk.yellow('(no changes detected)')
      : '(no changes detected)';
  }

  const color = options.color !== false;
  const maxLines = options.maxLines ?? 500;
  const outputLines: string[] = [];

  for (const file of files) {
    outputLines.push(renderFileHeader(file, color));

    for (const hunk of file.hunks) {
      const hunkLines = renderHunk(hunk, options);
      outputLines.push(...hunkLines);

      if (outputLines.length > maxLines) {
        const remaining = outputLines.length - maxLines;
        outputLines.splice(maxLines);
        outputLines.push(
          color
            ? chalk.yellow(`\n... diff truncated (${remaining} more lines) ...`)
            : `\n... diff truncated (${remaining} more lines) ...`
        );
        break;
      }
    }
    outputLines.push('');
  }

  const stats = getDiffStats(diffText);
  outputLines.push(`Summary: ${formatDiffStats(stats, color)}`);

  return outputLines.join('\n');
}

/**
 * Renders a full repair proposal preview including metadata and colored diff.
 */
export function renderProposalPreview(
  proposal: RepairProposalSummary,
  options: DiffPreviewOptions = {}
): string {
  const color = options.color !== false;
  const lines: string[] = [];

  if (color) {
    lines.push(chalk.bold.cyan('╭─────────────────────────────────────────────────────────────╮'));
    lines.push(chalk.bold.cyan('│  🛡️  REPAIR PROPOSAL PREVIEW                                │'));
    lines.push(chalk.bold.cyan('╰─────────────────────────────────────────────────────────────╯'));
  } else {
    lines.push('╭─────────────────────────────────────────────────────────────╮');
    lines.push('│  🛡️  REPAIR PROPOSAL PREVIEW                                │');
    lines.push('╰─────────────────────────────────────────────────────────────╯');
  }

  if (proposal.id) {
    lines.push(`${color ? chalk.dim('Proposal ID:') : 'Proposal ID:'}  ${proposal.id}`);
  }
  if (proposal.findingId) {
    lines.push(`${color ? chalk.dim('Finding ID:') : 'Finding ID:'}   ${proposal.findingId}`);
  }
  if (proposal.filePath) {
    lines.push(
      `${color ? chalk.dim('Target File:') : 'Target File:'}  ${color ? chalk.bold.yellow(proposal.filePath) : proposal.filePath}`
    );
  }
  if (proposal.title) {
    lines.push(`${color ? chalk.dim('Title:') : 'Title:'}        ${proposal.title}`);
  }
  if (proposal.rationale) {
    lines.push(`${color ? chalk.dim('Rationale:') : 'Rationale:'}    ${proposal.rationale}`);
  }

  lines.push('');
  lines.push(renderDiffPreview(proposal.diff, options));

  return lines.join('\n');
}

/**
 * DiffPreviewer class wrapper.
 */
export class DiffPreviewer {
  private readonly defaultOptions: DiffPreviewOptions;

  constructor(defaultOptions: DiffPreviewOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  public render(diffText: string, options?: DiffPreviewOptions): string {
    return renderDiffPreview(diffText, { ...this.defaultOptions, ...options });
  }

  public renderProposal(proposal: RepairProposalSummary, options?: DiffPreviewOptions): string {
    return renderProposalPreview(proposal, { ...this.defaultOptions, ...options });
  }

  public getStats(diffText: string): DiffStats {
    return getDiffStats(diffText);
  }

  public generateDiff(
    oldContent: string,
    newContent: string,
    options?: GenerateDiffOptions
  ): string {
    return generateUnifiedDiff(oldContent, newContent, options);
  }
}

