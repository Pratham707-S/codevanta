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
import path from 'node:path';

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

export interface GitBlameLine {
    line: number;
    commit: string;
    author: string;
    authorEmail: string;
    timestamp: number;
    summary: string;
    content: string;
}

/**
 * Reads Git blame metadata for a file or a selected line range.
 * Returns null if the repository, file, or requested range is invalid.
 */

export function getGitBlame(
    rootPath: string,
    filePath: string,
    startLine?: number,
    endLine?: number,
): GitBlameLine[] | null {
    if (
        !filePath ||
        path.isAbsolute(filePath) ||
        /^[a-zA-Z]:/.test(filePath) ||
        filePath.startsWith('\\\\') ||
        filePath.split(/[\\/]+/).includes('..') ||
        (startLine !== undefined &&
            (!Number.isSafeInteger(startLine) || startLine < 1)) ||
        (endLine !== undefined &&
            (!Number.isSafeInteger(endLine) || endLine < 1)) ||
        (startLine !== undefined &&
            endLine !== undefined &&
            startLine > endLine)
    ) {
        return null;
    }

    try {
        const args = ['blame', '--line-porcelain'];

        if (startLine !== undefined || endLine !== undefined) {
            const first = startLine ?? endLine!;
            const last = endLine ?? first;
            args.push('-L', `${first},${last}`);
        }

        args.push('--', filePath);

        const output = runGit(rootPath, args);
        return parseGitBlameOutput(output);
    } catch {
        return null;
    }
}


/**
 * Parses Git's --line-porcelain output.
 * Returns null when the output is empty or required metadata is invalid.
 */
export function parseGitBlameOutput(
    output: string,
): GitBlameLine[] | null {
    const lines = output.split(/\r?\n/);
    const result: GitBlameLine[] = [];
    let current: GitBlameLine | null = null;
    let invalid = false;

    for (const line of lines) {
        const header = line.match(
            /^(\^?[0-9a-f]{40,64}) (\d+) (\d+)(?: \d+)?$/,
        );

        if (header) {
            const commit = header[1].replace(/^\^/, '');
            const originalLine = Number(header[2]);
            const finalLine = Number(header[3]);

            if (
                !/^[0-9a-f]{40,64}$/.test(commit) ||
                !Number.isSafeInteger(originalLine) ||
                !Number.isSafeInteger(finalLine) ||
                originalLine < 1 ||
                finalLine < 1
            ) {
                invalid = true;
                break;
            }

            current = {
                commit,
                line: finalLine,
                author: '',
                authorEmail: '',
                timestamp: 0,
                summary: '',
                content: '',
            };

            result.push(current);
            continue;
        }

        if (!current) continue;

        if (line.startsWith('\t')) {
            current.content = line.slice(1);
        } else if (line.startsWith('author ')) {
            current.author = line.slice('author '.length);
        } else if (line.startsWith('author-mail ')) {
            current.authorEmail = line
                .slice('author-mail '.length)
                .replace(/^<|>$/g, '');
        } else if (line.startsWith('author-time ')) {
            const timestamp = Number(
                line.slice('author-time '.length),
            );

            if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
                invalid = true;
                break;
            }

            current.timestamp = timestamp;
        } else if (line.startsWith('summary ')) {
            current.summary = line.slice('summary '.length);
        }
    }

    if (
        invalid ||
        result.length === 0 ||
        result.some(
            (entry) =>
                !entry.author ||
                !entry.authorEmail ||
                entry.timestamp <= 0 ||
                !entry.summary ||
                !/^[0-9a-f]{40,64}$/.test(entry.commit),
        )
    ) {
        return null;
    }

    return result;
}
