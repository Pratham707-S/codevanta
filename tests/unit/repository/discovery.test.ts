
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  detectLanguage,
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

  it('returns an empty array for an unreadable or missing root', () => {
    const root = path.join(os.tmpdir(), 'repoguard-root-that-does-not-exist');

    expect(detectProjectTools(root)).toEqual([]);
  });
});
