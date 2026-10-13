/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/e2e/init-command.test.ts
 * Owner: Team Lead
 * Purpose: E2E test: repoguard init command execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCliProgram } from '../../src/cli/cli.js';

describe('E2E: repoguard init command', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'repoguard-init-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('initializes .repoguard/config.json with default configuration', async () => {
    const program = createCliProgram('0.1.0');
    await program.parseAsync(['node', 'repoguard', 'init', '--json']);

    const configPath = join(tempDir, '.repoguard', 'config.json');
    const content = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(content);

    expect(parsed.version).toBe('1.0.0');
    expect(parsed.scan.redactSecrets).toBe(true);
    expect(parsed.verification.timeoutMs).toBe(30000);
  });

  it('does not overwrite existing config unless --force is provided', async () => {
    const program = createCliProgram('0.1.0');
    const configPath = join(tempDir, '.repoguard', 'config.json');

    await fs.mkdir(join(tempDir, '.repoguard'), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify({ custom: 'preserved' }), 'utf8');

    // Run init without force
    await program.parseAsync(['node', 'repoguard', 'init', '--json']);
    const raw = await fs.readFile(configPath, 'utf8');
    expect(JSON.parse(raw)).toEqual({ custom: 'preserved' });

    // Run init with --force
    const forceProgram = createCliProgram('0.1.0');
    await forceProgram.parseAsync(['node', 'repoguard', 'init', '--force', '--json']);
    const overwritten = await fs.readFile(configPath, 'utf8');
    expect(JSON.parse(overwritten).version).toBe('1.0.0');
  });
});
