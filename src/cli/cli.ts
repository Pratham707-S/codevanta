/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/cli/cli.ts
 * Owner: Team Lead
 * Purpose: CLI entry and command registration
 */

import { Command } from 'commander';
import { renderStartupEffect, getStaticBanner } from './formatter.js';
import { registerInitCommand } from './commands/init.command.js';
import { registerScanCommand } from './commands/scan.command.js';
import { registerReportCommand } from './commands/report.command.js';
import { registerStatusCommand } from './commands/status.command.js';
import { registerReviewCommand } from './commands/review.command.js';

import { runInteractiveMode } from './interactive.js';

export function createCliProgram(version: string = '0.1.3'): Command {
  const program = new Command('repoguard');

  program
    .version(version, '-v, --version', 'Output the current version of RepoGuard')
    .description('Autonomous Code Reliability, Security & Verified Repair Platform 🛡️')
    .option('-c, --config <path>', 'Path to custom repoguard.config.json file')
    .option('--json', 'Output results in machine-readable JSON format')
    .option('--no-color', 'Disable terminal color output')
    .addHelpText('before', `\n${getStaticBanner(version)}\n`);

  // Register all CLI commands
  registerInitCommand(program);
  registerScanCommand(program);
  registerReportCommand(program);
  registerStatusCommand(program);
  registerReviewCommand(program);

  // Hook to display animated startup effect on non-json, interactive terminal runs
  program.hook('preAction', async (_thisCommand, actionCommand) => {
    const opts = actionCommand.optsWithGlobals();
    const isJson = Boolean(opts['json'] || opts['format'] === 'json');
    if (!isJson && actionCommand.name() !== 'help') {
      await renderStartupEffect({ version });
    }
  });

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const version = '0.1.3';
  const args = argv.slice(2);
  const program = createCliProgram(version);

  // Mode 1: Interactive Mode
  // If no arguments (or only --no-color flag) are passed, check for interactive TTY
  const isNoColorOnly = args.length === 1 && (args[0] === '--no-color' || args[0] === '--no-colors');
  if (args.length === 0 || isNoColorOnly) {
    const isInteractive = Boolean(
      process.stdout.isTTY &&
      process.stdin.isTTY &&
      process.env['CI'] !== 'true' &&
      process.env['NODE_ENV'] !== 'test'
    );

    if (isInteractive) {
      await runInteractiveMode({ version, program });
      return;
    }

    // In non-interactive terminals or CI environments, never block: output help cleanly
    program.outputHelp();
    return;
  }

  // Mode 2: Manual / Direct Mode
  await program.parseAsync(argv);
}
