/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/cli/commands/status.command.ts
 * Owner: Team Lead
 * Purpose: CLI command: repoguard status
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { StateStore, RunStore } from '../../storage/index.js';
import { formatWarning, formatError } from '../formatter.js';
import { StatusCommandOptions } from '../options.js';

export async function runStatusAction(
  options: StatusCommandOptions = {}
): Promise<void> {
  try {
    const stateStore = new StateStore();
    const runStore = new RunStore();

    const state = await stateStore.loadState();
    const history = await stateStore.getHistory();

    if (options.json) {
      console.log(JSON.stringify({ state, history }, null, 2));
      return;
    }

    console.log(chalk.bold.white('\n🛡️  RepoGuard Repository Status'));
    console.log(chalk.dim('─────────────────────────────────────────────'));

    if (!state.lastRunId) {
      console.log(formatWarning('No scan history recorded yet for this repository.'));
      console.log(`  Run ${chalk.cyan('repoguard scan')} to perform your first audit.\n`);
      return;
    }

    console.log(`  ${chalk.dim('Last Run ID:')}       ${chalk.cyan(state.lastRunId)}`);
    console.log(`  ${chalk.dim('Last Scanned:')}      ${chalk.white(state.lastScanTimestamp || 'N/A')}`);
    console.log(`  ${chalk.dim('Total Scans Run:')}   ${chalk.white(history.length)}`);

    const latestRun = await runStore.getLatestRun();
    if (latestRun) {
      console.log(`  ${chalk.dim('Files Scanned:')}     ${chalk.white(latestRun.filesScanned)}`);
      console.log(`  ${chalk.dim('Active Findings:')}   ${latestRun.findingsCount > 0 ? chalk.red.bold(latestRun.findingsCount) : chalk.green.bold('0 (Clean)')}`);
    }

    if (options.history && history.length > 0) {
      console.log(chalk.bold.white('\n📜 Recent Scans History:'));
      history.slice(0, 10).forEach((entry, idx) => {
        const time = entry.timestamp.split('T')[0] || entry.timestamp;
        const findingsStr = entry.findingsCount > 0 ? chalk.red(`${entry.findingsCount} findings`) : chalk.green('Clean');
        console.log(`  ${idx + 1}. [${time}] ${chalk.cyan(entry.runId)} — ${findingsStr}`);
      });
    }

    console.log('');
  } catch (err: unknown) {
    const error = err as Error;
    if (options.json) {
      console.error(JSON.stringify({ status: 'error', message: error.message }));
    } else {
      console.error(formatError(`Failed to fetch status: ${error.message}`));
    }
    process.exitCode = 1;
  }
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show repository audit status and recent scan history')
    .option('--history', 'Display detailed history of recent scans')
    .action(async (_options: StatusCommandOptions, cmd: Command) => {
      const options = cmd.optsWithGlobals<StatusCommandOptions>();
      await runStatusAction(options);
    });
}
