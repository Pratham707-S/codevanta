/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/context/context-builder.ts
 * Owner: Manni
 * Purpose: Context builder: assemble bounded code slices, ranking and token budgeting
 *
 * @todo Implementation planned in assigned milestone.
 */

import { describe, expect, it } from 'vitest';
import { buildContext } from '../../../src/context/context-builder.js';

describe('buildContext', () => {
    it('sorts files by relative path', () => {
        const result = buildContext([
            { relativePath: 'src/z.ts', content: 'z' },
            { relativePath: 'src/a.ts', content: 'a' },
        ]);

        expect(result.files.map((file) => file.relativePath)).toEqual([
            'src/a.ts',
            'src/z.ts',
        ]);
    });

    it('respects the maximum number of files', () => {
        const result = buildContext(
            [
                { relativePath: 'a.ts', content: 'A' },
                { relativePath: 'b.ts', content: 'B' },
                { relativePath: 'c.ts', content: 'C' },
            ],
            { maxFiles: 2 },
        );

        expect(result.files).toHaveLength(2);
        expect(result.skippedFiles).toEqual(['c.ts']);
    });

    it('respects the total character budget', () => {
        const result = buildContext(
            [
                { relativePath: 'a.ts', content: '12345' },
                { relativePath: 'b.ts', content: '67890' },
            ],
            { maxTotalCharacters: 7, maxFileCharacters: 10 },
        );

        expect(result.totalCharacters).toBe(7);
        expect(result.files[0].content).toBe('12345');
        expect(result.files[1].content).toBe('67');
    });

    it('respects the per-file character limit', () => {
        const result = buildContext(
            [{ relativePath: 'a.ts', content: 'abcdefgh' }],
            { maxFileCharacters: 3 },
        );

        expect(result.files[0].content).toBe('abc');
        expect(result.totalCharacters).toBe(3);
    });

    it('redacts secrets before returning context', () => {
        const result = buildContext([
            {
                relativePath: 'config.ts',
                content: 'const password = "mySecret123";',
            },
        ]);

        expect(result.files[0].content).not.toContain('mySecret123');
        expect(result.files[0].content).toContain('[REDACTED]');
    });

    it('skips empty files', () => {
        const result = buildContext([
            { relativePath: 'empty.ts', content: '' },
        ]);

        expect(result.files).toHaveLength(0);
        expect(result.skippedFiles).toEqual(['empty.ts']);
    });

    it('rejects invalid limits', () => {
        expect(() => buildContext([], { maxFiles: -1 })).toThrow(
            RangeError,
        );

        expect(() =>
            buildContext([], { maxTotalCharacters: 1.5 }),
        ).toThrow(RangeError);
    });

    it('returns zero characters for empty input', () => {
        const result = buildContext([]);

        expect(result.files).toEqual([]);
        expect(result.totalCharacters).toBe(0);
        expect(result.skippedFiles).toEqual([]);
    });

    it('redacts secrets before applying the file character limit', () => {
        const secret = 'password=mySecret123';
        const result = buildContext(
            [
                {
                    relativePath: 'config.ts',
                    content: `prefix=${'a'.repeat(20)}; ${secret}`,
                },
            ],
            { maxFileCharacters: 30, maxTotalCharacters: 100 },
        );

        expect(result.files).toHaveLength(1);
        expect(result.files[0].content).not.toContain('mySecret123');
    });

    it('does not leak a secret that starts beyond the character limit', () => {
        const secret = 'password=mySecret123';
        const result = buildContext(
            [
                {
                    relativePath: 'config.ts',
                    content: `${'a'.repeat(30)}${secret}`,
                },
            ],
            { maxFileCharacters: 30, maxTotalCharacters: 100 },
        );

        expect(result.files[0].content).not.toContain('mySecret123');
    });

    it('does not include a partial redaction marker when truncated', () => {
        const result = buildContext(
            [
                {
                    relativePath: 'config.ts',
                    content: 'password=mySecret123',
                },
            ],
            {
                maxFileCharacters: 5,
                maxTotalCharacters: 100,
            },
        );

        expect(result.files[0].content).not.toContain('[REDA');
        expect(result.files[0].content).not.toContain('mySecret123');
    });
});
