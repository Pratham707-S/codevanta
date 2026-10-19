/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/repair/patch-parser.test.ts
 * Owner: Pratham
 * Purpose: Unit tests for unified diff parsing and patch validation
 */

import { describe, it, expect } from 'vitest';
import {
  parseUnifiedDiff,
  validatePatch,
  stripDiffPath,
  PatchParser,
} from '../../../src/repair/patch-parser.js';

describe('PatchParser & Diff Parsing', () => {
  describe('stripDiffPath', () => {
    it('strips a/ and b/ prefixes', () => {
      expect(stripDiffPath('a/src/index.ts')).toBe('src/index.ts');
      expect(stripDiffPath('b/src/index.ts')).toBe('src/index.ts');
    });

    it('strips surrounding quotes', () => {
      expect(stripDiffPath('"a/src/file with space.ts"')).toBe('src/file with space.ts');
      expect(stripDiffPath("'b/src/file.ts'")).toBe('src/file.ts');
    });

    it('strips tabbed timestamps', () => {
      expect(stripDiffPath('a/src/file.ts\t2026-10-14 12:00:00')).toBe('src/file.ts');
    });

    it('preserves paths without git prefixes', () => {
      expect(stripDiffPath('src/file.ts')).toBe('src/file.ts');
      expect(stripDiffPath('/dev/null')).toBe('/dev/null');
    });
  });

  describe('parseUnifiedDiff', () => {
    it('returns empty array for empty diff', () => {
      expect(parseUnifiedDiff('')).toEqual([]);
      expect(parseUnifiedDiff('   \n  ')).toEqual([]);
    });

    it('parses standard single-file unified diff', () => {
      const diff = `--- a/src/math.ts
+++ b/src/math.ts
@@ -1,4 +1,4 @@
 export function add(a: number, b: number): number {
-  return a - b;
+  return a + b;
 }`;

      const files = parseUnifiedDiff(diff);
      expect(files).toHaveLength(1);

      const file = files[0]!;
      expect(file.oldPath).toBe('src/math.ts');
      expect(file.newPath).toBe('src/math.ts');
      expect(file.isNewFile).toBe(false);
      expect(file.isDeletedFile).toBe(false);
      expect(file.hunks).toHaveLength(1);

      const hunk = file.hunks[0]!;
      expect(hunk.header.oldStart).toBe(1);
      expect(hunk.header.oldLines).toBe(4);
      expect(hunk.header.newStart).toBe(1);
      expect(hunk.header.newLines).toBe(4);

      expect(hunk.lines).toHaveLength(4);
      expect(hunk.lines[0]).toEqual({
        type: 'context',
        content: 'export function add(a: number, b: number): number {',
        oldLineNumber: 1,
        newLineNumber: 1,
      });
      expect(hunk.lines[1]).toEqual({
        type: 'deletion',
        content: '  return a - b;',
        oldLineNumber: 2,
      });
      expect(hunk.lines[2]).toEqual({
        type: 'addition',
        content: '  return a + b;',
        newLineNumber: 2,
      });
      expect(hunk.lines[3]).toEqual({
        type: 'context',
        content: '}',
        oldLineNumber: 3,
        newLineNumber: 3,
      });
    });

    it('parses multi-hunk diffs', () => {
      const diff = `--- a/src/utils.ts
+++ b/src/utils.ts
@@ -10,3 +10,3 @@ heading1
-const a = 1;
+const a = 2;
 const b = 3;
@@ -50,3 +50,4 @@ heading2
 const x = 10;
+const y = 20;
 const z = 30;`;

      const files = parseUnifiedDiff(diff);
      expect(files).toHaveLength(1);
      expect(files[0]!.hunks).toHaveLength(2);
      expect(files[0]!.hunks[0]!.header.heading).toBe('heading1');
      expect(files[0]!.hunks[1]!.header.heading).toBe('heading2');
    });

    it('parses multi-file diffs', () => {
      const diff = `--- a/file1.ts
+++ b/file1.ts
@@ -1,2 +1,2 @@
-hello
+world
 
--- a/file2.ts
+++ b/file2.ts
@@ -10,2 +10,2 @@
-foo
+bar
 `;

      const files = parseUnifiedDiff(diff);
      expect(files).toHaveLength(2);
      expect(files[0]!.newPath).toBe('file1.ts');
      expect(files[1]!.newPath).toBe('file2.ts');
    });

    it('detects newly created files', () => {
      const diff = `--- /dev/null
+++ b/src/new-feature.ts
@@ -0,0 +1,2 @@
+export const enabled = true;
+export const version = 1;`;

      const files = parseUnifiedDiff(diff);
      expect(files).toHaveLength(1);
      expect(files[0]!.isNewFile).toBe(true);
      expect(files[0]!.newPath).toBe('src/new-feature.ts');
    });

    it('detects deleted files', () => {
      const diff = `--- a/src/deprecated.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-const old = true;
-export default old;`;

      const files = parseUnifiedDiff(diff);
      expect(files).toHaveLength(1);
      expect(files[0]!.isDeletedFile).toBe(true);
      expect(files[0]!.oldPath).toBe('src/deprecated.ts');
    });

    it('handles git header lines (diff --git, index, mode)', () => {
      const diff = `diff --git a/src/app.ts b/src/app.ts
index e69de29..496d642 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,1 +1,2 @@
+// header
 console.log("started");`;

      const files = parseUnifiedDiff(diff);
      expect(files).toHaveLength(1);
      expect(files[0]!.newPath).toBe('src/app.ts');
      expect(files[0]!.hunks).toHaveLength(1);
    });
  });

  describe('validatePatch', () => {
    it('validates a correct unified diff', () => {
      const validDiff = `--- a/src/config.ts
+++ b/src/config.ts
@@ -1,2 +1,2 @@
-const port = 3000;
+const port = 8080;
 const host = "localhost";`;

      const result = validatePatch(validDiff);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.files).toHaveLength(1);
    });

    it('fails on empty patch text', () => {
      const result = validatePatch('');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('empty');
    });

    it('fails when no diff hunks are found', () => {
      const result = validatePatch('Just some random text without headers');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Malformed patch');
    });

    it('flags line count mismatch in strict mode as warnings', () => {
      const diff = `--- a/src/test.ts
+++ b/src/test.ts
@@ -1,10 +1,10 @@
-only one line
+only one replacement`;

      const result = validatePatch(diff, { strictLineCounts: true });
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('line count mismatch');
    });
  });

  describe('PatchParser class wrapper', () => {
    it('class methods delegate accurately', () => {
      const parser = new PatchParser();
      expect(parser.isSafe('src/clean.ts')).toBe(true);
      expect(parser.isSafe('../escape.ts')).toBe(false);

      const diff = `--- a/src/ok.ts
+++ b/src/ok.ts
@@ -1,1 +1,1 @@
-a
+b`;
      expect(parser.parse(diff)).toHaveLength(1);
      expect(parser.validate(diff).valid).toBe(true);
    });
  });
});
