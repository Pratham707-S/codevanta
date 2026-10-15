/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/cli/formatter.ts
 * Owner: Team Lead
 * Purpose: Terminal UI formatting, ASCII banner, spinners, progress bars, and secure browser launching
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, posix, win32 } from 'node:path';
import chalk from 'chalk';

export interface BannerOptions {
  animated?: boolean;
  version?: string;
  subTitle?: string;
}

export interface OpenCommandSpec {
  command: string;
  args: string[];
}

export interface ProgressBarOptions {
  width?: number;
  showPercent?: boolean;
}

export interface SpinnerOptions {
  stream?: NodeJS.WriteStream;
  interactive?: boolean;
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
 * Returns a sleek, stylized ASCII banner for RepoGuard.
 */
export function getStaticBanner(version: string = '0.1.0'): string {
  const isColorDisabled = Boolean(process.env['NO_COLOR'] || process.argv.includes('--no-color'));
  const logo = [
    '  _____  ______ _____   ____   _____ _    _          _____  _____  ',
    ' |  __ \\|  ____|  __ \\ / __ \\ / ____| |  | |   /\\   |  __ \\|  __ \\ ',
    ' | |__) | |__  | |__) | |  | | |  __| |  | |  /  \\  | |__) | |  | |',
    ' |  _  /|  __| |  ___/| |  | | | |_ | |  | | / /\\ \\ |  _  /| |  | |',
    ' | | \\ \\| |____| |    | |__| | |__| | |__| |/ ____ \\| | \\ \\| |__| |',
    ' |_|  \\_\\______|_|     \\____/ \\_____|\\____//_/    \\_\\_|  \\_\\_____/ ',
  ]
    .map((l) => (isColorDisabled ? l : chalk.cyan(l)))
    .join('\n');

  const border = '─'.repeat(67);
  const borderTop = isColorDisabled ? `╭${border}╮` : chalk.cyan(`╭${border}╮`);
  const borderBottom = isColorDisabled ? `╰${border}╯` : chalk.cyan(`╰${border}╯`);
  const titleLine = isColorDisabled
    ? `│  🛡️  R E P O G U A R D  v${version}       ● ENGINE INITIALIZED            │`
    : `${chalk.cyan('│')}  ${chalk.bold.hex('#38bdf8')('🛡️  R E P O G U A R D')}  ${chalk.dim(`v${version}`)}      ${chalk.green.bold('● ENGINE INITIALIZED')}  ${chalk.cyan('│')}`;
  const subLine = isColorDisabled
    ? `│  ⚡  Fix with evidence. Verify before trust.                        │`
    : `${chalk.cyan('│')}  ${chalk.yellow('⚡')}  ${chalk.white('Fix with evidence. Verify before trust.')}                ${chalk.cyan('│')}`;

  return `${logo}\n${borderTop}\n${titleLine}\n${subLine}\n${borderBottom}`;
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
 * Formats an informational message with blue info icon.
 */
export function formatInfo(message: string): string {
  return `${chalk.blue.bold('ℹ')} ${chalk.white(message)}`;
}

/**
 * Formats an error message with red cross and optional remediation tip.
 */
export function formatError(message: string, tip?: string): string {
  const main = `${chalk.red.bold('✖')} ${chalk.red(message)}`;
  if (tip) {
    return `${main}\n  ${chalk.dim('💡 Tip:')} ${chalk.cyan(tip)}`;
  }
  return main;
}

/**
 * Formats an in-terminal progress bar with percentage.
 */
export function formatProgressBar(
  current: number,
  total: number,
  options: ProgressBarOptions = {}
): string {
  const width = options.width || 12;
  const showPercent = options.showPercent !== false;
  const safeTotal = total > 0 ? total : 1;
  const safeCurrent = Math.min(Math.max(current, 0), safeTotal);
  const ratio = safeCurrent / safeTotal;
  const filled = Math.round(width * ratio);
  const empty = width - filled;

  const bar = `${chalk.cyan('█'.repeat(filled))}${chalk.dim('░'.repeat(empty))}`;
  const percent = `${Math.round(ratio * 100)}%`.padStart(4, ' ');

  return showPercent ? `[${bar}] ${chalk.bold(percent)}` : `[${bar}]`;
}

/**
 * Lightweight, zero-dependency terminal spinner for long-running CLI operations.
 * Automatically switches to clean non-animated output in non-interactive/CI/test environments.
 */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class Spinner {
  private message: string;
  private stream: NodeJS.WriteStream;
  private isInteractive: boolean;
  private frameIndex: number = 0;
  private timer: NodeJS.Timeout | null = null;
  private active: boolean = false;

  constructor(text: string = '', options: SpinnerOptions = {}) {
    this.message = text;
    this.stream = options.stream || process.stderr;
    this.isInteractive =
      options.interactive !== undefined
        ? options.interactive
        : Boolean(
            this.stream.isTTY &&
            process.env['CI'] !== 'true' &&
            process.env['NODE_ENV'] !== 'test'
          );
  }

  start(text?: string): this {
    if (text) this.message = text;
    if (this.active) return this;
    this.active = true;

    if (!this.isInteractive) {
      return this;
    }

    // Hide cursor during interactive animation
    this.stream.write('\x1b[?25l');
    this.render();

    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
      this.render();
    }, 80);
    this.timer.unref();

    return this;
  }

  update(text: string): this {
    this.message = text;
    if (this.isInteractive && this.active) {
      this.render();
    }
    return this;
  }

  private render(): void {
    if (!this.isInteractive) return;
    const frame = chalk.cyan(SPINNER_FRAMES[this.frameIndex]);
    this.stream.write(`\r\x1b[K${frame} ${this.message}`);
  }

  private clearLine(): void {
    if (this.isInteractive) {
      this.stream.write('\r\x1b[K');
      // Restore cursor
      this.stream.write('\x1b[?25h');
    }
  }

  stop(): this {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.active) {
      this.clearLine();
      this.active = false;
    }
    return this;
  }

  succeed(text?: string): this {
    this.stop();
    const msg = text || this.message;
    if (msg) {
      if (msg.startsWith('[') || msg.includes('✔') || msg.includes('✖')) {
        console.log(msg);
      } else {
        console.log(formatSuccess(msg));
      }
    }
    return this;
  }

  fail(text?: string): this {
    this.stop();
    const msg = text || this.message;
    if (msg) {
      if (msg.startsWith('[') || msg.includes('✔') || msg.includes('✖')) {
        console.log(msg);
      } else {
        console.log(formatError(msg));
      }
    }
    return this;
  }

  warn(text?: string): this {
    this.stop();
    const msg = text || this.message;
    if (msg) {
      if (msg.startsWith('[') || msg.includes('✔') || msg.includes('✖')) {
        console.log(msg);
      } else {
        console.log(formatWarning(msg));
      }
    }
    return this;
  }

  info(text?: string): this {
    this.stop();
    const msg = text || this.message;
    if (msg) {
      if (msg.startsWith('[') || msg.includes('✔') || msg.includes('✖')) {
        console.log(msg);
      } else {
        console.log(formatInfo(msg));
      }
    }
    return this;
  }
}

export function createSpinner(text: string = '', options: SpinnerOptions = {}): Spinner {
  return new Spinner(text, options);
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
