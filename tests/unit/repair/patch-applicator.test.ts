/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/repair/patch-applicator.test.ts
 * Owner: Pratham
 * Purpose: Unit tests for safe patch application, atomic file writes, and rollback
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  applyHunksToString,
  applyPatch,
  PatchApplicator,
} from '../../../src/repair/patch-applicator.js';

describe('PatchApplicator & applyHunksToString', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'repoguard-patch-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('applyHunksToString', () => {
    it('applies simple single hunk replacement to content', () => {
      const original = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';
      const hunks = [
        {
          header: { oldStart: 2, oldLines: 1, newStart: 2, newLines: 1 },
          rawHeader: '@@ -2,1 +2,1 @@',
          lines: [
            { type: 'deletion' as const, content: 'const b = 2;' },
            { type: 'addition' as const, content: 'const b = 200;' },
          ],
        },
      ];

      const { updatedContent, hunksApplied } = applyHunksToString(original, hunks);
      expect(hunksApplied).toBe(1);
      expect(updatedContent).toBe('const a = 1;\nconst b = 200;\nconst c = 3;\n');
    });

    it('handles cumulative offsets across multiple hunks', () => {
      const original = 'line 1\nline 2\nline 3\nline 4\nline 5\n';
      const hunks = [
        {
          header: { oldStart: 2, oldLines: 1, newStart: 2, newLines: 2 },
          rawHeader: '@@ -2,1 +2,2 @@',
          lines: [
            { type: 'deletion' as const, content: 'line 2' },
            { type: 'addition' as const, content: 'line 2.1' },
            { type: 'addition' as const, content: 'line 2.2' },
          ],
        },
        {
          header: { oldStart: 4, oldLines: 1, newStart: 5, newLines: 1 },
          rawHeader: '@@ -4,1 +5,1 @@',
          lines: [
            { type: 'deletion' as const, content: 'line 4' },
            { type: 'addition' as const, content: 'line 4-mod' },
          ],
        },
      ];

      const { updatedContent, hunksApplied } = applyHunksToString(original, hunks);
      expect(hunksApplied).toBe(2);
      expect(updatedContent).toContain('line 2.1\nline 2.2\nline 3\nline 4-mod');
    });

    it('throws error when context does not match', () => {
      const original = 'line A\nline B\n';
      const hunks = [
        {
          header: { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1 },
          rawHeader: '@@ -1,1 +1,1 @@',
          lines: [
            { type: 'deletion' as const, content: 'non-existent line' },
            { type: 'addition' as const, content: 'new line' },
          ],
        },
      ];

      expect(() => applyHunksToString(original, hunks)).toThrow(/Failed to locate matching context/);
    });
  });

  describe('applyPatch to Workspace Files', () => {
    it('modifies an existing file on disk', async () => {
      const filePath = join(tempDir, 'sample.ts');
      await writeFile(filePath, 'function test() {\n  return false;\n}\n');

      const diff = `--- a/sample.ts
+++ b/sample.ts
@@ -1,3 +1,3 @@
 function test() {
-  return false;
+  return true;
 }`;

      const result = await applyPatch(diff, { repoRoot: tempDir });
      expect(result.success).toBe(true);
      expect(result.appliedFiles).toHaveLength(1);
      expect(result.appliedFiles[0]?.filePath).toBe('sample.ts');

      const updated = await readFile(filePath, 'utf8');
      expect(updated).toContain('return true;');
    });

    it('creates a new file when patch has /dev/null oldPath', async () => {
      const diff = `--- /dev/null
+++ b/src/new-feature.ts
@@ -0,0 +1,2 @@
+export const created = true;
+export const version = '1.0';`;

      const result = await applyPatch(diff, { repoRoot: tempDir });
      expect(result.success).toBe(true);
      expect(result.appliedFiles[0]?.isNewFile).toBe(true);

      const createdFile = await readFile(join(tempDir, 'src/new-feature.ts'), 'utf8');
      expect(createdFile).toContain('export const created = true;');
    });

    it('deletes an existing file when newPath is /dev/null', async () => {
      const filePath = join(tempDir, 'deprecated.ts');
      await writeFile(filePath, 'export const old = true;\n');

      const diff = `--- a/deprecated.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-export const old = true;`;

      const result = await applyPatch(diff, { repoRoot: tempDir });
      expect(result.success).toBe(true);
      expect(result.appliedFiles[0]?.isDeletedFile).toBe(true);

      await expect(stat(filePath)).rejects.toThrow();
    });

    it('does not write to disk in dryRun mode', async () => {
      const filePath = join(tempDir, 'dryrun.ts');
      await writeFile(filePath, 'const value = 1;');

      const diff = `--- a/dryrun.ts
+++ b/dryrun.ts
@@ -1,1 +1,1 @@
-const value = 1;
+const value = 999;`;

      const result = await applyPatch(diff, { repoRoot: tempDir, dryRun: true });
      expect(result.success).toBe(true);

      const content = await readFile(filePath, 'utf8');
      expect(content).toBe('const value = 1;');
    });

    it('rolls back previously modified files if subsequent file patch fails', async () => {
      const file1 = join(tempDir, 'file1.ts');
      const file2 = join(tempDir, 'file2.ts');

      await writeFile(file1, 'original content 1');
      await writeFile(file2, 'original content 2');

      // 2-file patch: file1 matches, but file2 has mismatched context that will fail
      const diff = `--- a/file1.ts
+++ b/file1.ts
@@ -1,1 +1,1 @@
-original content 1
+modified content 1
--- a/file2.ts
+++ b/file2.ts
@@ -1,1 +1,1 @@
-this will not match
+modified content 2`;

      const result = await applyPatch(diff, { repoRoot: tempDir });
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      // Verify file1 was rolled back to original content
      const file1After = await readFile(file1, 'utf8');
      expect(file1After).toBe('original content 1');
    });

    it('rejects patches attempting path traversal', async () => {
      const diff = `--- a/../../outside.ts
+++ b/../../outside.ts
@@ -1,1 +1,1 @@
-bad
+good`;

      const result = await applyPatch(diff, { repoRoot: tempDir });
      expect(result.success).toBe(false);
      expect(result.errors[0]).toMatch(/prohibited|escapes|unsafe/i);
    });
  });

  describe('PatchApplicator Class Wrapper', () => {
    it('instance methods execute cleanly with configured options', async () => {
      const applicator = new PatchApplicator({ repoRoot: tempDir });
      const target = join(tempDir, 'inst.ts');
      await writeFile(target, 'let x = 0;');

      const diff = `--- a/inst.ts
+++ b/inst.ts
@@ -1,1 +1,1 @@
-let x = 0;
+let x = 100;`;

      const res = await applicator.applyPatch(diff);
      expect(res.success).toBe(true);

      const updated = await readFile(target, 'utf8');
      expect(updated).toBe('let x = 100;');
    });
  });
});
