/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/verification/check-runner.ts
 * Owner: Pratham
 * Purpose: Verification runner: subprocess execution with strict command allowlist and timeouts
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  CommandExecutionResult,
  VerificationCheckResult,
  VerificationSuiteResult,
  CheckOutcome,
} from '../domain/verification.js';
import {
  classifyExecutionOutcome,
  classifySuiteOutcome,
  formatTruthfulExplanation,
} from './result-classifier.js';

export interface CheckRunnerOptions {
  cwd?: string;
  defaultTimeoutMs?: number;
  maxOutputBytes?: number;
  allowlist?: string[];
  customEnv?: Record<string, string>;
}

export interface RunCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

/**
 * Standard default allowlist of safe verification commands for TypeScript/JavaScript repositories.
 */
export const DEFAULT_VERIFICATION_ALLOWLIST: readonly string[] = [
  'npm test',
  'npm run test',
  'npm run typecheck',
  'npm run lint',
  'npm run build',
  'npx vitest run',
  'npx vitest',
  'npx eslint',
  'npx tsc --noEmit',
  'node --test',
] as const;

/**
 * Parses a command-line string into tokens, properly respecting single and double quotes.
 */
export function tokenizeCommandLine(cmdLine: string): string[] {
  const args: string[] = [];
  let current = '';
  let inDoubleQuote = false;
  let inSingleQuote = false;

  for (let i = 0; i < cmdLine.length; i++) {
    const char = cmdLine[i]!;
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (/\s/.test(char) && !inDoubleQuote && !inSingleQuote) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

/**
 * Checks for dangerous shell metacharacters outside of quoted strings.
 */
export function hasUnquotedShellMetacharacters(cmdLine: string): boolean {
  let inDoubleQuote = false;
  let inSingleQuote = false;

  for (let i = 0; i < cmdLine.length; i++) {
    const char = cmdLine[i]!;
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (!inDoubleQuote && !inSingleQuote) {
      if (/[;&|`$><\r\n\0]/.test(char)) {
        return true;
      }
    }
  }
  return false;
}

export class CheckRunner {
  private readonly cwd: string;
  private readonly defaultTimeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly allowlist: Set<string>;
  private readonly customEnv: Record<string, string>;

  constructor(options: CheckRunnerOptions = {}) {
    this.cwd = options.cwd ? resolve(options.cwd) : process.cwd();
    this.defaultTimeoutMs = Math.max(50, options.defaultTimeoutMs ?? 15000);
    this.maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024; // 1 MB buffer limit
    this.customEnv = options.customEnv ?? {};

    const configuredAllowlist = options.allowlist ?? DEFAULT_VERIFICATION_ALLOWLIST;
    this.allowlist = new Set(configuredAllowlist.map((c) => c.trim().toLowerCase()));
  }

  /**
   * Validates whether a command and its arguments are explicitly permit-listed and safe.
   */
  public isCommandAllowed(commandString: string): { allowed: boolean; reason?: string } {
    const trimmed = commandString.trim();

    if (!trimmed) {
      return { allowed: false, reason: 'Command string is empty.' };
    }

    if (hasUnquotedShellMetacharacters(trimmed)) {
      return {
        allowed: false,
        reason: 'Command contains forbidden shell metacharacters (; & | ` $ > <).',
      };
    }

    const normalized = trimmed.toLowerCase();
    const isDirectMatch = this.allowlist.has(normalized);

    if (isDirectMatch) {
      return { allowed: true };
    }

    // Allow prefixed commands on allowlist (e.g. "npx vitest run tests/unit")
    for (const allowedPrefix of this.allowlist) {
      if (normalized === allowedPrefix || normalized.startsWith(`${allowedPrefix} `)) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: `Command "${commandString}" is not in the configured verification allowlist.`,
    };
  }

  /**
   * Executes a single subprocess command safely without shell expansion.
   */
  public async executeCommand(
    commandString: string,
    options: RunCommandOptions = {}
  ): Promise<CommandExecutionResult> {
    const validation = this.isCommandAllowed(commandString);
    if (!validation.allowed) {
      return {
        command: commandString,
        args: [],
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
        timedOut: false,
        error: `Command rejected by security policy: ${validation.reason}`,
      };
    }

    const parts = tokenizeCommandLine(commandString.trim());
    const binary = parts[0]!;
    const args = parts.slice(1);

    const execCwd = options.cwd ? resolve(options.cwd) : this.cwd;
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const startTime = Date.now();

    return new Promise<CommandExecutionResult>((resolvePromise) => {
      let stdoutData = '';
      let stderrData = '';
      let timedOut = false;

      const baseEnvPath = process.env.PATH || '';
      const safePath = baseEnvPath.includes('/usr/local/bin')
        ? baseEnvPath
        : `${baseEnvPath}:/usr/local/bin:/opt/homebrew/bin`;

      const env = {
        ...process.env,
        PATH: safePath,
        ...this.customEnv,
        ...(options.env ?? {}),
      };

      let child;
      try {
        child = spawn(binary, args, {
          cwd: execCwd,
          env,
          shell: false, // Strict: Prevent shell injection
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err: unknown) {
        const durationMs = Date.now() - startTime;
        const msg = err instanceof Error ? err.message : String(err);
        return resolvePromise({
          command: binary,
          args,
          exitCode: null,
          stdout: '',
          stderr: '',
          durationMs,
          timedOut: false,
          error: `Failed to spawn process: ${msg}`,
        });
      }

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGTERM');
        } catch {
          // Process may have already exited
        }

        // Hard kill after grace period
        setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            // Already dead
          }
        }, 300);
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        if (stdoutData.length < this.maxOutputBytes) {
          stdoutData += chunk.toString('utf8');
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        if (stderrData.length < this.maxOutputBytes) {
          stderrData += chunk.toString('utf8');
        }
      });

      child.on('error', (err: Error) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        const durationMs = Date.now() - startTime;
        resolvePromise({
          command: binary,
          args,
          exitCode: null,
          stdout: stdoutData,
          stderr: stderrData,
          durationMs,
          timedOut: false,
          error: `Subprocess error: ${err.message}`,
        });
      });

      child.on('close', (code: number | null) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        const durationMs = Date.now() - startTime;

        resolvePromise({
          command: binary,
          args,
          exitCode: code,
          stdout: stdoutData,
          stderr: stderrData,
          durationMs,
          timedOut,
          error: timedOut ? `Execution exceeded timeout of ${timeoutMs}ms.` : undefined,
        });
      });
    });
  }

  /**
   * Executes a named verification check and truthfully classifies its outcome.
   */
  public async runCheck(
    checkName: string,
    commandString: string,
    options: RunCommandOptions = {}
  ): Promise<VerificationCheckResult> {
    const rawResult = await this.executeCommand(commandString, options);
    const outcome = classifyExecutionOutcome(rawResult);
    const explanation = formatTruthfulExplanation(
      checkName,
      outcome,
      rawResult.exitCode,
      rawResult.durationMs,
      rawResult.error
    );

    return {
      checkName,
      command: commandString,
      outcome,
      exitCode: rawResult.exitCode,
      durationMs: rawResult.durationMs,
      stdout: rawResult.stdout,
      stderr: rawResult.stderr,
      explanation,
    };
  }

  /**
   * Runs an entire suite of configured verification checks.
   */
  public async runVerificationSuite(
    checks: Array<{ name: string; command: string; optional?: boolean }>,
    options: RunCommandOptions = {}
  ): Promise<VerificationSuiteResult> {
    const startTime = Date.now();
    const results: VerificationCheckResult[] = [];

    for (const check of checks) {
      if (!check.command || check.command.trim() === '') {
        results.push({
          checkName: check.name,
          command: '',
          outcome: 'SKIPPED',
          exitCode: null,
          durationMs: 0,
          stdout: '',
          stderr: '',
          explanation: `Check "${check.name}" was skipped (no command defined).`,
        });
        continue;
      }

      const checkResult = await this.runCheck(check.name, check.command, options);
      results.push(checkResult);
    }

    const durationMs = Date.now() - startTime;
    const overallOutcome: CheckOutcome = classifySuiteOutcome(results);

    const passedCount = results.filter((r) => r.outcome === 'PASSED').length;
    const failedCount = results.filter((r) => r.outcome === 'FAILED').length;
    const timedOutCount = results.filter((r) => r.outcome === 'TIMED_OUT').length;
    const skippedCount = results.filter((r) => r.outcome === 'SKIPPED').length;

    return {
      passed: overallOutcome === 'PASSED',
      totalChecks: results.length,
      passedCount,
      failedCount,
      timedOutCount,
      skippedCount,
      checks: results,
      overallOutcome,
      durationMs,
      timestamp: new Date().toISOString(),
    };
  }
}
