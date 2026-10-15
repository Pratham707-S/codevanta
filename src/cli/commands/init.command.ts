/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/cli/commands/init.command.ts
 * Owner: Team Lead
 * Purpose: CLI command: repoguard init
 */

import { promises as fs } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { DEFAULT_CONFIG } from '../../config/schema.js';
import { formatSuccess, formatWarning, formatError } from '../formatter.js';
import { InitCommandOptions } from '../options.js';

/**
 * Extracts a normalized project name from a directory path across POSIX and Windows.
 */
export function extractProjectName(cwdPath: string): string {
  const normalized = resolve(cwdPath).replace(/\\/g, '/');
  const name = basename(normalized);
  return name && name !== '.' && name !== '/' ? name : 'repoguard-project';
}

export async function runInitAction(
  options: InitCommandOptions = {}
): Promise<void> {
  const cwd = process.cwd();
  const repoguardDir = resolve(cwd, '.repoguard');
  const configPath = join(repoguardDir, 'config.json');

  try {
    await fs.mkdir(repoguardDir, { recursive: true });

    // Check if config already exists
    let exists = false;
    try {
      await fs.access(configPath);
      exists = true;
    } catch {
      exists = false;
    }

    if (exists && !options.force) {
      if (options.json) {
        console.log(JSON.stringify({ status: 'skipped', reason: 'Configuration already exists', path: configPath }));
      } else {
        console.log(formatWarning(`Configuration already exists at ${configPath}. Use --force to overwrite.`));
      }
      return;
    }

    const templateConfig = {
      $schema: 'https://repoguard.dev/schema.json',
      ...DEFAULT_CONFIG,
      project: {
        ...DEFAULT_CONFIG.project,
        name: extractProjectName(cwd),
        root: '.',
      },
    };

    await fs.writeFile(configPath, JSON.stringify(templateConfig, null, 2), 'utf8');

    if (options.json) {
      console.log(JSON.stringify({ status: 'created', path: configPath }));
    } else {
      console.log(formatSuccess(`RepoGuard initialized! Configuration saved to ${configPath}`));
      console.log(`  Run ${chalk.cyan('repoguard scan')} to begin auditing your codebase.`);
    }
  } catch (err: unknown) {
    const error = err as Error;
    if (options.json) {
      console.error(JSON.stringify({ status: 'error', message: error.message }));
    } else {
      console.error(formatError(`Failed to initialize RepoGuard: ${error.message}`));
    }
    process.exitCode = 1;
  }
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize .repoguard configuration file in current repository')
    .option('-f, --force', 'Overwrite existing configuration file if it already exists')
    .action(async (_options: InitCommandOptions, cmd: Command) => {
      const options = cmd.optsWithGlobals<InitCommandOptions>();
      await runInitAction(options);
    });
}
