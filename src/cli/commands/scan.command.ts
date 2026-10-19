/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/cli/commands/scan.command.ts
 * Owner: Team Lead
 * Purpose: CLI command: repoguard scan
 */

import { resolve } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../../config/index.js';
import { RunStore, StateStore, ScanRunRecord } from '../../storage/index.js';
import { ReportBuilder } from '../../report/index.js';
import { RuleRunner } from '../../analysis/rules/index.js';
import { walkSourceFiles } from '../../repository/index.js';
import {
  formatStep,
  formatSuccess,
  formatError,
  formatSummaryTable,
  openInBrowser,
  formatFileUri,
  createSpinner,
  formatProgressBar,
} from '../formatter.js';
import { ScanCommandOptions } from '../options.js';

export const VALID_SCAN_FORMATS = ['summary', 'json', 'html', 'markdown'] as const;
export type ScanOutputFormat = (typeof VALID_SCAN_FORMATS)[number];

export async function runScanAction(
  targetArg?: string,
  options: ScanCommandOptions = {}
): Promise<void> {
  const rawFormat = (options.format || 'summary').toLowerCase();

  // Validate format parameter
  if (!VALID_SCAN_FORMATS.includes(rawFormat as ScanOutputFormat)) {
    const errorMsg = `Invalid output format "${options.format}". Supported formats are: ${VALID_SCAN_FORMATS.join(', ')}`;
    if (options.json) {
      console.error(JSON.stringify({ status: 'error', message: errorMsg }));
    } else {
      console.error(formatError(errorMsg, "Run 'repoguard scan --help' to inspect valid format options"));
    }
    process.exitCode = 1;
    return;
  }

  const format = rawFormat as ScanOutputFormat;
  const isJsonOutput = Boolean(options.json || format === 'json');
  const startTime = Date.now();
  const targetDir = resolve(targetArg || process.cwd());

  try {
    let spinner: ReturnType<typeof createSpinner> | undefined;

    if (!isJsonOutput) {
      console.log(`\n${chalk.bold.hex('#38bdf8')('🛡️  Scanning repository:')} ${chalk.white(targetDir)}`);
      spinner = createSpinner('Loading repository configuration...').start();
    }

    // 1. Load configuration
    const config = await loadConfig({
      cwd: targetDir,
      configPath: options.config,
      cliOverrides: {
        timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
      },
    });

    if (!isJsonOutput && spinner) {
      spinner.succeed(formatStep(1, 4, `Configuration loaded (${chalk.dim(config.project.name)})`));
      spinner = createSpinner('Discovering repository files...').start();
    }

    // 2. Discover and ingest candidate source files safely
    const walkResult = await walkSourceFiles(targetDir, {
      maxFileSize: config.scan.maxFileSize,
    });
    const candidateFiles = walkResult.files;
    const filesScanned = candidateFiles.length;

    // 3. Execute RuleRunner against candidate files
    const runner = new RuleRunner();
    const findings = await runner.evaluateFiles(candidateFiles);
    const hasSecrets = findings.some((f) => f.category.includes('Secret') || f.id.startsWith('SEC-001'));

    if (!isJsonOutput && spinner) {
      const progressBar = formatProgressBar(filesScanned, Math.max(filesScanned, 1));
      spinner.succeed(formatStep(2, 4, `Ingested ${chalk.bold(filesScanned)} source files safely ${progressBar}`));
      if (hasSecrets) {
        console.log(formatStep(3, 4, `Secret redaction active: ${chalk.green('Protected credentials in findings evidence')}`));
      } else {
        console.log(formatStep(3, 4, `Static security analysis active: ${chalk.cyan('4 deterministic rules evaluated')}`));
      }
      spinner = createSpinner('Synthesizing audit findings & generating reports...').start();
    }

    // 4. Prepare scan record
    const runStore = new RunStore(config.storage.stateDir, targetDir);
    const stateStore = new StateStore(config.storage.stateDir, targetDir);
    const runId = runStore.generateRunId();
    const durationMs = Date.now() - startTime;

    const summary = {
      critical: findings.filter((f) => f.severity === 'CRITICAL').length,
      high: findings.filter((f) => f.severity === 'HIGH').length,
      medium: findings.filter((f) => f.severity === 'MEDIUM').length,
      low: findings.filter((f) => f.severity === 'LOW').length,
      info: findings.filter((f) => f.severity === 'INFO').length,
    };

    const record: ScanRunRecord = {
      runId,
      timestamp: new Date().toISOString(),
      projectName: config.project.name,
      repositoryRoot: targetDir,
      filesScanned,
      findingsCount: findings.length,
      durationMs,
      summary,
      findings,
    };

    // 5. Save to Storage and generate reports
    await runStore.saveRun(record);
    await stateStore.recordRun(record);

    // Determine which report file formats to persist to disk based on --format
    let formatsToSave: ('markdown' | 'json' | 'html')[];
    switch (format) {
      case 'html':
        formatsToSave = ['html'];
        break;
      case 'markdown':
        formatsToSave = ['markdown'];
        break;
      case 'json':
        formatsToSave = ['json'];
        break;
      case 'summary':
      default:
        formatsToSave = ['html', 'markdown'];
        break;
    }

    const reportsDir = options.outputDir || resolve(targetDir, config.storage.reportsDir);
    const history = await runStore.getHistory(10);
    const previousRun = await runStore.getPreviousRun(record.runId);

    const builder = new ReportBuilder(record, {
      outputDir: reportsDir,
      history,
      previousRecord: previousRun ?? undefined,
    });
    const savedReports = await builder.saveReports(reportsDir, formatsToSave);

    if (!isJsonOutput) {
      if (spinner) {
        spinner.succeed(formatStep(4, 4, 'Audit findings synthesized & stored'));
      } else {
        console.log(formatStep(4, 4, 'Audit findings synthesized & stored'));
      }
      console.log('');
      console.log(formatSummaryTable(record.summary));
      console.log('');

      if (walkResult.unreadableFiles.length > 0) {
        console.log(
          chalk.yellow(`  ⚠ Warning: ${walkResult.unreadableFiles.length} file(s) could not be read due to permissions or I/O errors.`)
        );
      }

      if (findings.length === 0) {
        if (walkResult.unreadableFiles.length > 0) {
          console.log(chalk.yellow(`  ⚠ Scan completed in ${durationMs}ms: 0 findings in ${filesScanned} readable files (${walkResult.unreadableFiles.length} unreadable).`));
        } else {
          console.log(formatSuccess(`Scan completed cleanly in ${durationMs}ms with 0 critical findings!`));
        }
      } else {
        console.log(
          chalk.yellow.bold(
            `  ⚠ Scan completed in ${durationMs}ms: ${findings.length} finding(s) detected (${summary.critical} critical, ${summary.high} high). Run 'repoguard review' to inspect.`
          )
        );
      }

      if (savedReports.htmlPath) {
        const uri = formatFileUri(savedReports.htmlPath);
        const encodedUri = `file://${encodeURI(savedReports.htmlPath)}`;
        const clickable = `\u001b]8;;${encodedUri}\u001b\\${chalk.underline.cyan(uri)}\u001b]8;;\u001b\\`;
        console.log(`  🌐 HTML Report: ${clickable}`);
        console.log(`     ${chalk.dim('(Cmd + Click link above or run with --open to launch browser)')}`);

        if (options.open) {
          openInBrowser(savedReports.htmlPath);
        }
      }
      if (savedReports.markdownPath) {
        console.log(`  📄 Markdown:    ${chalk.dim(savedReports.markdownPath)}`);
      }
      if (savedReports.jsonPath) {
        console.log(`  📦 JSON Report: ${chalk.dim(savedReports.jsonPath)}`);
      }
      console.log('');
    } else {
      console.log(JSON.stringify(record, null, 2));
    }
  } catch (err: unknown) {
    const error = err as Error;
    if (isJsonOutput) {
      console.error(JSON.stringify({ status: 'error', message: error.message }));
    } else {
      console.error(formatError(`Scan failed: ${error.message}`, "Check repository path or run 'repoguard scan --help'"));
    }
    process.exitCode = 1;
  }
}

export function registerScanCommand(program: Command): void {
  program
    .command('scan [target]')
    .description('Scan repository codebase for reliability bugs, vulnerabilities, and secrets')
    .option('-t, --timeout <ms>', 'Verification execution timeout in milliseconds')
    .option('--format <format>', 'Output format: summary, json, html, markdown', 'summary')
    .option('--output-dir <path>', 'Custom directory to save report artifacts')
    .option('--open', 'Open the generated HTML report automatically in your default browser')
    .action(async (targetArg: string | undefined, _options: ScanCommandOptions, cmd: Command) => {
      const options = cmd.optsWithGlobals<ScanCommandOptions>();
      await runScanAction(targetArg, options);
    });
}