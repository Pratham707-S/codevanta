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

export function createCliProgram(version: string = '0.1.0'): Command {
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

  // Hook to display animated startup effect on non-json, interactive terminal runs
  program.hook('preAction', async (thisCommand, actionCommand) => {
    const opts = thisCommand.opts();
    if (!opts['json'] && actionCommand.name() !== 'help') {
      await renderStartupEffect({ version });
    }
  });

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = createCliProgram('0.1.0');
  await program.parseAsync(argv);
}
