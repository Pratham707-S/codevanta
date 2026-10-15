/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/cli/commands/report.command.ts
 * Owner: Team Lead
 * Purpose: CLI command: repoguard report
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { RunStore } from '../../storage/index.js';
import { ReportBuilder } from '../../report/index.js';
import { formatSuccess, formatWarning, formatError, openInBrowser, formatFileUri } from '../formatter.js';
import { ReportCommandOptions } from '../options.js';

export async function runReportAction(
  runIdArg?: string,
  options: ReportCommandOptions = {}
): Promise<void> {
  try {
    const runStore = new RunStore();
    const record = runIdArg ? await runStore.getRun(runIdArg) : await runStore.getLatestRun();

    if (!record) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'No scan run record found' }));
      } else {
        console.log(formatWarning(runIdArg ? `No run record found matching ID "${runIdArg}".` : 'No previous scan runs found.'));
        console.log(`  Run ${chalk.cyan('repoguard scan')} first to generate audit evidence.`);
      }
      return;
    }

    const format = options.json ? 'json' : (options.format || 'html');
    const builder = new ReportBuilder(record, { outputDir: options.outputDir });

    if (format === 'json') {
      const jsonOutput = builder.buildJson();
      console.log(jsonOutput);
      return;
    }

    if (format === 'markdown') {
      const mdOutput = builder.buildMarkdown();
      console.log(mdOutput);
      return;
    }

    // Default or HTML: save report to disk
    const savedPaths = await builder.saveReports(options.outputDir, ['html', 'markdown']);
    console.log(formatSuccess(`Report successfully generated for run ${chalk.cyan(record.runId)}!`));
    if (savedPaths.htmlPath) {
      const uri = formatFileUri(savedPaths.htmlPath);
      console.log(`  🌐 HTML Report: ${chalk.underline.cyan(uri)}`);
      console.log(`     ${chalk.dim('(Cmd + Click link above to open directly in browser)')}`);

      if (options.open) {
        openInBrowser(savedPaths.htmlPath);
      }
    }
    if (savedPaths.markdownPath) {
      console.log(`  📄 Markdown:    ${chalk.dim(savedPaths.markdownPath)}`);
    }
  } catch (err: unknown) {
    const error = err as Error;
    if (options.json) {
      console.error(JSON.stringify({ status: 'error', message: error.message }));
    } else {
      console.error(formatError(`Failed to generate report: ${error.message}`));
    }
    process.exitCode = 1;
  }
}

export function registerReportCommand(program: Command): void {
  program
    .command('report [runId]')
    .description('Generate or view audit reports for a specific or latest scan')
    .option('--format <format>', 'Report format: html, markdown, or json', 'html')
    .option('--output-dir <path>', 'Custom directory to save report output')
    .option('--open', 'Open the HTML report automatically in your default browser')
    .action(async (runIdArg: string | undefined, _options: ReportCommandOptions, cmd: Command) => {
      const options = cmd.optsWithGlobals<ReportCommandOptions>();
      await runReportAction(runIdArg, options);
    });
}
