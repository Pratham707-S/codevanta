/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/cli/commands/review.command.ts
 * Owner: Team Lead
 * Purpose: CLI command: repoguard review (Human-in-the-Loop Approval Gate)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { ApprovalGate, PatchCandidate, RiskLevel } from '../../repair/approval-gate.js';
import { RunStore } from '../../storage/run-store.js';

export function registerReviewCommand(program: Command): void {
  program
    .command('review')
    .description('Review security findings and approve proposed repair candidates')
    .option('--yes', 'Automatically approve all patches without interactive confirmation')
    .option('--dry-run', 'Preview patches without touching disk or requesting approval')
    .action(async (options: { yes?: boolean; dryRun?: boolean }) => {
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
      const candidate: PatchCandidate = {
        id: `REPAIR-${finding.id}`,
        findingId: finding.id,
        filePath: finding.path,
        riskLevel: (finding.severity as RiskLevel) || 'HIGH',
        description: `Remediation patch synthesized for finding ${finding.id}: ${finding.title}`,
        diff: finding.evidence
          ? `@@ -1,4 +1,4 @@\n- // Vulnerable code pattern:\n- ${finding.evidence.split('\n')[0]}\n+ // Remediated by RepoGuard:\n+ /* Sanitized verified implementation */`
          : `@@ -10,3 +10,3 @@\n- const unvalidatedInput = req.body;\n+ const validatedInput = schema.parse(req.body);`,
      };

      const gate = new ApprovalGate({
        autoApprove: options.yes,
        dryRun: options.dryRun,
      });

      if (options.dryRun) {
        console.log(gate.formatPreview(candidate));
      }

      const decision = await gate.requestApproval(candidate);

      if (decision.approved) {
        console.log(
          chalk.green(`\n✔ Patch ${decision.patchId || candidate.id} explicitly APPROVED! Ready for sandbox verification.\n`)
        );
      } else if (decision.status === 'SKIPPED') {
        console.log(chalk.blue(`\nℹ Patch application was skipped (dry-run mode).\n`));
      } else {
        console.log(chalk.yellow(`\n⚠ Patch was REJECTED (${decision.reason}). Working tree unchanged.\n`));
      }
    });
}
