/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/repository/git-reader.ts
 * Owner: Manni
 * Purpose: Git access: read tree status, HEAD commit SHA, staged/unstaged diffs
 *
 * @todo Implementation planned in assigned milestone.
 */

import { execFileSync } from 'node:child_process';

export interface GitFileStatus {
    indexStatus: string;
    workingTreeStatus: string;
    path: string;
}

export interface GitRepositoryStatus {
    branch: string | null;
    isClean: boolean;
    files: GitFileStatus[];
}

function runGit(rootPath: string, args: string[]): string {
    return execFileSync('git', args, {
        cwd: rootPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    }).trimEnd();
}

/**
 * Reads the current branch and changed-file status.
 * Returns null if the path is not a valid Git repository.
 */
export function getGitStatus(
    rootPath: string,
): GitRepositoryStatus | null {
    try {
        const output = runGit(rootPath, [
            'status',
            '--porcelain=v1',
            '--branch',
            '--untracked-files=all',
        ]);

        const lines = output ? output.split(/\r?\n/) : [];
        const branchLine = lines.find((line) => line.startsWith('## '));
        const branchInfo = branchLine?.slice(3) ?? '';
        const branch = branchInfo
            ? branchInfo.split('...')[0].split(' ')[0] || null
            : null;

        const files = lines
            .filter((line) => !line.startsWith('## '))
            .filter((line) => line.length >= 3)
            .map((line) => ({
                indexStatus: line[0],
                workingTreeStatus: line[1],
                path: line.slice(3),
            }));

        return {
            branch,
            isClean: files.length === 0,
            files,
        };
    } catch {
        return null;
    }
}

/**
 * Returns the current HEAD commit SHA, or null if unavailable.
 */
export function getHeadCommit(rootPath: string): string | null {
    try {
        return runGit(rootPath, ['rev-parse', '--verify', 'HEAD']);
    } catch {
        return null;
    }
}

/**
 * Returns staged changes compared with HEAD.
 */
export function getStagedDiff(rootPath: string): string | null {
    try {
        return runGit(rootPath, ['diff', '--cached', '--no-ext-diff', '--']);
    } catch {
        return null;
    }
}

/**
 * Returns unstaged changes in tracked files.
 */
export function getUnstagedDiff(rootPath: string): string | null {
    try {
        return runGit(rootPath, ['diff', '--no-ext-diff', '--']);
    } catch {
        return null;
    }
}

