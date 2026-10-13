/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/cli/formatter.ts
 * Owner: Team Lead
 * Purpose: CLI formatting: unified terminal colors, animated startup effects, tables, and progress indicators
 */

import chalk from 'chalk';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, posix, win32 } from 'node:path';

export interface BannerOptions {
  animated?: boolean;
  version?: string;
  subTitle?: string;
}

export interface OpenCommandSpec {
  command: string;
  args: string[];
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normalizes a file path to an absolute path across all platforms.
 * Correctly detects Windows drive-letter paths (e.g. C:\... or C:/...) and UNC paths
 * even when executing on macOS/Linux hosts, while preserving standard POSIX absolute
 * and relative path resolution.
 */
export function toAbsolutePath(filePath: string): string {
  if (
    filePath.startsWith('/') ||
    /^[a-zA-Z]:[\\/]/.test(filePath) ||
    posix.isAbsolute(filePath) ||
    win32.isAbsolute(filePath)
  ) {
    return filePath;
  }
  return resolve(process.cwd(), filePath);
}

/**
 * Resolves safe platform-specific binary and argument array for opening a file.
 * Guarantees that arguments are passed as discrete array tokens rather than shell strings.
 */
export function getOpenCommand(
  filePath: string,
  platform: NodeJS.Platform = process.platform
): OpenCommandSpec {
  const absolutePath = toAbsolutePath(filePath);

  switch (platform) {
    case 'darwin':
      return { command: 'open', args: [absolutePath] };
    case 'win32':
      // On Windows, 'start' is a cmd.exe built-in command; passing discrete args avoids shell injection
      return { command: 'cmd.exe', args: ['/c', 'start', '""', absolutePath] };
    default:
      // Linux, FreeBSD, SunOS, etc.
      return { command: 'xdg-open', args: [absolutePath] };
  }
}

/**
 * Safely launches a file in the user's default browser using argument-based process execution.
 * Avoids shell-string interpolation to prevent command injection from malicious file paths.
 */
export function openInBrowser(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
  spawnImpl: (command: string, args: string[], options?: object) => ChildProcess = spawn
): ChildProcess | undefined {
  const spec = getOpenCommand(filePath, platform);
  try {
    const child = spawnImpl(spec.command, spec.args, {
      detached: true,
      stdio: 'ignore',
    });
    if (child && typeof child.unref === 'function') {
      child.unref();
    }
    if (child && typeof child.on === 'function') {
      child.on('error', () => {
        // Prevent unhandled error event if the browser or binary is not found
      });
    }
    return child;
  } catch {
    // Silently ignore spawn errors so CLI does not crash if browser launch fails
    return undefined;
  }
}

/**
 * Formats a local path as a clickable file:// URI.
 */
export function formatFileUri(filePath: string): string {
  const absolutePath = toAbsolutePath(filePath);
  return `file://${absolutePath}`;
}

/**
 * Returns the static modern Cyberpunk / Neon badge string for RepoGuard.
 */
export function getStaticBanner(version: string = '0.1.0'): string {
  const borderTop = chalk.cyan('╭─────────────────────────────────────────────────────────────╮');
  const borderBottom = chalk.cyan('╰─────────────────────────────────────────────────────────────╯');
  const titleLine = `${chalk.cyan('│')}  ${chalk.bold.hex('#38bdf8')('🛡️  R E P O G U A R D')}  ${chalk.dim(`v${version}`)}      ${chalk.green.bold('● ENGINE INITIALIZED')}  ${chalk.cyan('│')}`;
  const subLine = `${chalk.cyan('│')}  ${chalk.yellow('⚡')}  ${chalk.white('Fix with evidence. Verify before trust.')}                ${chalk.cyan('│')}`;

  return [borderTop, titleLine, subLine, borderBottom].join('\n');
}

/**
 * Renders an ultra-snappy micro-animation for the CLI startup (~210ms total).
 * Automatically falls back to instantaneous static render if in CI, non-TTY, or test environments.
 */
export async function renderStartupEffect(options: BannerOptions = {}): Promise<void> {
  const isInteractive =
    process.stdout.isTTY &&
    process.env['CI'] !== 'true' &&
    process.env['NODE_ENV'] !== 'test' &&
    options.animated !== false;

  const version = options.version || '0.1.0';

  if (!isInteractive) {
    // Instantaneous static output for scripts/tests/non-interactive terminals
    console.log(getStaticBanner(version));
    return;
  }

  // Frame 1: Neon Brand Reveal (~70ms)
  process.stdout.write('\r\x1b[K');
  process.stdout.write(
    `  ${chalk.bold.hex('#00ffff')('🛡️  R E P O G U A R D')}  ${chalk.dim('initializing core engine...')}`
  );
  await sleep(70);

  // Frame 2: Pulse & Engine Lock (~70ms)
  process.stdout.write('\r\x1b[K');
  process.stdout.write(
    `  ${chalk.bold.hex('#38bdf8')('🛡️  R E P O G U A R D')}  ${chalk.dim(`v${version}`)}  ${chalk.green.bold('● ONLINE')}`
  );
  await sleep(70);

  // Frame 3: Final Sleek Box Assembly
  process.stdout.write('\r\x1b[K');
  console.log(`\n${getStaticBanner(version)}\n`);
  await sleep(60);
}

/**
 * Formats a severity level with modern theme colors.
 */
export function formatSeverity(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'CRITICAL':
      return chalk.bgRed.white.bold(' CRITICAL ');
    case 'HIGH':
      return chalk.bgHex('#ea580c').white.bold(' HIGH ');
    case 'MEDIUM':
      return chalk.bgYellow.black.bold(' MEDIUM ');
    case 'LOW':
      return chalk.bgBlue.white.bold(' LOW ');
    case 'INFO':
    default:
      return chalk.bgGray.white.bold(' INFO ');
  }
}

/**
 * Formats a pipeline stage progress indicator.
 */
export function formatStep(current: number, total: number, message: string): string {
  return `${chalk.cyan(`[${current}/${total}]`)} ${chalk.white(message)}`;
}

/**
 * Formats a success message with clean green tick.
 */
export function formatSuccess(message: string): string {
  return `${chalk.green.bold('✔')} ${chalk.white(message)}`;
}

/**
 * Formats a warning message with amber symbol.
 */
export function formatWarning(message: string): string {
  return `${chalk.yellow.bold('⚠')} ${chalk.yellow(message)}`;
}

/**
 * Formats an error message with red cross.
 */
export function formatError(message: string): string {
  return `${chalk.red.bold('✖')} ${chalk.red(message)}`;
}

/**
 * Formats a simple clean table in the terminal.
 */
export function formatSummaryTable(data: {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}): string {
  const lines: string[] = [];
  lines.push(chalk.bold.white('📊 Audit Summary:'));
  lines.push(chalk.dim('┌──────────┬───────┬───────────────────────────────┐'));
  lines.push(
    chalk.dim('│ ') +
      chalk.bold('Severity') +
      chalk.dim(' │ ') +
      chalk.bold('Count') +
      chalk.dim(' │ ') +
      chalk.bold('Status') +
      chalk.dim('                        │')
  );
  lines.push(chalk.dim('├──────────┼───────┼───────────────────────────────┤'));

  const rows = [
    { label: 'CRITICAL', count: data.critical, status: data.critical > 0 ? chalk.red('🚨 Action Required') : chalk.green('✅ Clean') },
    { label: 'HIGH    ', count: data.high, status: data.high > 0 ? chalk.hex('#ea580c')('⚠️ High Priority ') : chalk.green('✅ Clean') },
    { label: 'MEDIUM  ', count: data.medium, status: data.medium > 0 ? chalk.yellow('⚡ Review Advised') : chalk.green('✅ Clean') },
    { label: 'LOW     ', count: data.low, status: data.low > 0 ? chalk.blue('ℹ️ Minor Advisory') : chalk.green('✅ Clean') },
    { label: 'INFO    ', count: data.info, status: data.info > 0 ? chalk.dim('📝 Informational ') : chalk.green('✅ Clean') },
  ];

  for (const r of rows) {
    const countStr = String(r.count).padEnd(5, ' ');
    lines.push(
      chalk.dim('│ ') +
        chalk.white(r.label) +
        chalk.dim(' │ ') +
        chalk.white(countStr) +
        chalk.dim(' │ ') +
        r.status +
        chalk.dim('           │')
    );
  }

  lines.push(chalk.dim('└──────────┴───────┴───────────────────────────────┘'));
  return lines.join('\n');
}
