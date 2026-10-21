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
    getGitStatus,
    getHeadCommit,
    getStagedDiff,
    getUnstagedDiff,
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
});
