import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadConfig,
  deepMerge,
  extractEnvOverrides,
  convertCliOverrides,
} from '../../../src/config/loader.js';
import { ConfigValidationError } from '../../../src/config/schema.js';

describe('RepoGuard Configuration Loader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'repoguard-config-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('merges plain objects recursively with deepMerge', () => {
    const base = { a: 1, b: { c: 2, d: 3 } };
    const override = { b: { c: 20 }, e: 5 };
    const merged = deepMerge(base, override);

    expect(merged).toEqual({ a: 1, b: { c: 20, d: 3 }, e: 5 });
  });

  it('loads default configuration when no config file exists in working dir', async () => {
    const config = await loadConfig({ cwd: tempDir, loadEnv: false });

    expect(config.version).toBe('1.0.0');
    expect(config.verification.timeoutMs).toBe(30000);
    expect(config.scan.maxFileSize).toBe(1048576);
  });

  it('loads configuration from an explicit config file', async () => {
    const customConfig = {
      project: { name: 'custom-file-project' },
      verification: { timeoutMs: 45000 },
    };
    const configFilePath = join(tempDir, 'custom.json');
    await fs.writeFile(configFilePath, JSON.stringify(customConfig), 'utf8');

    const config = await loadConfig({
      cwd: tempDir,
      configPath: configFilePath,
      loadEnv: false,
    });

    expect(config.project.name).toBe('custom-file-project');
    expect(config.verification.timeoutMs).toBe(45000);
    expect(config.scan.redactSecrets).toBe(true); // default maintained
  });

  it('throws ConfigValidationError if explicit config path does not exist', async () => {
    const missingPath = join(tempDir, 'does-not-exist.json');

    await expect(
      loadConfig({
        cwd: tempDir,
        configPath: missingPath,
        loadEnv: false,
      })
    ).rejects.toThrow(ConfigValidationError);
  });

  it('throws ConfigValidationError on malformed JSON in config file', async () => {
    const brokenFilePath = join(tempDir, 'broken.json');
    await fs.writeFile(brokenFilePath, '{ "invalid": json, }', 'utf8');

    await expect(
      loadConfig({
        cwd: tempDir,
        configPath: brokenFilePath,
        loadEnv: false,
      })
    ).rejects.toThrow(ConfigValidationError);
  });

  it('applies CLI overrides on top of file configuration', async () => {
    const fileConfig = {
      verification: { timeoutMs: 15000 },
      scan: { redactSecrets: true },
    };
    const configFilePath = join(tempDir, 'repoguard.config.json');
    await fs.writeFile(configFilePath, JSON.stringify(fileConfig), 'utf8');

    const config = await loadConfig({
      cwd: tempDir,
      loadEnv: false,
      cliOverrides: {
        timeout: 60000,
        provider: 'mock',
      },
    });

    expect(config.verification.timeoutMs).toBe(60000);
    expect(config.ai.provider).toBe('mock');
  });

  it('converts CLI overrides accurately with convertCliOverrides', () => {
    const overrides = convertCliOverrides({
      projectName: 'my-cli-project',
      target: '/some/path',
      timeout: 12000,
      allowedCommands: ['npm test'],
      redactSecrets: false,
      provider: 'gemini',
    });

    expect(overrides).toEqual({
      project: { name: 'my-cli-project', root: '/some/path' },
      verification: { timeoutMs: 12000, allowedCommands: ['npm test'] },
      scan: { redactSecrets: false },
      ai: { provider: 'gemini' },
    });
  });

  it('extracts environment variable overrides correctly', () => {
    const origTimeout = process.env['REPOGUARD_TIMEOUT_MS'];
    const origRedact = process.env['REPOGUARD_REDACT_SECRETS'];
    const origProj = process.env['REPOGUARD_PROJECT_NAME'];

    try {
      process.env['REPOGUARD_PROJECT_NAME'] = 'env-project';
      process.env['REPOGUARD_TIMEOUT_MS'] = '25000';
      process.env['REPOGUARD_REDACT_SECRETS'] = 'false';

      const env = extractEnvOverrides();
      expect(env).toEqual({
        project: { name: 'env-project' },
        verification: { timeoutMs: 25000 },
        scan: { redactSecrets: false },
      });
    } finally {
      if (origTimeout !== undefined) {
        process.env['REPOGUARD_TIMEOUT_MS'] = origTimeout;
      } else {
        delete process.env['REPOGUARD_TIMEOUT_MS'];
      }
      if (origRedact !== undefined) {
        process.env['REPOGUARD_REDACT_SECRETS'] = origRedact;
      } else {
        delete process.env['REPOGUARD_REDACT_SECRETS'];
      }
      if (origProj !== undefined) {
        process.env['REPOGUARD_PROJECT_NAME'] = origProj;
      } else {
        delete process.env['REPOGUARD_PROJECT_NAME'];
      }
    }
  });
});
