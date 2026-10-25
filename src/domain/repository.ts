/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/domain/repository.ts
 * Owner: Manni
 * Purpose: Domain models: RepositoryInfo, SourceFile, ProjectMetadata
 *
 * @todo Implementation planned in assigned milestone.
 */

/**
 * Package manifest se extract ki gayi information.
 */
export interface RepositoryMetadata {
  name?: string;
  version?: string;
  packageManager?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  lockfile: string | null;
}

/**
 * Repository ke andar discover hui file ki basic information.
 */
export interface FileInfo {
  path: string;
  size: number;
  language?: string;
}