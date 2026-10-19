/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/security/path-traversal.test.ts
 * Owner: Pratham / Team Lead
 * Purpose: Security test: block malicious ../ path traversal attempts in patches
 */

import { describe, it, expect } from 'vitest';
import {
  validateSafePath,
  isPathSafe,
  validatePatch,
} from '../../src/repair/patch-parser.js';

describe('Security: Path Traversal & Unsafe Path Defense', () => {
  const repoRoot = 'd:/Projects/Hackathon/repoguard';

  describe('Parent Directory Traversal (../)', () => {
    const maliciousPaths = [
      '../outside.txt',
      '../../etc/passwd',
      '../../../root/.ssh/id_rsa',
      'src/../../secrets.env',
      'src/repair/../../../escape.sh',
      '..\\..\\windows\\system32',
      'nested/../../../../etc/shadow',
      './../top.secret',
    ];

    maliciousPaths.forEach((badPath) => {
      it(`rejects traversal path: "${badPath}"`, () => {
        const result = validateSafePath(badPath, repoRoot);
        expect(result.safe).toBe(false);
        expect(isPathSafe(badPath, repoRoot)).toBe(false);
        expect(result.error).toMatch(/traversal|escapes/i);
      });
    });
  });

  describe('Absolute System & Network Paths', () => {
    const absolutePaths = [
      '/etc/passwd',
      '/var/log/syslog',
      '/root/.bashrc',
      'C:\\Windows\\System32\\cmd.exe',
      'C:/boot.ini',
      'D:\\sensitive\\db.sqlite',
      '\\\\network-share\\confidential\\key.pem',
      '//smb-server/share/file.txt',
    ];

    absolutePaths.forEach((absPath) => {
      it(`blocks absolute/UNC path: "${absPath}"`, () => {
        const result = validateSafePath(absPath, repoRoot);
        expect(result.safe).toBe(false);
        expect(isPathSafe(absPath, repoRoot)).toBe(false);
        expect(result.error).toMatch(/absolute|prohibited|unc/i);
      });
    });
  });

  describe('Null-byte & Device Name Injection', () => {
    it('blocks null-byte injection attempt', () => {
      const nullPath = 'src/app.ts\0.exe';
      const result = validateSafePath(nullPath, repoRoot);
      expect(result.safe).toBe(false);
      expect(result.error).toContain('null-byte');
    });

    it('blocks Windows reserved device names (CON, NUL, AUX)', () => {
      expect(isPathSafe('CON', repoRoot)).toBe(false);
      expect(isPathSafe('src/NUL.txt', repoRoot)).toBe(false);
      expect(isPathSafe('PRN', repoRoot)).toBe(false);
      expect(isPathSafe('AUX.json', repoRoot)).toBe(false);
      expect(isPathSafe('COM1', repoRoot)).toBe(false);
      expect(isPathSafe('LPT1', repoRoot)).toBe(false);
    });
  });

  describe('Patch Traversal Blocking via validatePatch()', () => {
    it('rejects patches targeting files outside repository via --- or +++', () => {
      const maliciousDiff = `--- a/../../etc/passwd
+++ b/../../etc/passwd
@@ -1,1 +1,1 @@
-root:x:0:0:root:/root:/bin/bash
+root:x:0:0:pwned:/root:/bin/bash`;

      const validation = validatePatch(maliciousDiff, { repoRoot });
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors.some((e) => e.includes('Unsafe path in patch'))).toBe(true);
    });

    it('rejects patches targeting absolute paths', () => {
      const maliciousDiff = `--- a/src/safe.ts
+++ b/C:/Windows/System32/evil.dll
@@ -1,1 +1,1 @@
-safe
+malicious`;

      const validation = validatePatch(maliciousDiff, { repoRoot });
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('Unsafe path in patch'))).toBe(true);
    });

    it('rejects patches with disguised internal traversal', () => {
      const maliciousDiff = `--- a/src/services/../../../var/www/index.php
+++ b/src/services/../../../var/www/index.php
@@ -1,1 +1,1 @@
-<?php echo 'ok'; ?>
+<?php eval($_POST['cmd']); ?>`;

      const validation = validatePatch(maliciousDiff, { repoRoot });
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('Unsafe path in patch'))).toBe(true);
    });
  });

  describe('Legitimate Repository Paths', () => {
    const validPaths = [
      'src/index.ts',
      'src/repair/approval-gate.ts',
      'tests/unit/app.test.ts',
      'package.json',
      'nested/subfolder/config.yaml',
      './local-script.js',
    ];

    validPaths.forEach((goodPath) => {
      it(`accepts valid repository path: "${goodPath}"`, () => {
        const result = validateSafePath(goodPath, repoRoot);
        expect(result.safe).toBe(true);
        expect(isPathSafe(goodPath, repoRoot)).toBe(true);
        expect(result.normalizedPath).toBeDefined();
      });
    });
  });
});

