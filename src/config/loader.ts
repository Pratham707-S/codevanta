/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/config/loader.ts
 * Owner: Ayan
 * Purpose: Configuration loader: load from disk, resolve paths, apply CLI overrides and environment variables
 */

import { promises as fs } from 'node:fs';
import { isAbsolute, resolve, join, dirname } from 'node:path';
import dotenv from 'dotenv';
import {
  DEFAULT_CONFIG,
  RepoGuardConfig,
  ConfigValidationError,
  validateConfig,
} from './schema.js';

export const CONFIG_CANDIDATES = [
  'repoguard.config.json',
  '.repoguard/config.json',
  '.repoguardrc.json',
  '.repoguardrc',
] as const;

export interface CliConfigOverrides {
  configPath?: string;
  projectName?: string;
  target?: string;
  timeout?: number;
  maxFileSize?: number;
  redactSecrets?: boolean;
  provider?: 'gemini' | 'mock';
  model?: string;
  allowedCommands?: string[];
}

export interface LoadConfigOptions {
  cwd?: string;
  configPath?: string;
  cliOverrides?: CliConfigOverrides;
  loadEnv?: boolean;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>
): T {
  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(target)) {
    if (Array.isArray(val)) {
      result[key] = [...val];
    } else if (isPlainObject(val)) {
      result[key] = deepMerge(val as Record<string, unknown>, {});
    } else {
      result[key] = val;
    }
  }

  for (const [key, val] of Object.entries(source)) {
    if (val === undefined) {
      continue;
    }
    const targetVal = result[key];
    if (isPlainObject(targetVal) && isPlainObject(val)) {
      result[key] = deepMerge(targetVal, val);
    } else if (Array.isArray(val)) {
      result[key] = [...val];
    } else {
      result[key] = val;
    }
  }
  return result as T;
}

/**
 * Searches upward from startDir for a configuration file matching candidate names.
 */
export async function findConfigFile(startDir: string = process.cwd()): Promise<string | null> {
  let currentDir = resolve(startDir);
  const root = resolve('/');

  while (true) {
    for (const candidate of CONFIG_CANDIDATES) {
      const candidatePath = join(currentDir, candidate);
      try {
        const stats = await fs.stat(candidatePath);
        if (stats.isFile()) {
          return candidatePath;
        }
      } catch {
        // File does not exist in this directory; continue
      }
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir || currentDir === root) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * Loads and parses a JSON config file from disk.
 */
export async function loadConfigFile(filePath: string): Promise<Record<string, unknown>> {
  const resolvedPath = resolve(filePath);
  let content: string;

  try {
    content = await fs.readFile(resolvedPath, 'utf8');
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new ConfigValidationError(`Configuration file not found: "${resolvedPath}"`);
    }
    throw new ConfigValidationError(
      `Failed to read configuration file "${resolvedPath}": ${err.message}`
    );
  }

  try {
    const parsed = JSON.parse(content);
    if (!isPlainObject(parsed)) {
      throw new ConfigValidationError(
        `Configuration at "${resolvedPath}" must be a JSON object, received ${typeof parsed}.`
      );
    }
    return parsed;
  } catch (error: unknown) {
    if (error instanceof ConfigValidationError) {
      throw error;
    }
    const err = error as Error;
    throw new ConfigValidationError(
      `Invalid JSON syntax in configuration file "${resolvedPath}": ${err.message}`
    );
  }
}

/**
 * Extracts environment variable overrides.
 */
export function extractEnvOverrides(): Record<string, unknown> {
  const envOverrides: Record<string, unknown> = {};

  if (process.env['REPOGUARD_PROJECT_NAME']) {
    envOverrides['project'] = {
      ...(isPlainObject(envOverrides['project']) ? envOverrides['project'] : {}),
      name: process.env['REPOGUARD_PROJECT_NAME'],
    };
  }

  if (process.env['REPOGUARD_ROOT'] || process.env['REPOGUARD_TARGET']) {
    envOverrides['project'] = {
      ...(isPlainObject(envOverrides['project']) ? envOverrides['project'] : {}),
      root: process.env['REPOGUARD_ROOT'] || process.env['REPOGUARD_TARGET'],
    };
  }

  if (process.env['REPOGUARD_EXCLUDE']) {
    const excludes = process.env['REPOGUARD_EXCLUDE']
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (excludes.length > 0) {
      envOverrides['project'] = {
        ...(isPlainObject(envOverrides['project']) ? envOverrides['project'] : {}),
        exclude: excludes,
      };
    }
  }

  if (process.env['REPOGUARD_TIMEOUT_MS']) {
    const timeout = Number.parseInt(process.env['REPOGUARD_TIMEOUT_MS'], 10);
    if (!Number.isNaN(timeout)) {
      envOverrides['verification'] = {
        ...(isPlainObject(envOverrides['verification'])
          ? envOverrides['verification']
          : {}),
        timeoutMs: timeout,
      };
    }
  }

  if (process.env['REPOGUARD_ALLOWED_COMMANDS']) {
    const commands = process.env['REPOGUARD_ALLOWED_COMMANDS']
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (commands.length > 0) {
      envOverrides['verification'] = {
        ...(isPlainObject(envOverrides['verification'])
          ? envOverrides['verification']
          : {}),
        allowedCommands: commands,
      };
    }
  }

  if (process.env['REPOGUARD_MAX_FILE_SIZE']) {
    const size = Number.parseInt(process.env['REPOGUARD_MAX_FILE_SIZE'], 10);
    if (!Number.isNaN(size)) {
      envOverrides['scan'] = {
        ...(isPlainObject(envOverrides['scan']) ? envOverrides['scan'] : {}),
        maxFileSize: size,
      };
    }
  }

  if (process.env['REPOGUARD_REDACT_SECRETS'] !== undefined) {
    const rawVal = process.env['REPOGUARD_REDACT_SECRETS'].trim().toLowerCase();
    const redact = !['false', '0', 'no', 'off'].includes(rawVal);
    envOverrides['scan'] = {
      ...(isPlainObject(envOverrides['scan']) ? envOverrides['scan'] : {}),
      redactSecrets: redact,
    };
  }

  if (process.env['REPOGUARD_AI_PROVIDER']) {
    envOverrides['ai'] = {
      ...(isPlainObject(envOverrides['ai']) ? envOverrides['ai'] : {}),
      provider: process.env['REPOGUARD_AI_PROVIDER'],
    };
  }

  if (process.env['REPOGUARD_AI_MODEL']) {
    envOverrides['ai'] = {
      ...(isPlainObject(envOverrides['ai']) ? envOverrides['ai'] : {}),
      model: process.env['REPOGUARD_AI_MODEL'],
    };
  }

  if (process.env['GEMINI_API_KEY']) {
    envOverrides['ai'] = {
      ...(isPlainObject(envOverrides['ai']) ? envOverrides['ai'] : {}),
      apiKey: process.env['GEMINI_API_KEY'],
    };
  }

  return envOverrides;
}

/**
 * Converts CLI overrides into nested config shape.
 */
export function convertCliOverrides(cli?: CliConfigOverrides): Record<string, unknown> {
  if (!cli) {
    return {};
  }
  const result: Record<string, unknown> = {};

  if (cli.projectName) {
    result['project'] = {
      ...(isPlainObject(result['project']) ? result['project'] : {}),
      name: cli.projectName,
    };
  }

  if (cli.target) {
    result['project'] = {
      ...(isPlainObject(result['project']) ? result['project'] : {}),
      root: cli.target,
    };
  }

  if (cli.timeout !== undefined) {
    result['verification'] = {
      ...(isPlainObject(result['verification']) ? result['verification'] : {}),
      timeoutMs: cli.timeout,
    };
  }

  if (cli.allowedCommands && cli.allowedCommands.length > 0) {
    result['verification'] = {
      ...(isPlainObject(result['verification']) ? result['verification'] : {}),
      allowedCommands: cli.allowedCommands,
    };
  }

  if (cli.maxFileSize !== undefined) {
    result['scan'] = {
      ...(isPlainObject(result['scan']) ? result['scan'] : {}),
      maxFileSize: cli.maxFileSize,
    };
  }

  if (cli.redactSecrets !== undefined) {
    result['scan'] = {
      ...(isPlainObject(result['scan']) ? result['scan'] : {}),
      redactSecrets: cli.redactSecrets,
    };
  }

  if (cli.provider) {
    result['ai'] = {
      ...(isPlainObject(result['ai']) ? result['ai'] : {}),
      provider: cli.provider,
    };
  }

  if (cli.model) {
    result['ai'] = {
      ...(isPlainObject(result['ai']) ? result['ai'] : {}),
      model: cli.model,
    };
  }

  return result;
}

/**
 * Loads, merges, and validates the complete RepoGuard configuration.
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<RepoGuardConfig> {
  const cwd = resolve(options.cwd ?? process.cwd());

  if (options.loadEnv !== false) {
    dotenv.config({ path: join(cwd, '.env') });
  }

  const explicitConfigPath =
    options.configPath ??
    options.cliOverrides?.configPath ??
    process.env['REPOGUARD_CONFIG_PATH'];

  let fileConfig: Record<string, unknown> = {};
  let resolvedConfigPath: string | null = null;

  if (explicitConfigPath) {
    resolvedConfigPath = isAbsolute(explicitConfigPath)
      ? explicitConfigPath
      : resolve(cwd, explicitConfigPath);
    fileConfig = await loadConfigFile(resolvedConfigPath);
  } else {
    resolvedConfigPath = await findConfigFile(cwd);
    if (resolvedConfigPath) {
      fileConfig = await loadConfigFile(resolvedConfigPath);
    }
  }

  const envOverrides = extractEnvOverrides();
  const cliOverrides = convertCliOverrides(options.cliOverrides);

  // Cascading deep merge: DEFAULT -> File -> Env -> CLI
  let merged = deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, fileConfig);
  merged = deepMerge(merged, envOverrides);
  merged = deepMerge(merged, cliOverrides);

  // Normalize project.root to absolute path
  const projectObj = (isPlainObject(merged['project']) ? merged['project'] : {}) as Record<string, unknown>;
  const rawRoot = typeof projectObj['root'] === 'string' ? projectObj['root'] : undefined;
  const projectRoot = rawRoot ? resolve(cwd, rawRoot) : cwd;
  merged['project'] = {
    ...projectObj,
    root: projectRoot,
  };

  // Run full validation and normalization
  return validateConfig(merged);
}
