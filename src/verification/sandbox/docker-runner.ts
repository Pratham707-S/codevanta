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
  RunCommandOptions,
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
  validateMountPath,
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
    // Hard security invariant: host fallback disabled by default
    this.fallbackToSubprocess = options.fallbackToSubprocess ?? false;
    this.dockerBinary = options.dockerBinary ?? 'docker';
    this.subprocessRunner =
      options.subprocessRunner ??
      new CheckRunner({
        defaultTimeoutMs: this.resources.timeoutMs,
      });
  }

  /**
   * Health check for Docker engine: verifies daemon responsiveness using `docker info`.
   */
  public async isDockerAvailable(timeoutMs = 3000): Promise<boolean> {
    return new Promise<boolean>((resolveCheck) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const proc = spawn(this.dockerBinary, ['info'], {
          shell: false,
          windowsHide: true,
        });

        timer = setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {
            // ignore
          }
          resolveCheck(false);
        }, timeoutMs);

        proc.on('error', () => {
          if (timer) clearTimeout(timer);
          resolveCheck(false);
        });

        proc.on('close', (code) => {
          if (timer) clearTimeout(timer);
          resolveCheck(code === 0);
        });
      } catch {
        if (timer) clearTimeout(timer);
        resolveCheck(false);
      }
    });
  }

  /**
   * Forces stop and removal of a container by name, reporting cleanup outcomes truthfully.
   */
  public async cleanupContainer(
    containerName: string
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolveCleanup) => {
      try {
        const rmProc = spawn(this.dockerBinary, ['rm', '-f', containerName], {
          shell: false,
          timeout: 5000,
          windowsHide: true,
        });

        let errOutput = '';
        rmProc.stderr?.on('data', (d: Buffer) => {
          errOutput += d.toString();
        });

        rmProc.on('error', (err) => {
          resolveCleanup({
            success: false,
            error: `Failed to invoke container cleanup (${err.message})`,
          });
        });

        rmProc.on('close', (code) => {
          if (code === 0 || errOutput.includes('No such container') || errOutput.includes('not found')) {
            resolveCleanup({ success: true });
          } else {
            resolveCleanup({
              success: false,
              error: `Container cleanup exited with code ${code}: ${errOutput.trim()}`,
            });
          }
        });
      } catch (err) {
        resolveCleanup({
          success: false,
          error: (err as Error).message,
        });
      }
    });
  }

  /**
   * Constructs the full argument array for `docker run`.
   */
  public buildDockerRunArgs(
    hostRepoPath: string,
    command: string,
    containerName?: string
  ): string[] {
    // Validate host mount path security
    const mountCheck = validateMountPath(hostRepoPath);
    if (!mountCheck.safe) {
      throw new Error(`Insecure mount rejected: ${mountCheck.reason}`);
    }

    const normalizedHost = resolve(hostRepoPath).replace(/\\/g, '/');
    const commandTokens = tokenizeCommandLine(command);

    const resourceArgs = formatDockerResourceArgs(this.resources);
    const securityArgs = formatDockerSecurityArgs(this.policy);

    const args: string[] = [
      'run',
      '--rm',
      '-i',
      `--workdir=${this.workdir}`,
      `-v=${normalizedHost}:${this.workdir}:rw`,
      ...resourceArgs,
      ...securityArgs,
    ];

    if (containerName) {
      args.push(`--name=${containerName}`);
    }

    args.push(this.image, ...commandTokens);

    return args;
  }

  /**
   * Runs a single verification check inside a disposable Docker container.
   * Compatible with CheckRunner.runCheck signature.
   */
  public async runCheck(
    checkName: string,
    command: string,
    optionsOrRepoRoot?: RunCommandOptions | string
  ): Promise<VerificationCheckResult> {
    const startTime = Date.now();

    const repoRoot =
      typeof optionsOrRepoRoot === 'string'
        ? optionsOrRepoRoot
        : optionsOrRepoRoot?.cwd ?? process.cwd();

    const timeoutMs =
      typeof optionsOrRepoRoot === 'object' && optionsOrRepoRoot.timeoutMs !== undefined
        ? optionsOrRepoRoot.timeoutMs
        : this.resources.timeoutMs;

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

    // 2. Validate host mount path security (block docker sockets / root mounts)
    const mountValidation = validateMountPath(repoRoot);
    if (!mountValidation.safe) {
      const durationMs = Date.now() - startTime;
      return {
        checkName,
        command,
        outcome: 'ERROR',
        exitCode: 1,
        durationMs,
        stdout: '',
        stderr: mountValidation.reason!,
        explanation: formatTruthfulExplanation(
          checkName,
          'ERROR',
          1,
          durationMs,
          mountValidation.reason
        ),
      };
    }

    // 3. Health check Docker daemon availability
    const dockerAvailable = await this.isDockerAvailable();

    if (!dockerAvailable) {
      if (this.fallbackToSubprocess) {
        const subResult = await this.subprocessRunner.runCheck(checkName, command, {
          cwd: repoRoot,
          timeoutMs,
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
        stderr: 'Docker daemon is not responsive/available and host fallback is disabled by default.',
        explanation: formatTruthfulExplanation(
          checkName,
          'SKIPPED',
          null,
          durationMs,
          'Docker daemon unavailable (host fallback disabled)'
        ),
      };
    }

    // 4. Generate unique container name for lifecycle management
    const uniqueContainerName = `repoguard-sandbox-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    let dockerArgs: string[];
    try {
      dockerArgs = this.buildDockerRunArgs(repoRoot, command, uniqueContainerName);
    } catch (err) {
      const durationMs = Date.now() - startTime;
      return {
        checkName,
        command,
        outcome: 'ERROR',
        exitCode: 1,
        durationMs,
        stdout: '',
        stderr: (err as Error).message,
        explanation: formatTruthfulExplanation(
          checkName,
          'ERROR',
          1,
          durationMs,
          (err as Error).message
        ),
      };
    }

    let cleanupWarning = '';

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

        if (timeoutMs > 0) {
          timer = setTimeout(async () => {
            timedOut = true;
            try {
              proc.kill('SIGKILL');
            } catch {
              // Ignore process kill errors
            }

            // Ensure timed-out container is explicitly stopped and removed
            const cleanup = await this.cleanupContainer(uniqueContainerName);
            if (!cleanup.success) {
              cleanupWarning = ` (Container cleanup failed: ${cleanup.error})`;
            }
          }, timeoutMs);
        }

        proc.stdout?.on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
        });

        proc.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        proc.on('error', async (err: Error) => {
          if (timer) clearTimeout(timer);
          const cleanup = await this.cleanupContainer(uniqueContainerName);
          if (!cleanup.success) {
            cleanupWarning = ` (Container cleanup failed: ${cleanup.error})`;
          }
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
    const baseExplanation = formatTruthfulExplanation(
      checkName,
      outcome,
      execResult.exitCode,
      execResult.durationMs,
      execResult.error
    );

    const explanation = cleanupWarning ? `${baseExplanation}${cleanupWarning}` : baseExplanation;
    const stderr = cleanupWarning ? `${execResult.stderr}\n[Cleanup Error]: ${cleanupWarning.trim()}` : execResult.stderr;

    return {
      checkName,
      command,
      outcome,
      exitCode: execResult.exitCode,
      durationMs: execResult.durationMs,
      stdout: execResult.stdout,
      stderr,
      explanation,
    };
  }

  /**
   * Executes a suite of checks sequentially inside Docker.
   */
  public async runSuite(
    input: VerificationSuiteInput,
    optionsOrRepoRoot?: RunCommandOptions | string
  ): Promise<VerificationSuiteResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    const checksList = Array.isArray(input) ? input : input.checks;
    const results: VerificationCheckResult[] = [];

    for (const item of checksList) {
      const res = await this.runCheck(item.name, item.command, optionsOrRepoRoot);
      if (item.optional !== undefined) {
        res.optional = item.optional;
      }
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
