/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/e2e/scan-command.test.ts
 * Owner: Team Lead
 * Purpose: E2E test: repoguard scan, status, and report command execution
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

  it('scans directory, persists run to storage, and generates report files with clean JSON stdout', async () => {
    const logLines: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logLines.push(args.map(String).join(' '));
    });

    const program = createCliProgram('0.1.0');
    await program.parseAsync(['node', 'repoguard', 'scan', tempDir, '--json']);
    logSpy.mockRestore();

    // Verify stdout is pure parseable JSON without ANSI startup banners
    const combinedOutput = logLines.join('\n').trim();
    expect(combinedOutput).not.toContain('R E P O G U A R D');
    expect(combinedOutput).not.toContain('ENGINE INITIALIZED');
    expect(combinedOutput).not.toContain('Audit Summary:');

    const parsedRecord = JSON.parse(combinedOutput);
    expect(parsedRecord.runId).toBeDefined();
    expect(parsedRecord.filesScanned).toBeGreaterThanOrEqual(1);
    expect(parsedRecord.findings).toBeDefined();

    // Check that state directory was created
    const stateFiles = await fs.readdir(join(tempDir, '.repoguard', 'state', 'runs'));
    expect(stateFiles.length).toBeGreaterThanOrEqual(1);

    // Check that reports directory was created with HTML & Markdown
    const reportFiles = await fs.readdir(join(tempDir, '.repoguard', 'reports'));
    expect(reportFiles.some((f) => f.endsWith('.html'))).toBe(true);
    expect(reportFiles.some((f) => f.endsWith('.md'))).toBe(true);
  });

  it('correctly passes and loads custom configuration via --config flag', async () => {
    const customConfigPath = join(tempDir, 'custom-config.json');
    const customConfig = {
      $schema: 'https://repoguard.dev/schema.json',
      version: '1.0.0',
      project: {
        name: 'custom-configured-audit',
        root: '.',
        exclude: ['node_modules/**', 'dist/**'],
      },
      scan: {
        maxFileSize: 1048576,
        redactSecrets: true,
        includePatterns: [],
      },
      verification: {
        timeoutMs: 15000,
        allowedCommands: ['npm test'],
      },
      storage: {
        stateDir: '.repoguard/state',
        reportsDir: '.repoguard/reports',
        cacheDir: '.repoguard/cache',
      },
      ai: {
        provider: 'mock' as const,
        model: 'gemini-2.5-pro',
      },
    };
    await fs.writeFile(customConfigPath, JSON.stringify(customConfig), 'utf8');

    const logLines: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logLines.push(args.map(String).join(' '));
    });

    const program = createCliProgram('0.1.0');
    await program.parseAsync(['node', 'repoguard', 'scan', tempDir, '--config', customConfigPath, '--json']);
    logSpy.mockRestore();

    const output = logLines.join('\n').trim();
    const record = JSON.parse(output);

    expect(record.projectName).toBe('custom-configured-audit');
  });

  it('status command reflects recorded scan run and outputs clean JSON', async () => {
    // Run scan first
    const scanProg = createCliProgram('0.1.0');
    await scanProg.parseAsync(['node', 'repoguard', 'scan', tempDir, '--json']);

    // Run status with stdout spy
    const statusLogs: string[] = [];
    const statusSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      statusLogs.push(args.map(String).join(' '));
    });

    const statusProg = createCliProgram('0.1.0');
    await statusProg.parseAsync(['node', 'repoguard', 'status', '--json']);
    statusSpy.mockRestore();

    const statusOutput = statusLogs.join('\n').trim();
    expect(statusOutput).not.toContain('RepoGuard Repository Status');

    const parsedStatus = JSON.parse(statusOutput);
    expect(parsedStatus.state.lastRunId).toBeDefined();
    expect(parsedStatus.history.length).toBeGreaterThanOrEqual(1);

    const stateContent = await fs.readFile(join(tempDir, '.repoguard', 'state', 'state.json'), 'utf8');
    const parsedState = JSON.parse(stateContent);
    expect(parsedState.lastRunId).toBeDefined();
  });
});
