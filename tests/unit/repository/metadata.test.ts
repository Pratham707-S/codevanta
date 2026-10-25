/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/repository/metadata.ts
 * Owner: Manni
 * Purpose: Metadata reader: package.json manifest and lockfile parsing
 *
 * @todo Implementation planned in assigned milestone.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readPackageMetadata } from '../../../src/repository/metadata.js';

describe('readPackageMetadata', () => {
  let tempRoot: string | undefined;

  function createTempRoot(): string {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'repoguard-metadata-'));
    return tempRoot;
  }

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('reads package details and dependencies', () => {
    const root = createTempRoot();

    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'demo-app',
        version: '1.2.3',
        packageManager: 'npm@10.0.0',
        dependencies: { express: '^5.0.0' },
        devDependencies: { vitest: '^3.0.0' },
      }),
    );

    writeFileSync(path.join(root, 'package-lock.json'), '{}');

    expect(readPackageMetadata(root)).toEqual({
      name: 'demo-app',
      version: '1.2.3',
      packageManager: 'npm@10.0.0',
      dependencies: { express: '^5.0.0' },
      devDependencies: { vitest: '^3.0.0' },
      lockfile: 'package-lock.json',
    });
  });

  it('returns null when package.json is missing', () => {
    const root = createTempRoot();

    expect(readPackageMetadata(root)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const root = createTempRoot();

    writeFileSync(path.join(root, 'package.json'), '{ invalid json');

    expect(readPackageMetadata(root)).toBeNull();
  });

  it('returns null when the JSON root is not an object', () => {
    const root = createTempRoot();

    writeFileSync(path.join(root, 'package.json'), '[]');

    expect(readPackageMetadata(root)).toBeNull();
  });

  it('uses empty dependency maps for invalid dependency fields', () => {
    const root = createTempRoot();

    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        dependencies: ['express'],
        devDependencies: null,
      }),
    );

    expect(readPackageMetadata(root)).toMatchObject({
      dependencies: {},
      devDependencies: {},
      lockfile: null,
    });
  });

  it('detects a pnpm lockfile', () => {
    const root = createTempRoot();

    writeFileSync(path.join(root, 'package.json'), '{}');
    writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9');

    expect(readPackageMetadata(root)?.lockfile).toBe('pnpm-lock.yaml');
  });

  it('returns null lockfile when no supported lockfile exists', () => {
    const root = createTempRoot();

    writeFileSync(path.join(root, 'package.json'), '{}');

    expect(readPackageMetadata(root)?.lockfile).toBeNull();
  });
});
