/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/repair/approval-gate.ts
 * Owner: Pratham
 * Purpose: Safety gate: interactive prompt requiring explicit developer approval
 */

import chalk from 'chalk';
import { createInterface } from 'node:readline/promises';
import { stdin as defaultStdin, stdout as defaultStdout } from 'node:process';
import type { Readable, Writable } from 'node:stream';

export type ApprovalStatus = 'APPROVED' | 'REJECTED' | 'ABORTED' | 'SKIPPED';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PatchCandidate {
  id?: string;
  findingId?: string;
  filePath: string;
  diff?: string;
  description?: string;
  riskLevel?: RiskLevel;
}

export interface ApprovalDecision {
  status: ApprovalStatus;
  approved: boolean;
  reason: string;
  timestamp: string;
  patchId?: string;
  filePath: string;
}

export interface ApprovalGateOptions {
  autoApprove?: boolean;
  dryRun?: boolean;
  interactive?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  customPrompt?: string;
  renderPreview?: boolean;
}

export class ApprovalGate {
  private readonly defaultOptions: ApprovalGateOptions;

  constructor(defaultOptions: ApprovalGateOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  /**
   * Format patch candidate details into a reviewable preview summary.
   */
  public formatPreview(candidate: PatchCandidate): string {
    const lines: string[] = [];
    lines.push(chalk.bold.cyan('╭─────────────────────────────────────────────────────────────╮'));
    lines.push(chalk.bold.cyan('│  🛡️  REPAIR PROPOSAL PENDING HUMAN APPROVAL                 │'));
    lines.push(chalk.bold.cyan('╰─────────────────────────────────────────────────────────────╯'));

    if (candidate.id) {
      lines.push(`${chalk.dim('Proposal ID:')}  ${candidate.id}`);
    }
    if (candidate.findingId) {
      lines.push(`${chalk.dim('Finding ID:')}   ${candidate.findingId}`);
    }
    lines.push(`${chalk.dim('Target File:')}  ${chalk.bold.yellow(candidate.filePath)}`);

    if (candidate.riskLevel) {
      const riskColor =
        candidate.riskLevel === 'CRITICAL'
          ? chalk.bgRed.white.bold
          : candidate.riskLevel === 'HIGH'
            ? chalk.red.bold
            : candidate.riskLevel === 'MEDIUM'
              ? chalk.yellow.bold
              : chalk.green.bold;
      lines.push(`${chalk.dim('Risk Level:')}   ${riskColor(` ${candidate.riskLevel} `)}`);
    }

    if (candidate.description) {
      lines.push(`${chalk.dim('Description:')}  ${candidate.description}`);
    }

    if (candidate.diff) {
      lines.push(chalk.dim('\nDiff Preview:'));
      const diffLines = candidate.diff.split('\n');
      for (const line of diffLines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          lines.push(chalk.green(line));
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          lines.push(chalk.red(line));
        } else if (line.startsWith('@@')) {
          lines.push(chalk.cyan(line));
        } else {
          lines.push(chalk.dim(line));
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Request human verification/approval for a repair patch candidate.
   * Invariant: Never applies patches automatically without affirmative consent.
   */
  public async requestApproval(
    candidate: PatchCandidate,
    options?: ApprovalGateOptions
  ): Promise<ApprovalDecision> {
    const opts: ApprovalGateOptions = {
      ...this.defaultOptions,
      ...options,
    };

    const timestamp = new Date().toISOString();
    const filePath = candidate.filePath;
    const patchId = candidate.id;

    // 1. Dry-run mode: Never modify disk, skip approval
    if (opts.dryRun) {
      return {
        status: 'SKIPPED',
        approved: false,
        reason: 'Dry-run mode active; patch application was skipped without modification.',
        timestamp,
        patchId,
        filePath,
      };
    }

    // 2. Explicit auto-approve flag (--yes / CI flag)
    if (opts.autoApprove) {
      return {
        status: 'APPROVED',
        approved: true,
        reason: 'Explicitly approved via auto-approve flag (--yes / non-interactive override).',
        timestamp,
        patchId,
        filePath,
      };
    }

    const input = opts.input ?? defaultStdin;
    const output = opts.output ?? defaultStdout;

    // 3. Non-interactive detection (e.g. running in headless CI without --yes)
    const isInteractive =
      opts.interactive !== undefined
        ? opts.interactive
        : Boolean((input as { isTTY?: boolean }).isTTY ?? (opts.input !== undefined));

    if (!isInteractive && !opts.input) {
      return {
        status: 'REJECTED',
        approved: false,
        reason:
          'Interactive approval required, but environment is non-interactive and --yes flag was not provided.',
        timestamp,
        patchId,
        filePath,
      };
    }

    // 4. Render candidate preview
    if (opts.renderPreview !== false) {
      const previewText = this.formatPreview(candidate);
      output.write(previewText + '\n\n');
    }

    // 5. Interactive prompt with timeout and retry protection
    const promptMessage = opts.customPrompt ?? chalk.bold('Apply this repair patch? [y/N]: ');
    const maxRetries = opts.maxRetries ?? 3;
    const timeoutMs = opts.timeoutMs ?? 0;

    const abortController = new AbortController();
    let timeoutTimer: NodeJS.Timeout | undefined;

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        abortController.abort(new Error(`Approval prompt timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    const rl = createInterface({
      input: input as Readable,
      output: output as Writable,
      terminal: false,
    });

    try {
      let attempts = 0;
      while (attempts < maxRetries) {
        attempts++;
        let rawAnswer: string;
        try {
          rawAnswer = await rl.question(promptMessage, { signal: abortController.signal });
        } catch (err: unknown) {
          const isAbort =
            (err instanceof Error && err.name === 'AbortError') ||
            abortController.signal.aborted;

          if (isAbort) {
            return {
              status: 'ABORTED',
              approved: false,
              reason: timeoutTimer
                ? `Approval prompt timed out after ${timeoutMs}ms.`
                : 'Approval prompt was aborted by signal.',
              timestamp: new Date().toISOString(),
              patchId,
              filePath,
            };
          }
          throw err;
        }

        const answer = (rawAnswer ?? '').trim().toLowerCase();

        // Affirmative consent
        if (answer === 'y' || answer === 'yes') {
          return {
            status: 'APPROVED',
            approved: true,
            reason: 'Explicitly approved by developer.',
            timestamp: new Date().toISOString(),
            patchId,
            filePath,
          };
        }

        // Explicit rejection or default-deny on empty Enter
        if (answer === 'n' || answer === 'no' || answer === '') {
          return {
            status: 'REJECTED',
            approved: false,
            reason:
              answer === ''
                ? 'Rejected by default (developer pressed Enter without confirmation).'
                : 'Explicitly rejected by developer.',
            timestamp: new Date().toISOString(),
            patchId,
            filePath,
          };
        }

        // Invalid response - warn and loop if retries remain
        if (attempts < maxRetries) {
          output.write(
            chalk.yellow(`Invalid choice "${rawAnswer}". Please enter "y" for yes or "n" for no.\n`)
          );
        }
      }

      // Max retries exceeded -> Safe fallback: REJECT
      return {
        status: 'REJECTED',
        approved: false,
        reason: `Exceeded maximum invalid response attempts (${maxRetries}); rejected for safety.`,
        timestamp: new Date().toISOString(),
        patchId,
        filePath,
      };
    } finally {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      rl.close();
    }
  }

  /**
   * Request sequential approval for multiple repair candidates.
   * Stops immediately if any patch is aborted.
   */
  public async requestBatchApproval(
    candidates: PatchCandidate[],
    options?: ApprovalGateOptions
  ): Promise<ApprovalDecision[]> {
    const decisions: ApprovalDecision[] = [];

    for (const candidate of candidates) {
      const decision = await this.requestApproval(candidate, options);
      decisions.push(decision);

      if (decision.status === 'ABORTED') {
        break;
      }
    }

    return decisions;
  }
}

/**
 * Convenient standalone helper to request approval directly.
 */
export async function requestApproval(
  candidate: PatchCandidate,
  options?: ApprovalGateOptions
): Promise<ApprovalDecision> {
  const gate = new ApprovalGate();
  return gate.requestApproval(candidate, options);
}
