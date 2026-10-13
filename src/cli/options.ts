/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/cli/options.ts
 * Owner: Team Lead
 * Purpose: CLI argument parsing, option flags, and shared interfaces
 */

export interface GlobalCliOptions {
  config?: string;
  json?: boolean;
  verbose?: boolean;
  noColor?: boolean;
}

export interface ScanCommandOptions extends GlobalCliOptions {
  target?: string;
  timeout?: string;
  format?: 'summary' | 'json' | 'html' | 'markdown';
  outputDir?: string;
  fix?: boolean;
  open?: boolean;
}

export interface InitCommandOptions extends GlobalCliOptions {
  force?: boolean;
  template?: 'default' | 'minimal' | 'strict';
}

export interface ReportCommandOptions extends GlobalCliOptions {
  runId?: string;
  format?: 'markdown' | 'json' | 'html';
  outputDir?: string;
  open?: boolean;
}

export interface StatusCommandOptions extends GlobalCliOptions {
  history?: boolean;
}
