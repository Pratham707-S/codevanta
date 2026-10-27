/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/verification/verification-orchestrator.ts
 * Owner: Pratham
 * Purpose: Verification workflow: coordinate check execution, auto-discovery, and cleanup
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  CheckRunner,
  CheckRunnerOptions,
  VerificationSuiteInput,
  RunCommandOptions,
} from './check-runner.js';
import {
  VerificationCheckResult,
  VerificationSuiteResult,
} from '../domain/verification.js';
import { classifySuiteOutcome } from './result-classifier.js';
import { DockerRunner, type DockerRunnerOptions } from './sandbox/docker-runner.js';

export interface IVerificationRunner {
  runCheck(
    checkName: string,
    command: string,
    options?: RunCommandOptions
  ): Promise<VerificationCheckResult>;
  runSuite?(
    input: VerificationSuiteInput,
    options?: RunCommandOptions
  ): Promise<VerificationSuiteResult>;
}

export type VerificationExecutionMode = 'subprocess' | 'docker';

export interface VerificationCheckDefinition {
  name: string;
  command: string;
  optional?: boolean;
}

export interface VerificationOrchestratorOptions extends CheckRunnerOptions {
  failFast?: boolean;
  runner?: IVerificationRunner;
  executionMode?: VerificationExecutionMode;
  dockerOptions?: DockerRunnerOptions;
  onCheckStart?: (check: VerificationCheckDefinition) => void;
  onCheckComplete?: (result: VerificationCheckResult) => void;
}

export interface AutoDiscoverOptions {
  includeLint?: boolean;
  includeTypecheck?: boolean;
  includeBuild?: boolean;
  includeTest?: boolean;
}

/**
 * Redacts recognized secrets from stdout/stderr to prevent sensitive credentials
 * from leaking into reports or storage.
 */
function sanitizeVerificationOutput(text: string): string {
  if (!text) return '';
  return text
    .replace(/(AKIA)[0-9A-Z]{16,28}/g, '$1****************')
    .replace(/(gh[pousr]_)[A-Za-z0-9_]{30,}/g, '$1********************************')
    .replace(
      /((?:api_?key|jwt_?secret|auth_?token|client_?secret|password|passwd|secret)\s*[:=]\s*["'])[A-Za-z0-9_\-]{8,}(["'])/gi,
      '$1[REDACTED_SECRET]$2'
    );
}

export class VerificationOrchestrator {
  private readonly runner: IVerificationRunner;
  private readonly options: VerificationOrchestratorOptions;

  constructor(options: VerificationOrchestratorOptions = {}) {
    this.options = options;
    if (options.runner) {
      this.runner = options.runner;
    } else if (options.executionMode === 'docker') {
      this.runner = new DockerRunner(options.dockerOptions);
    } else {
      this.runner = new CheckRunner(options);
    }
  }

  /**
   * Returns the configured verification runner instance.
   */
  public getRunner(): IVerificationRunner {
    return this.runner;
  }

  /**
   * Automatically discovers safe verification commands based on package.json in the target directory.
   */
  public async autoDiscoverChecks(
    repoRoot: string,
    discoverOptions: AutoDiscoverOptions = {}
  ): Promise<VerificationCheckDefinition[]> {
    const checks: VerificationCheckDefinition[] = [];
    const pkgPath = join(repoRoot, 'package.json');

    try {
      const content = await fs.readFile(pkgPath, 'utf8');
      const pkg = JSON.parse(content) as { scripts?: Record<string, string> };
      const scripts = pkg.scripts || {};

      const includeTypecheck = discoverOptions.includeTypecheck ?? true;
      const includeLint = discoverOptions.includeLint ?? true;
      const includeTest = discoverOptions.includeTest ?? true;
      const includeBuild = discoverOptions.includeBuild ?? false;

      if (includeTypecheck && scripts.typecheck) {
        checks.push({
          name: 'Typecheck',
          command: 'npm run typecheck',
        });
      }

      if (includeLint && scripts.lint) {
        checks.push({
          name: 'Lint',
          command: 'npm run lint',
        });
      }

      if (includeTest && scripts.test) {
        checks.push({
          name: 'Unit Tests',
          command: 'npm test',
        });
      }

      if (includeBuild && scripts.build) {
        checks.push({
          name: 'Build',
          command: 'npm run build',
        });
      }
    } catch {
      // If package.json is missing or invalid, fall back to default test check
    }

    if (checks.length === 0) {
      checks.push({
        name: 'Default Test Check',
        command: 'npm test',
      });
    }

    return checks;
  }

  /**
   * Executes a full verification workflow with optional fail-fast and lifecycle callbacks.
   */
  public async verify(
    checksOrInput: VerificationSuiteInput | VerificationCheckDefinition[],
    overrideOptions: Partial<VerificationOrchestratorOptions> = {}
  ): Promise<VerificationSuiteResult> {
    const opts: VerificationOrchestratorOptions = { ...this.options, ...overrideOptions };
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    const normalizedChecks: VerificationCheckDefinition[] = Array.isArray(checksOrInput)
      ? checksOrInput
      : checksOrInput.checks;

    const checkResults: VerificationCheckResult[] = [];

    for (let i = 0; i < normalizedChecks.length; i++) {
      const check = normalizedChecks[i]!;
      if (opts.onCheckStart) {
        opts.onCheckStart(check);
      }

      const rawResult = await this.runner.runCheck(check.name, check.command, {
        cwd: opts.cwd,
        timeoutMs: opts.defaultTimeoutMs,
      });

      // Redact any secrets leaked into stdout or stderr
      const sanitizedResult: VerificationCheckResult = {
        ...rawResult,
        optional: check.optional,
        stdout: sanitizeVerificationOutput(rawResult.stdout),
        stderr: sanitizeVerificationOutput(rawResult.stderr),
      };

      checkResults.push(sanitizedResult);

      if (opts.onCheckComplete) {
        opts.onCheckComplete(sanitizedResult);
      }

      // If failFast is active and a non-optional check failed, mark remaining checks as SKIPPED and abort
      if (opts.failFast && !check.optional && sanitizedResult.outcome !== 'PASSED') {
        for (let j = i + 1; j < normalizedChecks.length; j++) {
          const remainingCheck = normalizedChecks[j]!;
          const skippedResult: VerificationCheckResult = {
            checkName: remainingCheck.name,
            command: remainingCheck.command,
            optional: remainingCheck.optional,
            outcome: 'SKIPPED',
            exitCode: null,
            durationMs: 0,
            stdout: '',
            stderr: '',
            explanation: `Check "${remainingCheck.name}" was skipped due to earlier failure of check "${check.name}" with outcome ${sanitizedResult.outcome} (fail-fast active).`,
          };
          checkResults.push(skippedResult);
          if (opts.onCheckComplete) {
            opts.onCheckComplete(skippedResult);
          }
        }
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    const passedCount = checkResults.filter((c) => c.outcome === 'PASSED').length;
    const failedCount = checkResults.filter((c) => c.outcome === 'FAILED' || c.outcome === 'ERROR').length;
    const timedOutCount = checkResults.filter((c) => c.outcome === 'TIMED_OUT').length;
    const skippedCount = checkResults.filter((c) => c.outcome === 'SKIPPED').length;

    const overallOutcome = classifySuiteOutcome(checkResults);
    const passed = overallOutcome === 'PASSED';

    return {
      passed,
      totalChecks: checkResults.length,
      passedCount,
      failedCount,
      timedOutCount,
      skippedCount,
      checks: checkResults,
      overallOutcome,
      durationMs,
      timestamp,
    };
  }

  /**
   * Generates a clean human-readable text summary of verification results.
   */
  public formatSummary(suiteResult: VerificationSuiteResult): string {
    const lines: string[] = [];
    const icon = suiteResult.passed ? '✔' : '✖';
    const statusText = suiteResult.passed ? 'VERIFICATION PASSED' : 'VERIFICATION FAILED';

    lines.push(`=== ${icon} ${statusText} (${suiteResult.durationMs}ms) ===`);
    lines.push(
      `Total Checks: ${suiteResult.totalChecks} | Passed: ${suiteResult.passedCount} | Failed: ${suiteResult.failedCount} | Timed Out: ${suiteResult.timedOutCount}`
    );

    for (const check of suiteResult.checks) {
      const checkIcon = check.outcome === 'PASSED' ? '✔' : '✖';
      lines.push(
        `  ${checkIcon} [${check.outcome}] ${check.checkName} (${check.durationMs}ms) - ${check.explanation}`
      );
    }

    return lines.join('\n');
  }
}
