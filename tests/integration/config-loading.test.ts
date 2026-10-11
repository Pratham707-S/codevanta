/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/integration/config-loading.test.ts
 * Owner: Shared — Ayan coordinates
 * Purpose: Integration test: configuration loading, fallback, and validation
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { loadConfig, loadConfigFile } from '../../src/config/loader.js';
import { validateConfig } from '../../src/config/schema.js';

describe('Configuration Integration Tests', () => {
  const repoRoot = resolve(__dirname, '../../');

  it('successfully loads and validates the workspace .repoguard/config.json', async () => {
    const workspaceConfigPath = resolve(repoRoot, '.repoguard/config.json');
    const raw = await loadConfigFile(workspaceConfigPath);
    const validated = validateConfig(raw);

    expect(validated.project.name).toBe('repoguard');
    expect(validated.verification.timeoutMs).toBe(30000);
    expect(validated.verification.allowedCommands).toContain('npm test');
    expect(validated.verification.allowedCommands).toContain('npm run typecheck');
  });

  it('successfully loads and validates examples/repoguard.config.example.json', async () => {
    const exampleConfigPath = resolve(repoRoot, 'examples/repoguard.config.example.json');
    const raw = await loadConfigFile(exampleConfigPath);
    const validated = validateConfig(raw);

    expect(validated.project.name).toBe('my-service');
    expect(validated.scan.maxFileSize).toBe(1048576);
    expect(validated.scan.redactSecrets).toBe(true);
  });

  it('loads full configuration using loadConfig in workspace directory', async () => {
    const config = await loadConfig({ cwd: repoRoot, loadEnv: false });

    expect(config.version).toBe('1.0.0');
    expect(config.project.name).toBe('repoguard');
    expect(config.project.root).toBe(repoRoot);
    expect(config.scan.redactSecrets).toBe(true);
  });
});
