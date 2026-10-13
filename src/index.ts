#!/usr/bin/env node
/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/index.ts
 * Owner: Team Lead
 * Purpose: Executable entry point and composition root
 */

import { runCli } from './cli/index.js';
import { formatError } from './cli/formatter.js';

runCli(process.argv).catch((error: unknown) => {
  const err = error as Error;
  console.error(formatError(`Fatal runtime error: ${err.message}`));
  process.exit(1);
});
