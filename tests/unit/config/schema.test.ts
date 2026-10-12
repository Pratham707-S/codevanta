import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  RepoGuardConfigSchema,
  validateConfig,
  ConfigValidationError,
} from '../../../src/config/schema.js';

describe('RepoGuard Configuration Schema', () => {
  it('provides sensible default configuration', () => {
    expect(DEFAULT_CONFIG.version).toBe('1.0.0');
    expect(DEFAULT_CONFIG.project.name).toBe('repoguard-project');
    expect(DEFAULT_CONFIG.project.exclude).toContain('node_modules/**');
    expect(DEFAULT_CONFIG.project.exclude).toContain('dist/**');
    expect(DEFAULT_CONFIG.scan.maxFileSize).toBe(1048576);
    expect(DEFAULT_CONFIG.scan.redactSecrets).toBe(true);
    expect(DEFAULT_CONFIG.verification.timeoutMs).toBe(30000);
    expect(DEFAULT_CONFIG.verification.allowedCommands).toContain('npm test');
    expect(DEFAULT_CONFIG.ai.provider).toBe('gemini');
    expect(DEFAULT_CONFIG.ai.model).toBe('gemini-2.5-pro');
  });

  it('validates a complete custom configuration object', () => {
    const custom = {
      version: '1.2.0',
      project: {
        name: 'custom-app',
        root: '/custom/root',
        exclude: ['build/**'],
      },
      scan: {
        maxFileSize: 524288,
        redactSecrets: false,
        includePatterns: ['src/**/*.ts'],
      },
      verification: {
        timeoutMs: 60000,
        allowedCommands: ['npm test', 'npm run custom-check'],
      },
      storage: {
        stateDir: '.my-state',
        reportsDir: '.my-reports',
        cacheDir: '.my-cache',
      },
      ai: {
        provider: 'mock',
        model: 'mock-model-v1',
        apiKey: 'test-key',
      },
    };

    const validated = validateConfig(custom);
    expect(validated.version).toBe('1.2.0');
    expect(validated.project.name).toBe('custom-app');
    expect(validated.scan.maxFileSize).toBe(524288);
    expect(validated.scan.redactSecrets).toBe(false);
    expect(validated.verification.timeoutMs).toBe(60000);
    expect(validated.verification.allowedCommands).toContain('npm run custom-check');
    expect(validated.ai.provider).toBe('mock');
    expect(validated.ai.apiKey).toBe('test-key');
  });

  it('throws ConfigValidationError on invalid timeoutMs', () => {
    expect(() => {
      validateConfig({
        verification: {
          timeoutMs: -500,
        },
      });
    }).toThrow(ConfigValidationError);
  });

  it('throws ConfigValidationError on negative maxFileSize', () => {
    expect(() => {
      validateConfig({
        scan: {
          maxFileSize: -1,
        },
      });
    }).toThrow(ConfigValidationError);
  });

  it('rejects unknown root properties when strict parsing is enabled', () => {
    expect(() => {
      RepoGuardConfigSchema.parse({
        unknownField: 'invalid',
      });
    }).toThrow();
  });

  it('normalizes scan.include into scan.includePatterns', () => {
    const validated = validateConfig({
      scan: {
        include: ['src/**/*.ts', 'lib/**/*.js'],
      },
    });

    expect(validated.scan.includePatterns).toEqual(['src/**/*.ts', 'lib/**/*.js']);
  });
});
