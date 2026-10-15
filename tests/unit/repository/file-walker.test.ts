import {
    mkdtempSync,
    mkdirSync,
    rmSync,
    writeFileSync,
    symlinkSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { walkRepositoryFiles } from '../../../src/repository/file-walker.js';

const tempDirectories: string[] = [];

function makeTempDirectory(): string {
    const directory = mkdtempSync(
        path.join(os.tmpdir(), 'repoguard-walker-'),
    );

    tempDirectories.push(directory);
    return directory;
}

function writeFile(
    root: string,
    relativePath: string,
    contents: string | Buffer = 'test content',
): void {
    const filePath = path.join(root, relativePath);

    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
}

afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe('walkRepositoryFiles', () => {
    it('returns eligible files using relative paths', () => {
        const root = makeTempDirectory();

        writeFile(root, 'src/index.ts', 'export {};');
        writeFile(root, 'README.md', '# Demo');

        const files = walkRepositoryFiles(root);

        expect(files.map((file) => file.relativePath)).toEqual([
            'README.md',
            'src/index.ts',
        ]);
    });

    it('excludes sensitive files and common generated directories', () => {
        const root = makeTempDirectory();

        writeFile(root, 'src/app.ts');
        writeFile(root, '.env', 'SECRET=value');
        writeFile(root, '.env.production', 'SECRET=value');
        writeFile(root, 'private.key', 'private-key');
        writeFile(root, 'node_modules/package/index.js');
        writeFile(root, 'dist/bundle.js');

        const files = walkRepositoryFiles(root);
        const paths = files.map((file) => file.relativePath);

        expect(paths).toContain('src/app.ts');
        expect(paths).not.toContain('.env');
        expect(paths).not.toContain('.env.production');
        expect(paths).not.toContain('private.key');
        expect(paths.some((file) => file.startsWith('node_modules/'))).toBe(false);
        expect(paths.some((file) => file.startsWith('dist/'))).toBe(false);
    });

    it('respects common .gitignore patterns', () => {
        const root = makeTempDirectory();

        writeFile(root, '.gitignore', 'logs/\n*.tmp\n');
        writeFile(root, 'src/app.ts');
        writeFile(root, 'logs/debug.log');
        writeFile(root, 'scratch.tmp');

        const paths = walkRepositoryFiles(root).map(
            (file) => file.relativePath,
        );

        expect(paths).toContain('src/app.ts');
        expect(paths).not.toContain('logs/debug.log');
        expect(paths).not.toContain('scratch.tmp');
    });

    it('excludes files larger than the configured limit', () => {
        const root = makeTempDirectory();

        writeFile(root, 'small.txt', '1234');
        writeFile(root, 'large.txt', '12345');

        const paths = walkRepositoryFiles(root, {
            maxFileSizeBytes: 4,
        }).map((file) => file.relativePath);

        expect(paths).toContain('small.txt');
        expect(paths).not.toContain('large.txt');
    });

    it('excludes binary files containing NUL bytes', () => {
        const root = makeTempDirectory();

        writeFile(root, 'source.ts', 'const value = 1;');
        writeFile(root, 'image.bin', Buffer.from([0, 1, 2, 3]));

        const paths = walkRepositoryFiles(root).map(
            (file) => file.relativePath,
        );

        expect(paths).toContain('source.ts');
        expect(paths).not.toContain('image.bin');
    });

    it('does not follow symbolic links', () => {
        const root = makeTempDirectory();
        const outside = makeTempDirectory();

        writeFile(root, 'inside.ts', 'inside');
        writeFile(outside, 'outside.ts', 'outside');

        try {
            symlinkSync(
                outside,
                path.join(root, 'linked-directory'),
                'dir',
            );
        } catch {
            // Some Windows environments require elevated permissions for symlinks.
            return;
        }

        const paths = walkRepositoryFiles(root).map(
            (file) => file.relativePath,
        );

        expect(paths).toContain('inside.ts');
        expect(paths.some((file) => file.includes('linked-directory'))).toBe(false);
    });

    it('returns an empty array for a missing root', () => {
        const missingRoot = path.join(
            os.tmpdir(),
            'repoguard-walker-missing-root',
        );

        expect(walkRepositoryFiles(missingRoot)).toEqual([]);
    });

    it('rejects an invalid size limit', () => {
        const root = makeTempDirectory();

        expect(() =>
            walkRepositoryFiles(root, { maxFileSizeBytes: -1 }),
        ).toThrow(RangeError);
    });
});
