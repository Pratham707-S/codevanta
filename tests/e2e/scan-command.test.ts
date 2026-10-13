/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/e2e/scan-command.test.ts
 * Owner: Team Lead
 * Purpose: E2E test: repoguard scan, status, and report command execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCliProgram } from '../../src/cli/cli.js';

describe('E2E: repoguard scan, status & report commands', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'repoguard-scan-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Create a dummy source file
    await fs.mkdir(join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(join(tempDir, 'src', 'index.ts'), 'export const hello = "world";\n', 'utf8');
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('scans directory, persists run to storage, and generates report files', async () => {
    const program = createCliProgram('0.1.0');
    await program.parseAsync(['node', 'repoguard', 'scan', tempDir, '--json']);

    // Check that state directory was created
    const stateFiles = await fs.readdir(join(tempDir, '.repoguard', 'state', 'runs'));
    expect(stateFiles.length).toBeGreaterThanOrEqual(1);

    // Check that reports directory was created with HTML & Markdown
    const reportFiles = await fs.readdir(join(tempDir, '.repoguard', 'reports'));
    expect(reportFiles.some((f) => f.endsWith('.html'))).toBe(true);
    expect(reportFiles.some((f) => f.endsWith('.md'))).toBe(true);
  });

  it('status command reflects recorded scan run', async () => {
    // Run scan first
    const scanProg = createCliProgram('0.1.0');
    await scanProg.parseAsync(['node', 'repoguard', 'scan', tempDir, '--json']);

    // Run status
    const statusProg = createCliProgram('0.1.0');
    await statusProg.parseAsync(['node', 'repoguard', 'status', '--json']);

    const stateContent = await fs.readFile(join(tempDir, '.repoguard', 'state', 'state.json'), 'utf8');
    const parsedState = JSON.parse(stateContent);
    expect(parsedState.lastRunId).toBeDefined();
  });
});
