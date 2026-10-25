/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/repository/metadata.ts
 * Owner: Manni
 * Purpose: Metadata reader: package.json manifest and lockfile parsing
 *
 * @todo Implementation planned in assigned milestone.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { RepositoryMetadata } from '../domain/repository.js';

const LOCKFILES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
] as const;

function readStringMap(value: unknown): Record<string, string> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return {};
  }

  const result: Record<string, string> = {};

  for (const [key, version] of Object.entries(value)) {
    if (typeof version === 'string') {
      result[key] = version;
    }
  }

  return result;
}

function readOptionalString(
  value: unknown,
): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

/**
 * Reads package.json and detects a supported lockfile.
 * Returns null if package.json is missing, invalid, or unreadable.
 */
export function readPackageMetadata(
  rootPath: string,
): RepositoryMetadata | null {
  const manifestPath = path.join(rootPath, 'package.json');

  let raw: string;

  try {
    raw = readFileSync(manifestPath, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    return null;
  }

  const manifest = parsed as Record<string, unknown>;

  const lockfile =
    LOCKFILES.find((name) =>
      existsSync(path.join(rootPath, name)),
    ) ?? null;

  return {
    name: readOptionalString(manifest.name),
    version: readOptionalString(manifest.version),
    packageManager: readOptionalString(manifest.packageManager),
    dependencies: readStringMap(manifest.dependencies),
    devDependencies: readStringMap(manifest.devDependencies),
    lockfile,
  };
}