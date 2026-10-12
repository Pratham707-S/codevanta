/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/config/schema.ts
 * Owner: Ayan
 * Purpose: Configuration schema: Zod schema, defaults, and type inference for repoguard.config.json
 */

import { z } from 'zod';

export class ConfigValidationError extends Error {
  public readonly issues: z.ZodIssue[];

  constructor(message: string, issues: z.ZodIssue[] = []) {
    super(message);
    this.name = 'ConfigValidationError';
    this.issues = issues;
    Object.setPrototypeOf(this, ConfigValidationError.prototype);
  }

  public formatIssues(): string {
    if (this.issues.length === 0) {
      return this.message;
    }
    return this.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
        return `  - [${path}]: ${issue.message}`;
      })
      .join('\n');
  }
}

export const ProjectConfigSchema = z
  .object({
    name: z.string().min(1).default('repoguard-project'),
    root: z.string().optional(),
    exclude: z
      .array(z.string())
      .default([
        'node_modules/**',
        'dist/**',
        '.git/**',
        'coverage/**',
        '**/*.min.js',
      ]),
  })
  .strict();

export const ScanConfigSchema = z
  .object({
    maxFileSize: z.number().int().positive().default(1048576), // 1MB default
    redactSecrets: z.boolean().default(true),
    includePatterns: z.array(z.string()).default([]),
    include: z.array(z.string()).optional(),
  })
  .strict();

export const VerificationConfigSchema = z
  .object({
    timeoutMs: z.number().int().positive().default(30000), // 30s default
    allowedCommands: z
      .array(z.string().min(1))
      .default(['npm test', 'npm run lint', 'npm run typecheck']),
  })
  .strict();

export const StorageConfigSchema = z
  .object({
    stateDir: z.string().default('.repoguard/state'),
    reportsDir: z.string().default('.repoguard/reports'),
    cacheDir: z.string().default('.repoguard/cache'),
  })
  .strict();

export const AiConfigSchema = z
  .object({
    provider: z.enum(['gemini', 'mock']).default('gemini'),
    model: z.string().min(1).default('gemini-2.5-pro'),
    apiKey: z.string().optional(),
  })
  .strict();

export const RepoGuardConfigSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.string().default('1.0.0'),
    project: ProjectConfigSchema.default({}),
    scan: ScanConfigSchema.default({}),
    verification: VerificationConfigSchema.default({}),
    storage: StorageConfigSchema.default({}),
    ai: AiConfigSchema.default({}),
  })
  .strict();

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type ScanConfig = z.infer<typeof ScanConfigSchema>;
export type VerificationConfig = z.infer<typeof VerificationConfigSchema>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
export type AiConfig = z.infer<typeof AiConfigSchema>;

export type RepoGuardConfig = z.infer<typeof RepoGuardConfigSchema>;
export type RepoGuardConfigInput = z.input<typeof RepoGuardConfigSchema>;

export const DEFAULT_CONFIG: Readonly<RepoGuardConfig> = Object.freeze(
  RepoGuardConfigSchema.parse({})
);

export function validateConfig(input: unknown): RepoGuardConfig {
  const result = RepoGuardConfigSchema.safeParse(input);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  - [${i.path.join('.') || 'root'}]: ${i.message}`)
      .join('\n');
    throw new ConfigValidationError(
      `Invalid RepoGuard configuration:\n${formatted}`,
      result.error.issues
    );
  }
  const data = result.data;
  if (data.scan.include && data.scan.include.length > 0 && data.scan.includePatterns.length === 0) {
    data.scan.includePatterns = [...data.scan.include];
  }
  return data;
}
