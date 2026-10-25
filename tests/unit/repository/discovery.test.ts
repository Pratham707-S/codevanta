/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/repository/discovery.ts
 * Owner: Manni
 * Purpose: Repository discovery: find repo root, detect languages and build tools
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  detectLanguage,
  detectFileLanguage,
  detectProjectTools,
  findRepositoryRoot,
} from '../../../src/repository/discovery.js';

const temporaryDirectories: string[] = [];

function createTempDirectory(): string {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'repoguard-discovery-'),
  );

  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('findRepositoryRoot', () => {
  it('finds a project root from a nested directory', () => {
    const root = createTempDirectory();
    const nested = path.join(root, 'src', 'features');

    mkdirSync(nested, { recursive: true });
    writeFileSync(path.join(root, 'package.json'), '{}');

    expect(findRepositoryRoot(nested)).toBe(root);
  });

  it('accepts a file path as the starting path', () => {
    const root = createTempDirectory();
    const sourceDirectory = path.join(root, 'src');

    mkdirSync(sourceDirectory);
    writeFileSync(path.join(root, 'package.json'), '{}');

    const sourceFile = path.join(sourceDirectory, 'index.ts');
    writeFileSync(sourceFile, 'export {};');

    expect(findRepositoryRoot(sourceFile)).toBe(root);
  });

  it('returns null when no root marker exists', () => {
    const root = createTempDirectory();
    const isolatedDirectory = path.join(root, 'isolated');

    mkdirSync(isolatedDirectory);

    expect(findRepositoryRoot(isolatedDirectory)).toBeNull();
  });

  it('finds the nearest project root in nested projects with parent and child markers', () => {
    const parentRoot = createTempDirectory();
    writeFileSync(path.join(parentRoot, 'package.json'), '{"name": "parent-repo"}');

    // Create a child subproject with its own root marker
    const childRoot = path.join(parentRoot, 'packages', 'child-service');
    mkdirSync(path.join(childRoot, 'src'), { recursive: true });
    writeFileSync(path.join(childRoot, 'package.json'), '{"name": "child-service"}');

    const nestedChildFile = path.join(childRoot, 'src', 'index.ts');
    writeFileSync(nestedChildFile, 'export const child = true;');

    // Nearest-root verification: starting inside the child package returns child root, not parent
    expect(findRepositoryRoot(nestedChildFile)).toBe(childRoot);
    expect(findRepositoryRoot(path.join(childRoot, 'src'))).toBe(childRoot);
    expect(findRepositoryRoot(childRoot)).toBe(childRoot);

    // Starting from a parent-only directory returns the parent root
    const parentOnlyDir = path.join(parentRoot, 'scripts');
    mkdirSync(parentOnlyDir);
    expect(findRepositoryRoot(parentOnlyDir)).toBe(parentRoot);
  });

  it('recognizes a .git directory as a valid repository root', () => {
    const root = createTempDirectory();
    mkdirSync(path.join(root, '.git'));
    const nestedDir = path.join(root, 'src');
    mkdirSync(nestedDir);

    expect(findRepositoryRoot(nestedDir)).toBe(root);
  });

  it('recognizes a .git file as a valid repository root for git worktrees', () => {
    const root = createTempDirectory();
    // In git worktrees or submodules, .git is a pointer file rather than a directory
    writeFileSync(path.join(root, '.git'), 'gitdir: /path/to/main/.git/worktrees/feat');
    const nestedDir = path.join(root, 'lib');
    mkdirSync(nestedDir);

    expect(findRepositoryRoot(nestedDir)).toBe(root);
  });
});

describe('detectLanguage', () => {
  it('detects unique languages in deterministic order', () => {
    expect(
      detectLanguage([
        'src/index.ts',
        'src/app.tsx',
        'scripts/build.js',
        'server/main.py',
        'README.md',
      ]),
    ).toEqual(['JavaScript', 'Python', 'TypeScript']);
  });

  it('returns an empty array for unknown extensions', () => {
    expect(detectLanguage(['README.md', 'image.png'])).toEqual([]);
  });

  it('handles uppercase extensions correctly', () => {
    expect(
      detectLanguage([
        'SRC/MAIN.TS',
        'SRC/COMPONENTS/BUTTON.TSX',
        'SCRIPTS/DEPLOY.PY',
        'SERVER/APP.JS',
      ]),
    ).toEqual(['JavaScript', 'Python', 'TypeScript']);
  });

  it('deduplicates languages when multiple files share the same extension', () => {
    expect(
      detectLanguage([
        'src/a.ts',
        'src/b.ts',
        'src/c.ts',
        'src/d.tsx',
      ]),
    ).toEqual(['TypeScript']);
  });

  it('safely ignores filenames without extensions', () => {
    expect(
      detectLanguage([
        'Dockerfile',
        'Makefile',
        'LICENSE',
        '.gitignore',
      ]),
    ).toEqual([]);

    expect(
      detectLanguage([
        'Dockerfile',
        'src/main.rs',
        'LICENSE',
      ]),
    ).toEqual(['Rust']);
  });
});

describe('detectFileLanguage', () => {
  it('detects language from file extension case-insensitively', () => {
    expect(detectFileLanguage('src/app.ts')).toBe('TypeScript');
    expect(detectFileLanguage('SRC/MAIN.TS')).toBe('TypeScript');
    expect(detectFileLanguage('server/app.py')).toBe('Python');
    expect(detectFileLanguage('SERVER/APP.PY')).toBe('Python');
    expect(detectFileLanguage('db/schema.sql')).toBe('SQL');
    expect(detectFileLanguage('DB/SCHEMA.SQL')).toBe('SQL');
    expect(detectFileLanguage('main.go')).toBe('Go');
    expect(detectFileLanguage('App.java')).toBe('Java');
    expect(detectFileLanguage('app.rb')).toBe('Ruby');
    expect(detectFileLanguage('index.php')).toBe('PHP');
    expect(detectFileLanguage('lib.rs')).toBe('Rust');
  });

  it('returns undefined for files without extensions or unrecognized extensions', () => {
    expect(detectFileLanguage('Dockerfile')).toBeUndefined();
    expect(detectFileLanguage('Makefile')).toBeUndefined();
    expect(detectFileLanguage('README.md')).toBeUndefined();
    expect(detectFileLanguage('image.png')).toBeUndefined();
    expect(detectFileLanguage('')).toBeUndefined();
  });
});

describe('detectProjectTools', () => {
  it('detects tools from root-level configuration files', () => {
    const root = createTempDirectory();

    writeFileSync(path.join(root, 'package.json'), '{}');
    writeFileSync(path.join(root, 'tsconfig.json'), '{}');
    writeFileSync(path.join(root, 'vite.config.ts'), 'export {};');
    writeFileSync(path.join(root, 'vitest.config.ts'), 'export {};');

    expect(detectProjectTools(root)).toEqual([
      'Node.js',
      'TypeScript',
      'Vite',
      'Vitest',
    ]);
  });

  it('returns an empty array for a missing or nonexistent root directory', () => {
    const root = path.join(os.tmpdir(), 'repoguard-root-that-does-not-exist');

    expect(detectProjectTools(root)).toEqual([]);
  });

  it('deduplicates tool names when multiple configuration markers for the same tool are present', () => {
    const root = createTempDirectory();

    // Both docker-compose.yml and docker-compose.yaml map to 'Docker Compose'
    writeFileSync(path.join(root, 'docker-compose.yml'), '');
    writeFileSync(path.join(root, 'docker-compose.yaml'), '');

    // Both vite.config.js and vite.config.ts map to 'Vite'
    writeFileSync(path.join(root, 'vite.config.js'), '');
    writeFileSync(path.join(root, 'vite.config.ts'), '');

    // Both jest.config.js and jest.config.ts map to 'Jest'
    writeFileSync(path.join(root, 'jest.config.js'), '');
    writeFileSync(path.join(root, 'jest.config.ts'), '');

    expect(detectProjectTools(root)).toEqual([
      'Docker Compose',
      'Jest',
      'Vite',
    ]);
  });

  it('ignores unknown files and non-marker configuration files', () => {
    const root = createTempDirectory();

    writeFileSync(path.join(root, 'README.md'), '# Hello');
    writeFileSync(path.join(root, 'notes.txt'), 'notes');
    writeFileSync(path.join(root, 'custom.config.json'), '{}');
    writeFileSync(path.join(root, 'data.csv'), 'a,b,c');

    expect(detectProjectTools(root)).toEqual([]);
  });

  it('returns an empty array when given a file path instead of a directory', () => {
    const root = createTempDirectory();
    const filePath = path.join(root, 'not-a-directory.txt');
    writeFileSync(filePath, 'plain text content');

    // readdirSync on a file throws ENOTDIR, which should be safely handled
    expect(detectProjectTools(filePath)).toEqual([]);
  });
});
