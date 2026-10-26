/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/cli/commands/review.command.ts
 * Owner: Team Lead
 * Purpose: CLI command: repoguard review (Human-in-the-Loop Approval Gate & Intelligence Pipeline)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  RepairOrchestrator,
} from '../../repair/index.js';
import { type VerificationSuiteInput } from '../../verification/index.js';
import { RunStore } from '../../storage/run-store.js';
import {
  MockAdapter,
  GeminiAdapter,
  IAIProvider,
} from '../../providers/index.js';

export function registerReviewCommand(program: Command): void {
  program
    .command('review')
    .description('Review security findings and approve proposed repair candidates')
    .option('--yes', 'Automatically approve all patches without interactive confirmation')
    .option('--dry-run', 'Preview patches without touching disk or requesting approval')
    .option('--provider <provider>', 'AI provider to generate repairs (mock or gemini)', 'mock')
    .option('--verify', 'Run allowlisted verification checks after patch application')
    .option('--no-verify', 'Skip automated verification checks')
    .option('--check <cmd>', 'Explicit verification command to execute (e.g. "npm test")')
    .action(async (options: {
      yes?: boolean;
      dryRun?: boolean;
      provider?: string;
      verify?: boolean;
      check?: string;
    }) => {
      const runStore = new RunStore();
      const latest = await runStore.getLatestRun();
      const findings = latest?.findings || [];

      console.log(chalk.bold.cyan('\n🛡️  RepoGuard Human-in-the-Loop Review Gate\n'));

      if (!latest || findings.length === 0) {
        console.log(chalk.dim('No actionable security findings found in the latest scan.'));
        console.log(chalk.green('✔ Repository is clean. No patches required.\n'));
        return;
      }

      const finding = findings[0]!;

      // Provider configuration (never logs API keys)
      let provider: IAIProvider;
      if (options.provider === 'gemini') {
        if (!process.env.GEMINI_API_KEY) {
          console.log(
            chalk.yellow('⚠ GEMINI_API_KEY is not configured in environment. Falling back to deterministic MockAdapter.')
          );
          provider = new MockAdapter();
        } else {
          provider = new GeminiAdapter({ apiKey: process.env.GEMINI_API_KEY });
        }
      } else {
        provider = new MockAdapter();
      }

      // Verification suite configuration
      let verificationSuite: VerificationSuiteInput | undefined;
      const shouldVerify = options.verify !== false && (Boolean(options.check) || Boolean(options.verify));

      if (options.check) {
        verificationSuite = {
          name: 'CLI Post-Patch Verification',
          checks: [{ name: 'cli-check', command: options.check }],
        };
      }
      // When options.verify is true without --check, verificationSuite is undefined,
      // which allows RepairOrchestrator to automatically discover checks from package.json.

      const orchestrator = new RepairOrchestrator({
        autoApprove: options.yes,
        dryRun: options.dryRun,
        repoRoot: process.cwd(),
        provider,
        verificationSuite,
        runVerification: shouldVerify,
        autoRollbackOnVerificationFailure: true,
      });

      const result = await orchestrator.orchestrateFinding(
        {
          id: finding.id,
          category: finding.category,
          severity: finding.severity,
          title: finding.title,
          path: finding.path,
          lineRange: finding.lineRange,
          explanation: finding.explanation,
          evidence: finding.evidence,
        },
        {
          autoApprove: options.yes,
          dryRun: options.dryRun,
          repoRoot: process.cwd(),
          provider,
          verificationSuite,
          runVerification: shouldVerify,
          autoRollbackOnVerificationFailure: true,
        }
      );

      // In dry-run mode, render proposal preview if preview is available
      if (options.dryRun && result.preview) {
        console.log(result.preview);
      }

      // Output approval & execution results truthfully
      if (result.approved) {
        console.log(
          chalk.green(`\n✔ Patch REPAIR-${finding.id} explicitly APPROVED! Ready for sandbox verification.`)
        );

        if (result.applied) {
          console.log(chalk.green(`✔ Patch successfully applied to disk: ${result.filePath}\n`));
        } else if (result.status === 'ROLLED_BACK') {
          console.log(chalk.yellow(`↺ Patch was applied but rolled back due to verification failure: ${result.summary}\n`));
        } else if (result.status === 'ROLLBACK_FAILED') {
          console.log(
            chalk.red.bold(`🚨 CRITICAL: Patch verification failed and automatic rollback FAILED! Workspace may be dirty: ${result.summary}\n`)
          );
          if (result.rollbackErrors && result.rollbackErrors.length > 0) {
            result.rollbackErrors.forEach((err) => console.log(chalk.red(`   - ${err}`)));
          }
        } else {
          console.log(chalk.red(`✖ Patch application failed: ${result.summary}\n`));
        }

        // Verification reporting
        if (result.verificationResult) {
          if (result.verificationResult.overallOutcome === 'PASSED') {
            console.log(chalk.green(`✔ Automated verification PASSED (exit code 0).`));
          } else if (result.verificationResult.overallOutcome === 'TIMED_OUT') {
            console.log(chalk.red(`✖ Automated verification TIMED OUT.`));
          } else {
            console.log(chalk.red(`✖ Automated verification FAILED.`));
          }

          if (result.rollbackOccurred) {
            console.log(chalk.yellow(`↺ Workspace automatically rolled back to clean pre-patch state.\n`));
          } else if (result.status === 'ROLLBACK_FAILED') {
            console.log(chalk.red.bold(`🚨 Workspace rollback was INCOMPLETE. Manual intervention required.\n`));
          }
        } else if (options.verify === false) {
          console.log(chalk.dim(`ℹ Automated verification was skipped (--no-verify).\n`));
        }

        // Confidence calibration reporting
        if (result.confidence) {
          console.log(
            chalk.bold.cyan(
              `🛡️  Calibrated Confidence: ${Math.round(result.confidence.finalScore * 100)}% [${result.confidence.tier}]`
            )
          );
          console.log(chalk.dim(`   ${result.confidence.explanation}\n`));
        }
      } else if (result.status === 'SKIPPED') {
        console.log(chalk.blue(`\nℹ Patch application was skipped (dry-run mode).\n`));
      } else {
        console.log(
          chalk.yellow(`\n⚠ Patch was REJECTED (${result.approvalReason || result.summary}). Working tree unchanged.\n`)
        );
      }
    });
}
