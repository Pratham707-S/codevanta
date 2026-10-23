import {
    execFileSync,
} from 'node:child_process';
import {
    mkdtempSync,
    mkdirSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
    getGitBlame,
    getGitStatus,
    getHeadCommit,
    getStagedDiff,
    getUnstagedDiff,
    parseGitBlameOutput,
} from '../../../src/repository/git-reader.js';

const temporaryDirectories: string[] = [];

function createGitRepository(): string {
    const root = mkdtempSync(
        path.join(os.tmpdir(), 'repoguard-git-reader-'),
    );

    temporaryDirectories.push(root);

    execFileSync('git', ['init', '-b', 'main'], {
        cwd: root,
        stdio: 'ignore',
    });

    execFileSync('git', ['config', 'user.name', 'RepoGuard Test'], {
        cwd: root,
    });

    execFileSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: root,
    });

    writeFileSync(path.join(root, 'README.md'), 'initial content\n');

    execFileSync('git', ['add', 'README.md'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'initial commit'], {
        cwd: root,
        stdio: 'ignore',
    });

    return root;
}

function runGit(root: string, args: string[]): void {
    execFileSync('git', args, {
        cwd: root,
        stdio: 'ignore',
    });
}

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe('parseGitBlameOutput', () => {
    const sha = 'a'.repeat(40);

    it('parses valid blame output and removes boundary marker', () => {
        const output = [
            `^${sha} 1 1 1`,
            'author Test User',
            'author-mail <test@example.com>',
            'author-time 1700000000',
            'summary Initial commit',
            '\tconst value = 42;',
        ].join('\n');

        const result = parseGitBlameOutput(output);

        expect(result).toEqual([
            {
                line: 1,
                commit: sha,
                author: 'Test User',
                authorEmail: 'test@example.com',
                timestamp: 1700000000,
                summary: 'Initial commit',
                content: 'const value = 42;',
            },
        ]);
    });

    it('returns null when required metadata is missing', () => {
        const output = [
            `${sha} 1 1 1`,
            'author Test User',
            '\tconst value = 42;',
        ].join('\n');

        expect(parseGitBlameOutput(output)).toBeNull();
    });

    it('returns null for empty or malformed output', () => {
        expect(parseGitBlameOutput('')).toBeNull();
        expect(parseGitBlameOutput('invalid blame output')).toBeNull();
    });
});

describe('git-reader', () => {
    it('returns the current branch and clean status', () => {
        const root = createGitRepository();

        expect(getGitStatus(root)).toEqual({
            branch: 'main',
            isClean: true,
            files: [],
        });
    });

    it('reports modified and untracked files', () => {
        const root = createGitRepository();

        writeFileSync(path.join(root, 'README.md'), 'updated content\n');
        writeFileSync(path.join(root, 'new.ts'), 'export {};\n');

        const result = getGitStatus(root);

        expect(result?.isClean).toBe(false);
        expect(result?.files).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: 'README.md',
                    workingTreeStatus: 'M',
                }),
                expect.objectContaining({
                    path: 'new.ts',
                    indexStatus: '?',
                    workingTreeStatus: '?',
                }),
            ]),
        );
    });

    it('returns the current HEAD commit SHA', () => {
        const root = createGitRepository();

        const expected = execFileSync(
            'git',
            ['rev-parse', '--verify', 'HEAD'],
            { cwd: root, encoding: 'utf8' },
        ).trim();

        expect(getHeadCommit(root)).toBe(expected);
    });

    it('returns staged changes', () => {
        const root = createGitRepository();

        writeFileSync(path.join(root, 'README.md'), 'staged content\n');
        runGit(root, ['add', 'README.md']);

        const diff = getStagedDiff(root);

        expect(diff).toContain('staged content');
        expect(diff).toContain('README.md');
    });

    it('returns unstaged changes', () => {
        const root = createGitRepository();

        writeFileSync(path.join(root, 'README.md'), 'unstaged content\n');

        const diff = getUnstagedDiff(root);

        expect(diff).toContain('unstaged content');
        expect(diff).toContain('README.md');
    });

    it('returns null for a non-Git directory', () => {
        const root = mkdtempSync(
            path.join(os.tmpdir(), 'repoguard-not-git-'),
        );

        temporaryDirectories.push(root);
        mkdirSync(path.join(root, 'nested'));

        expect(getGitStatus(root)).toBeNull();
        expect(getHeadCommit(root)).toBeNull();
        expect(getStagedDiff(root)).toBeNull();
        expect(getUnstagedDiff(root)).toBeNull();
    });

    it('returns blame metadata for a committed file', () => {
        const root = createGitRepository();

        const result = getGitBlame(root, 'README.md');

        expect(result).not.toBeNull();
        expect(result).toHaveLength(1);
        expect(result?.[0]).toMatchObject({
            line: 1,
            author: 'RepoGuard Test',
            authorEmail: 'test@example.com',
            summary: 'initial commit',
            content: 'initial content',
        });
        expect(result?.[0].commit).toMatch(/^[0-9a-f]{40,64}$/);
        expect(result?.[0].timestamp).toBeGreaterThan(0);
    });

    it('returns null for a missing file', () => {
        const root = createGitRepository();

        expect(getGitBlame(root, 'missing.ts')).toBeNull();
    });

    it('rejects paths outside the repository', () => {
        const root = createGitRepository();

        expect(getGitBlame(root, '../outside.ts')).toBeNull();
        expect(getGitBlame(root, path.resolve(root, 'README.md'))).toBeNull();
    });

    it('returns only the requested line range', () => {
        const root = createGitRepository();

        writeFileSync(
            path.join(root, 'README.md'),
            'line one\nline two\nline three\n',
        );

        runGit(root, ['add', 'README.md']);
        runGit(root, ['commit', '-m', 'add three lines']);

        const result = getGitBlame(root, 'README.md', 2, 2);

        expect(result).toHaveLength(1);
        expect(result?.[0]).toMatchObject({
            line: 2,
            content: 'line two',
            summary: 'add three lines',
        });
    });


    it('rejects Windows-style traversal and absolute paths', () => {
        const root = createGitRepository();

        expect(getGitBlame(root, '..\\outside.ts')).toBeNull();
        expect(getGitBlame(root, 'C:\\outside.ts')).toBeNull();
        expect(getGitBlame(root, '\\\\server\\share\\file.ts')).toBeNull();
    });

    it('rejects invalid line ranges', () => {
        const root = createGitRepository();

        expect(getGitBlame(root, 'README.md', 0)).toBeNull();
        expect(getGitBlame(root, 'README.md', 3, 2)).toBeNull();
        expect(getGitBlame(root, 'README.md', 1.5, 2)).toBeNull();
    });


    it('returns only the start line when only startLine is provided', () => {
        const root = createGitRepository();

        writeFileSync(
            path.join(root, 'README.md'),
            'line one\nline two\nline three\n',
        );

        runGit(root, ['add', 'README.md']);
        runGit(root, ['commit', '-m', 'add three lines']);

        const result = getGitBlame(root, 'README.md', 2);

        expect(result).toHaveLength(1);
        expect(result?.[0]).toMatchObject({
            line: 2,
            content: 'line two',
        });
    });

    it('returns only the end line when only endLine is provided', () => {
        const root = createGitRepository();

        writeFileSync(
            path.join(root, 'README.md'),
            'line one\nline two\nline three\n',
        );

        runGit(root, ['add', 'README.md']);
        runGit(root, ['commit', '-m', 'add three lines']);

        const result = getGitBlame(root, 'README.md', undefined, 3);

        expect(result).toHaveLength(1);
        expect(result?.[0]).toMatchObject({
            line: 3,
            content: 'line three',
        });
    });
});
