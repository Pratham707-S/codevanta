/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/cli/interactive.test.ts
 * Purpose: Unit tests for interactive mode, startup animation, Clack menu routing, and CLI mode dispatching
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as p from '@clack/prompts';
import {
  playInteractiveStartup,
  runInteractiveMode,
} from '../../../src/cli/interactive.js';
import { runCli } from '../../../src/cli/cli.js';

vi.mock('@clack/prompts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@clack/prompts')>();
  return {
    ...actual,
    intro: vi.fn(),
    outro: vi.fn(),
    select: vi.fn(),
    text: vi.fn(),
    confirm: vi.fn(),
    note: vi.fn(),
    isCancel: vi.fn((val: unknown) => typeof val === 'symbol' || val === 'cancel'),
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      step: vi.fn(),
      message: vi.fn(),
    },
  };
});

describe('Interactive Mode & CLI UX', () => {
  let logLines: string[] = [];
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logLines = [];
    logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logLines.push(args.map(String).join(' '));
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  describe('Animated Startup & Logo', () => {
    it('renders the compact ASCII logo and application version', async () => {
      await playInteractiveStartup({ version: '0.1.0', animated: false });
      const output = logLines.join('\n');

      expect(output).toContain('___');
      expect(output).toContain('RepoGuard');
      expect(output).toContain('v0.1.0');
    });

    it('displays genuine initialization checks in startup', async () => {
      await playInteractiveStartup({ version: '0.1.0', animated: false });
      const output = logLines.join('\n');

      expect(output).toContain('Runtime: Node.js verified');
      expect(output).toContain('Storage: Audit database ready');
      expect(output).toContain('Security: Policy validator active');
    });

    it('respects NO_COLOR / --no-color environment flag', async () => {
      const originalNoColor = process.env['NO_COLOR'];
      process.env['NO_COLOR'] = '1';

      await playInteractiveStartup({ version: '0.1.0', animated: false });
      const output = logLines.join('\n');

      // Uncolored output should not contain raw escape characters
      expect(output).toContain('_____');
      expect(output).toContain('RepoGuard v0.1.0');
      expect(output).not.toContain('\x1b[');

      if (originalNoColor !== undefined) {
        process.env['NO_COLOR'] = originalNoColor;
      } else {
        delete process.env['NO_COLOR'];
      }
    });
  });

  describe('Two-Mode Startup Selection Screen', () => {
    it('displays Option 1 (Interactive Mode) and Option 2 (Manual Mode)', async () => {
      vi.mocked(p.select).mockResolvedValueOnce('manual' as never);

      await runInteractiveMode({ version: '0.1.0', animated: false });

      expect(p.select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Choose how you would like to run RepoGuard'),
          options: expect.arrayContaining([
            expect.objectContaining({ value: 'interactive', label: expect.stringContaining('Interactive Mode') }),
            expect.objectContaining({ value: 'manual', label: expect.stringContaining('Manual Mode') }),
          ]),
        })
      );
    });

    it('Option 2 (Manual Mode) displays command reference and exits to terminal', async () => {
      vi.mocked(p.select).mockResolvedValueOnce('manual' as never);

      await runInteractiveMode({ version: '0.1.0', animated: false });

      expect(p.note).toHaveBeenCalledWith(
        expect.stringContaining('repoguard scan [target]'),
        'Manual Mode — Command Reference'
      );
      expect(p.outro).toHaveBeenCalledWith(
        expect.stringContaining('Type any command above in your terminal to execute directly')
      );
    });

    it('Option 1 (Interactive Mode) enters feature menu and exits cleanly when Exit is selected', async () => {
      vi.mocked(p.select)
        .mockResolvedValueOnce('interactive' as never)
        .mockResolvedValueOnce('exit' as never);

      await runInteractiveMode({ version: '0.1.0', animated: false, maxIterations: 1 });

      expect(p.intro).toHaveBeenCalled();
      expect(p.outro).toHaveBeenCalledWith(expect.stringContaining('Stay secure!'));
    });

    it('handles cancellation gracefully on mode selection', async () => {
      const cancelSymbol = Symbol('clack:cancel');
      vi.mocked(p.select).mockResolvedValueOnce(cancelSymbol as never);

      await runInteractiveMode({ version: '0.1.0', animated: false });

      expect(p.outro).toHaveBeenCalledWith(expect.stringContaining('Stay secure!'));
    });

    it('displays honest status for planned repairs feature under interactive mode', async () => {
      vi.mocked(p.select)
        .mockResolvedValueOnce('interactive' as never)
        .mockResolvedValueOnce('repairs' as never)
        .mockResolvedValueOnce('exit' as never);

      await runInteractiveMode({ version: '0.1.0', animated: false, maxIterations: 2 });

      expect(p.note).toHaveBeenCalledWith(
        expect.stringContaining('Automated AST Patch Synthesis & Isolated Sandbox Verification are scheduled for Milestone 3'),
        'Repair Verification Engine'
      );
    });

    it('displays honest status for secret detection feature under interactive mode', async () => {
      vi.mocked(p.select)
        .mockResolvedValueOnce('interactive' as never)
        .mockResolvedValueOnce('secrets' as never)
        .mockResolvedValueOnce('exit' as never);
      vi.mocked(p.confirm).mockResolvedValueOnce(false as never);

      await runInteractiveMode({ version: '0.1.0', animated: false, maxIterations: 2 });

      expect(p.note).toHaveBeenCalledWith(
        expect.stringContaining('Active secret masking and token redaction is enforced during all repository scans'),
        'Secret Detection'
      );
    });

    it('displays CLI quick reference for help & documentation under interactive mode', async () => {
      vi.mocked(p.select)
        .mockResolvedValueOnce('interactive' as never)
        .mockResolvedValueOnce('help' as never)
        .mockResolvedValueOnce('exit' as never);
      vi.mocked(p.confirm).mockResolvedValueOnce(false as never);

      await runInteractiveMode({ version: '0.1.0', animated: false, maxIterations: 2 });

      expect(p.note).toHaveBeenCalledWith(
        expect.stringContaining('Direct CLI Commands'),
        'CLI Quick Reference'
      );
    });

    it('loops back to main menu after completing an operation until exit', async () => {
      vi.mocked(p.select)
        .mockResolvedValueOnce('interactive' as never)
        .mockResolvedValueOnce('repairs' as never)
        .mockResolvedValueOnce('repairs' as never)
        .mockResolvedValueOnce('exit' as never);

      await runInteractiveMode({ version: '0.1.0', animated: false, maxIterations: 5 });

      // select was invoked 4 times (1 mode select + 2 repairs + 1 exit)
      expect(p.select).toHaveBeenCalledTimes(4);
      expect(p.outro).toHaveBeenCalled();
    });
  });

  describe('Mode Dispatching & Non-Interactive Behavior', () => {
    it('outputs help text and does not block when invoked in non-interactive/CI environment without args', async () => {
      const originalCI = process.env['CI'];
      process.env['CI'] = 'true';

      await runCli(['node', 'repoguard']);

      expect(p.intro).not.toHaveBeenCalled();
      expect(p.select).not.toHaveBeenCalled();

      if (originalCI !== undefined) {
        process.env['CI'] = originalCI;
      } else {
        delete process.env['CI'];
      }
    });

    it('executes direct commands without invoking interactive mode', async () => {
      await runCli(['node', 'repoguard', 'status']);

      expect(p.intro).not.toHaveBeenCalled();
      expect(p.select).not.toHaveBeenCalled();
      const output = logLines.join('\n');
      expect(output).toContain('RepoGuard Repository Status');
    });

    it('preserves clean JSON output in direct mode without interactive UI', async () => {
      await runCli(['node', 'repoguard', 'status', '--json']);

      expect(p.intro).not.toHaveBeenCalled();
      expect(p.select).not.toHaveBeenCalled();
      const output = logLines.join('\n');
      expect(output).not.toContain('RepoGuard Interactive Console');
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('state');
    });
  });
});
