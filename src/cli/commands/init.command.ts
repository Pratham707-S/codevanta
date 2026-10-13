/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/cli/commands/init.command.ts
 * Owner: Team Lead
 * Purpose: CLI command: repoguard init
 */

import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';
import { Command } from 'commander';
import { DEFAULT_CONFIG } from '../../config/schema.js';
import { formatSuccess, formatWarning, formatError } from '../formatter.js';
import { InitCommandOptions } from '../options.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize .repoguard configuration file in current repository')
    .option('-f, --force', 'Overwrite existing configuration file if it already exists')
    .action(async (options: InitCommandOptions) => {
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
            name: resolve(cwd).split('/').pop() || 'repoguard-project',
            root: '.',
          },
        };

        await fs.writeFile(configPath, JSON.stringify(templateConfig, null, 2), 'utf8');

        if (options.json) {
          console.log(JSON.stringify({ status: 'created', path: configPath }));
        } else {
          console.log(formatSuccess(`RepoGuard initialized! Configuration saved to ${configPath}`));
          console.log(`  Run ${'\x1b[36mrepoguard scan\x1b[0m'} to begin auditing your codebase.`);
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
    });
}
