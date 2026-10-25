/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/verification/sandbox/docker-runner.ts
 * Owner: Pratham
 * Purpose: Container sandbox: run verification checks in isolated Docker container
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  VerificationCheckResult,
  VerificationSuiteResult,
  CommandExecutionResult,
} from '../../domain/verification.js';
import {
  classifyExecutionOutcome,
  classifySuiteOutcome,
  formatTruthfulExplanation,
} from '../result-classifier.js';
import {
  CheckRunner,
  VerificationSuiteInput,
  tokenizeCommandLine,
  hasUnquotedShellMetacharacters,
} from '../check-runner.js';
import {
  SandboxResourceLimits,
  resolveResourceLimits,
  formatDockerResourceArgs,
} from './resource-limits.js';
import {
  SandboxSecurityPolicy,
  resolveSecurityPolicy,
  formatDockerSecurityArgs,
} from './sandbox-policy.js';

export interface DockerRunnerOptions {
  image?: string;
  workdir?: string;
  resources?: Partial<SandboxResourceLimits>;
  policy?: Partial<SandboxSecurityPolicy>;
  fallbackToSubprocess?: boolean;
  dockerBinary?: string;
  subprocessRunner?: CheckRunner;
}

export class DockerRunner {
  private readonly image: string;
  private readonly workdir: string;
  private readonly resources: SandboxResourceLimits;
  private readonly policy: SandboxSecurityPolicy;
  private readonly fallbackToSubprocess: boolean;
  private readonly dockerBinary: string;
  private readonly subprocessRunner: CheckRunner;

  constructor(options: DockerRunnerOptions = {}) {
    this.image = options.image ?? 'node:22-alpine';
    this.workdir = options.workdir ?? '/workspace';
    this.resources = resolveResourceLimits(options.resources);
    this.policy = resolveSecurityPolicy(options.policy);
    this.fallbackToSubprocess = options.fallbackToSubprocess ?? true;
    this.dockerBinary = options.dockerBinary ?? 'docker';
    this.subprocessRunner = options.subprocessRunner ?? new CheckRunner({
      defaultTimeoutMs: this.resources.timeoutMs,
    });
  }

  /**
   * Checks whether the Docker CLI and daemon are responsive.
   */
  public async isDockerAvailable(): Promise<boolean> {
    return new Promise<boolean>((resolveCheck) => {
      try {
        const proc = spawn(this.dockerBinary, ['--version'], {
          shell: false,
          timeout: 3000,
          windowsHide: true,
        });

        proc.on('error', () => {
          resolveCheck(false);
        });

        proc.on('close', (code) => {
          resolveCheck(code === 0);
        });
      } catch {
        resolveCheck(false);
      }
    });
  }

  /**
   * Constructs the full argument array for `docker run`.
   */
  public buildDockerRunArgs(hostRepoPath: string, command: string): string[] {
    const normalizedHost = resolve(hostRepoPath).replace(/\\/g, '/');
    const commandTokens = tokenizeCommandLine(command);

    const resourceArgs = formatDockerResourceArgs(this.resources);
    const securityArgs = formatDockerSecurityArgs(this.policy);

    return [
      'run',
      '--rm',
      '-i',
      `--workdir=${this.workdir}`,
      `-v=${normalizedHost}:${this.workdir}:rw`,
      ...resourceArgs,
      ...securityArgs,
      this.image,
      ...commandTokens,
    ];
  }

  /**
   * Runs a single verification check inside a disposable Docker container.
   */
  public async runCheck(
    checkName: string,
    command: string,
    repoRoot: string
  ): Promise<VerificationCheckResult> {
    const startTime = Date.now();

    // 1. Guard against dangerous shell metacharacters
    if (hasUnquotedShellMetacharacters(command)) {
      const durationMs = Date.now() - startTime;
      return {
        checkName,
        command,
        outcome: 'ERROR',
        exitCode: 1,
        durationMs,
        stdout: '',
        stderr: 'Shell chaining, redirection, or subshells are strictly disallowed.',
        explanation: formatTruthfulExplanation(
          checkName,
          'ERROR',
          1,
          durationMs,
          'Command contains disallowed shell operators'
        ),
      };
    }

    // 2. Check Docker daemon availability
    const dockerAvailable = await this.isDockerAvailable();

    if (!dockerAvailable) {
      if (this.fallbackToSubprocess) {
        const subResult = await this.subprocessRunner.runCheck(checkName, command, {
          cwd: repoRoot,
          timeoutMs: this.resources.timeoutMs,
        });

        return {
          ...subResult,
          explanation: `${subResult.explanation} [Subprocess Fallback: Docker daemon unavailable]`,
        };
      }

      const durationMs = Date.now() - startTime;
      return {
        checkName,
        command,
        outcome: 'SKIPPED',
        exitCode: null,
        durationMs,
        stdout: '',
        stderr: 'Docker daemon is not responsive and subprocess fallback is disabled.',
        explanation: formatTruthfulExplanation(
          checkName,
          'SKIPPED',
          null,
          durationMs,
          'Docker daemon unavailable'
        ),
      };
    }

    // 3. Execute in Docker container
    const dockerArgs = this.buildDockerRunArgs(repoRoot, command);

    const execResult = await new Promise<CommandExecutionResult>((resolveExec) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      try {
        const proc = spawn(this.dockerBinary, dockerArgs, {
          shell: false,
          windowsHide: true,
        });

        if (this.resources.timeoutMs > 0) {
          timer = setTimeout(() => {
            timedOut = true;
            try {
              proc.kill('SIGKILL');
            } catch {
              // Ignore process kill errors
            }
          }, this.resources.timeoutMs);
        }

        proc.stdout?.on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
        });

        proc.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        proc.on('error', (err: Error) => {
          if (timer) clearTimeout(timer);
          resolveExec({
            command,
            args: dockerArgs,
            exitCode: null,
            stdout,
            stderr: err.message,
            durationMs: Date.now() - startTime,
            timedOut: false,
            error: err.message,
          });
        });

        proc.on('close', (code: number | null) => {
          if (timer) clearTimeout(timer);
          resolveExec({
            command,
            args: dockerArgs,
            exitCode: timedOut ? null : code,
            stdout,
            stderr,
            durationMs: Date.now() - startTime,
            timedOut,
          });
        });
      } catch (err) {
        if (timer) clearTimeout(timer);
        resolveExec({
          command,
          args: dockerArgs,
          exitCode: null,
          stdout,
          stderr: (err as Error).message,
          durationMs: Date.now() - startTime,
          timedOut: false,
          error: (err as Error).message,
        });
      }
    });

    const outcome = classifyExecutionOutcome(execResult);
    const explanation = formatTruthfulExplanation(
      checkName,
      outcome,
      execResult.exitCode,
      execResult.durationMs,
      execResult.error
    );

    return {
      checkName,
      command,
      outcome,
      exitCode: execResult.exitCode,
      durationMs: execResult.durationMs,
      stdout: execResult.stdout,
      stderr: execResult.stderr,
      explanation,
    };
  }

  /**
   * Executes a suite of checks sequentially inside Docker.
   */
  public async runSuite(
    input: VerificationSuiteInput,
    repoRoot: string
  ): Promise<VerificationSuiteResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    const checksList = Array.isArray(input) ? input : input.checks;
    const results: VerificationCheckResult[] = [];

    for (const item of checksList) {
      const res = await this.runCheck(item.name, item.command, repoRoot);
      results.push(res);
    }

    const durationMs = Date.now() - startTime;
    const passedCount = results.filter((c) => c.outcome === 'PASSED').length;
    const failedCount = results.filter((c) => c.outcome === 'FAILED' || c.outcome === 'ERROR').length;
    const timedOutCount = results.filter((c) => c.outcome === 'TIMED_OUT').length;
    const skippedCount = results.filter((c) => c.outcome === 'SKIPPED').length;

    const overallOutcome = classifySuiteOutcome(results);
    const passed = overallOutcome === 'PASSED';

    return {
      passed,
      totalChecks: results.length,
      passedCount,
      failedCount,
      timedOutCount,
      skippedCount,
      checks: results,
      overallOutcome,
      durationMs,
      timestamp,
    };
  }
}
