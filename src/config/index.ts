/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/config/index.ts
 * Owner: Ayan
 * Purpose: Configuration module public exports
 */

export {
  ProjectConfigSchema,
  ScanConfigSchema,
  VerificationConfigSchema,
  StorageConfigSchema,
  AiConfigSchema,
  RepoGuardConfigSchema,
  DEFAULT_CONFIG,
  ConfigValidationError,
  validateConfig,
  type ProjectConfig,
  type ScanConfig,
  type VerificationConfig,
  type StorageConfig,
  type AiConfig,
  type RepoGuardConfig,
  type RepoGuardConfigInput,
} from './schema.js';

export {
  CONFIG_CANDIDATES,
  type CliConfigOverrides,
  type LoadConfigOptions,
  deepMerge,
  findConfigFile,
  loadConfigFile,
  extractEnvOverrides,
  convertCliOverrides,
  loadConfig,
} from './loader.js';
