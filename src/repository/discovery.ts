/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/repository/discovery.ts
 * Owner: Manni
 * Purpose: Repository discovery: find repo root, detect languages and build tools
 *
 * @todo Implementation planned in assigned milestone.
 */


import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT_MARKERS = [
  '.git',
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'composer.json',
  'Gemfile',
] as const;

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
  '.go': 'Go',
  '.rs': 'Rust',
  '.c': 'C',
  '.h': 'C',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.hpp': 'C++',
  '.cs': 'C#',
  '.php': 'PHP',
  '.rb': 'Ruby',
  '.swift': 'Swift',
  '.dart': 'Dart',
  '.vue': 'Vue',
  '.html': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sql': 'SQL',
};

const TOOL_MARKERS: Record<string, string> = {
  'package.json': 'Node.js',
  'tsconfig.json': 'TypeScript',
  'vite.config.js': 'Vite',
  'vite.config.ts': 'Vite',
  'webpack.config.js': 'Webpack',
  'webpack.config.ts': 'Webpack',
  'next.config.js': 'Next.js',
  'next.config.ts': 'Next.js',
  'next.config.mjs': 'Next.js',
  'angular.json': 'Angular',
  'Dockerfile': 'Docker',
  'docker-compose.yml': 'Docker Compose',
  'docker-compose.yaml': 'Docker Compose',
  'pnpm-workspace.yaml': 'pnpm workspaces',
  'turbo.json': 'Turborepo',
  'vitest.config.ts': 'Vitest',
  'jest.config.js': 'Jest',
  'jest.config.ts': 'Jest',
  'playwright.config.ts': 'Playwright',
  'eslint.config.js': 'ESLint',
};

function isDirectory(targetPath: string): boolean {
  try {
    return statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function hasRootMarker(directory: string): boolean {
  return ROOT_MARKERS.some((marker) =>
    existsSync(path.join(directory, marker)),
  );
}

/**
 * Find the nearest repository/project root by walking upwards.
 *
 * Returns null if no recognized root marker is found.
 * The function does not create, modify, or delete files.
 */
export function findRepositoryRoot(
  startPath: string = process.cwd(),
): string | null {
  let currentPath = path.resolve(startPath);

  if (existsSync(currentPath) && !isDirectory(currentPath)) {
    currentPath = path.dirname(currentPath);
  }

  while (true) {
    if (hasRootMarker(currentPath)) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);

    if (parentPath === currentPath) {
      return null;
    }

    currentPath = parentPath;
  }
}

/**
 * Detect languages from a list of repository-relative or absolute file paths.
 * Returns unique language names in deterministic alphabetical order.
 */
export function detectLanguage(
  filePaths: readonly string[],
): string[] {
  const languages = new Set<string>();

  for (const filePath of filePaths) {
    const extension = path.extname(filePath).toLowerCase();
    const language = LANGUAGE_BY_EXTENSION[extension];

    if (language) {
      languages.add(language);
    }
  }

  return [...languages].sort((a, b) => a.localeCompare(b));
}

/**
 * Detect project tools from configuration files in the root directory.
 * This checks root-level markers only; it does not recursively scan files.
 */
export function detectProjectTools(rootPath: string): string[] {
  const tools = new Set<string>();
  const absoluteRoot = path.resolve(rootPath);

  let entries: string[];

  try {
    entries = readdirSync(absoluteRoot);
  } catch {
    return [];
  }

  for (const entry of entries) {
    const tool = TOOL_MARKERS[entry];

    if (tool) {
      tools.add(tool);
    }
  }

  return [...tools].sort((a, b) => a.localeCompare(b));
}

