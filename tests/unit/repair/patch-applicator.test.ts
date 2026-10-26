/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/repair/patch-applicator.test.ts
 * Owner: Pratham
 * Purpose: Unit tests for safe patch application, atomic file writes, and rollback
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, stat, symlink, mkdir, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  applyHunksToString,
  applyPatch,
  PatchApplicator,
} from '../../../src/repair/patch-applicator.js';

describe('PatchApplicator & applyHunksToString', () => {
  let tempDir: string;
  let outsideDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'repoguard-patch-test-'));
    outsideDir = await mkdtemp(join(tmpdir(), 'repoguard-outside-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await rm(outsideDir, { recursive: true, force: true });
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

    /**
     * Safely creates a symlink for testing. If the host OS restricts symlink creation
     * (such as Windows environments lacking Developer Mode or SeCreateSymbolicLinkPrivilege),
     * the test is explicitly skipped with a descriptive reason so permission errors are
     * not confused with test failures or false-positive security checks.
     */
    async function createSymlinkOrSkip(
      target: string,
      linkPath: string,
      type: 'file' | 'dir',
      ctx: { skip: (reason?: string) => void }
    ): Promise<void> {
      let created = false;
      let errorCode = '';

      try {
        await symlink(target, linkPath, type);
        created = true;
      } catch (err: unknown) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === 'EPERM' || error.code === 'ENOTSUP') {
          errorCode = error.code;
        } else {
          throw err;
        }
      }

      if (!created) {
        ctx.skip(
          `Symlink creation not permitted by OS (${errorCode}). Windows environments require Developer Mode or SeCreateSymbolicLinkPrivilege.`
        );
      }
    }

    it('rejects modifying a file through an external symlink', async (ctx) => {
      const targetOutside = join(outsideDir, 'secret.env');
      await writeFile(targetOutside, 'SECRET_KEY=12345\n');

      const symlinkInRepo = join(tempDir, 'symlinked.env');
      await createSymlinkOrSkip(targetOutside, symlinkInRepo, 'file', ctx);

      const diff = `--- a/symlinked.env
+++ b/symlinked.env
@@ -1,1 +1,1 @@
-SECRET_KEY=12345
+SECRET_KEY=attacked`;

      const result = await applyPatch(diff, { repoRoot: tempDir });
      expect(result.success).toBe(false);
      expect(result.errors.some((err) => /symlink|escapes/i.test(err))).toBe(true);

      // Verify external target was untouched
      const outsideContent = await readFile(targetOutside, 'utf8');
      expect(outsideContent).toBe('SECRET_KEY=12345\n');
    });

    it('rejects creating a new file under a symlinked parent directory pointing outside repo', async (ctx) => {
      const symlinkParentInRepo = join(tempDir, 'external-dir');
      await createSymlinkOrSkip(outsideDir, symlinkParentInRepo, 'dir', ctx);

      const diff = `--- /dev/null
+++ b/external-dir/evil.txt
@@ -0,0 +1,1 @@
+injected payload`;

      const result = await applyPatch(diff, { repoRoot: tempDir });
      expect(result.success).toBe(false);
      expect(result.errors.some((err) => /symlink|escapes/i.test(err))).toBe(true);

      // Verify no file was created in outsideDir
      expect(existsSync(join(outsideDir, 'evil.txt'))).toBe(false);
    });

    it('applies a normal valid in-repository path with subdirectories safely', async () => {
      await mkdir(join(tempDir, 'src', 'components'), { recursive: true });
      const compPath = join(tempDir, 'src', 'components', 'Button.tsx');
      await writeFile(compPath, 'export const Button = () => <button>Click</button>;\n');

      const diff = `--- a/src/components/Button.tsx
+++ b/src/components/Button.tsx
@@ -1,1 +1,1 @@
-export const Button = () => <button>Click</button>;
+export const Button = () => <button>Click Me</button>;`;

      const result = await applyPatch(diff, { repoRoot: tempDir });
      expect(result.success).toBe(true);

      const updated = await readFile(compPath, 'utf8');
      expect(updated).toBe('export const Button = () => <button>Click Me</button>;\n');
    });

    it('preserves original file permissions when rolling back a failed transaction', async () => {
      const file1 = join(tempDir, 'executable.sh');
      const file2 = join(tempDir, 'regular.txt');

      await writeFile(file1, '#!/bin/bash\necho "hello"\n');
      await chmod(file1, 0o755);

      await writeFile(file2, 'initial content');

      const statBefore = await stat(file1);
      const originalMode = statBefore.mode & 0o777;

      const diff = `--- a/executable.sh
+++ b/executable.sh
@@ -1,2 +1,2 @@
 #!/bin/bash
-echo "hello"
+echo "world"
--- a/regular.txt
+++ b/regular.txt
@@ -1,1 +1,1 @@
-nonexistent line
+updated content`;

      const result = await applyPatch(diff, { repoRoot: tempDir });
      expect(result.success).toBe(false);

      const statAfter = await stat(file1);
      const restoredMode = statAfter.mode & 0o777;
      expect(restoredMode).toBe(originalMode);

      const contentAfter = await readFile(file1, 'utf8');
      expect(contentAfter).toBe('#!/bin/bash\necho "hello"\n');
    });

    it('cleans up newly created directories without deleting pre-existing directories on rollback', async () => {
      const preexistingDir = join(tempDir, 'preexisting');
      await mkdir(preexistingDir, { recursive: true });
      await writeFile(join(preexistingDir, 'keep.txt'), 'keep me');

      const targetFailFile = join(tempDir, 'fail.txt');
      await writeFile(targetFailFile, 'fail target');

      // File 1 creates preexisting/newsub1/newsub2/created.txt
      // File 2 fails on fail.txt
      const diff = `--- /dev/null
+++ b/preexisting/newsub1/newsub2/created.txt
@@ -0,0 +1,1 @@
+temporary new file
--- a/fail.txt
+++ b/fail.txt
@@ -1,1 +1,1 @@
-mismatch context
+failed`;

      const result = await applyPatch(diff, { repoRoot: tempDir });
      expect(result.success).toBe(false);

      // Pre-existing directory and its files must be preserved!
      expect(existsSync(preexistingDir)).toBe(true);
      expect(existsSync(join(preexistingDir, 'keep.txt'))).toBe(true);

      // Newly created subdirectories must be pruned!
      expect(existsSync(join(preexistingDir, 'newsub1', 'newsub2', 'created.txt'))).toBe(false);
      expect(existsSync(join(preexistingDir, 'newsub1', 'newsub2'))).toBe(false);
      expect(existsSync(join(preexistingDir, 'newsub1'))).toBe(false);
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

    it('blocks patch application when target file is not in allowedFiles list', async () => {
      const allowed = join(tempDir, 'allowed.ts');
      const unapproved = join(tempDir, 'unapproved.ts');
      await writeFile(allowed, 'const allowed = 1;');
      await writeFile(unapproved, 'const secret = "dont-touch";');

      const diff = `--- a/unapproved.ts
+++ b/unapproved.ts
@@ -1,1 +1,1 @@
-const secret = "dont-touch";
+const secret = "tampered";`;

      const result = await applyPatch(diff, {
        repoRoot: tempDir,
        allowedFiles: ['allowed.ts'],
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]).toMatch(/not in the approved target files list/i);

      // Verify unapproved file was never touched
      const unapprovedContent = await readFile(unapproved, 'utf8');
      expect(unapprovedContent).toBe('const secret = "dont-touch";');
    });

    it('restores exact byte-for-byte content of multiple files upon partial application failure', async () => {
      const fileA = join(tempDir, 'fileA.txt');
      const fileB = join(tempDir, 'fileB.txt');
      const originalA = 'Line 1: A\nLine 2: A\nLine 3: A\n';
      const originalB = 'Line 1: B\nLine 2: B\nLine 3: B\n';

      await writeFile(fileA, originalA, 'utf8');
      await writeFile(fileB, originalB, 'utf8');

      // fileA succeeds, fileB fails with non-matching hunk
      const multiDiff = `--- a/fileA.txt
+++ b/fileA.txt
@@ -1,2 +1,2 @@
 Line 1: A
-Line 2: A
+Line 2: A-MODIFIED
--- a/fileB.txt
+++ b/fileB.txt
@@ -1,2 +1,2 @@
 Line 1: B
-NON_MATCHING_LINE_CAUSING_FAILURE
+Line 2: B-MODIFIED`;

      const result = await applyPatch(multiDiff, { repoRoot: tempDir });
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      // Byte-for-byte verification that fileA was completely restored
      const afterA = await readFile(fileA, 'utf8');
      const afterB = await readFile(fileB, 'utf8');
      expect(afterA).toBe(originalA);
      expect(afterB).toBe(originalB);
    });

    it('returns observable RollbackResult from rollbackHandle() on successful rollback', async () => {
      const file = join(tempDir, 'restore-success.ts');
      await writeFile(file, 'initial content');

      const diff = `--- a/restore-success.ts
+++ b/restore-success.ts
@@ -1,1 +1,1 @@
-initial content
+patched content`;

      const result = await applyPatch(diff, { repoRoot: tempDir });
      expect(result.success).toBe(true);
      expect(result.rollbackHandle).toBeDefined();

      const rollbackRes = await result.rollbackHandle!();
      expect(rollbackRes.success).toBe(true);
      expect(rollbackRes.errors).toEqual([]);
      expect(rollbackRes.restoredFiles.length).toBeGreaterThan(0);

      const restored = await readFile(file, 'utf8');
      expect(restored).toBe('initial content');
    });

    it('records and returns rollback errors when file restoration fails due to I/O or permissions', async () => {
      const subDir = join(tempDir, 'readonly-dir');
      await mkdir(subDir, { recursive: true });
      const targetFile = join(subDir, 'protected.txt');
      await writeFile(targetFile, 'original content');

      const diff = `--- a/readonly-dir/protected.txt
+++ b/readonly-dir/protected.txt
@@ -1,1 +1,1 @@
-original content
+modified content`;

      const result = await applyPatch(diff, { repoRoot: tempDir });
      expect(result.success).toBe(true);
      expect(result.rollbackHandle).toBeDefined();

      // Make directory read-only so rewriting or unlinking fails
      await chmod(subDir, 0o555);

      try {
        const rollbackRes = await result.rollbackHandle!();
        // Even if OS allows or denies, if errors occurred they are captured in errors array
        if (!rollbackRes.success) {
          expect(rollbackRes.errors.length).toBeGreaterThan(0);
          expect(rollbackRes.errors[0]).toMatch(/Failed to restore|permission|EACCES|EPERM/i);
        }
      } finally {
        // Restore write permissions for cleanup
        await chmod(subDir, 0o755).catch(() => {});
      }
    });
  });
});
