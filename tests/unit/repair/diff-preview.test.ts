/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/repair/diff-preview.test.ts
 * Owner: Pratham
 * Purpose: Unit tests for colored diff preview, statistics calculation, and diff generation
 */

import { describe, it, expect } from 'vitest';
import {
  getDiffStats,
  formatDiffStats,
  generateUnifiedDiff,
  renderDiffPreview,
  renderProposalPreview,
  DiffPreviewer,
} from '../../../src/repair/diff-preview.js';

describe('DiffPreview & Diff Generation', () => {
  const sampleDiff = `--- a/src/server.ts
+++ b/src/server.ts
@@ -10,4 +10,5 @@ startServer
 const app = express();
-app.listen(3000);
+const port = process.env.PORT || 8080;
+app.listen(port);
 console.log("running");`;

  describe('getDiffStats', () => {
    it('accurately counts files changed, additions, and deletions', () => {
      const stats = getDiffStats(sampleDiff);
      expect(stats.filesChanged).toBe(1);
      expect(stats.additions).toBe(2);
      expect(stats.deletions).toBe(1);
      expect(stats.files).toHaveLength(1);
      expect(stats.files[0]?.path).toBe('src/server.ts');
      expect(stats.files[0]?.additions).toBe(2);
      expect(stats.files[0]?.deletions).toBe(1);
    });

    it('returns zeroes for empty diff', () => {
      const stats = getDiffStats('');
      expect(stats.filesChanged).toBe(0);
      expect(stats.additions).toBe(0);
      expect(stats.deletions).toBe(0);
      expect(stats.files).toHaveLength(0);
    });
  });

  describe('formatDiffStats', () => {
    it('formats stats without colors', () => {
      const stats = {
        filesChanged: 2,
        additions: 5,
        deletions: 3,
        files: [],
      };
      const text = formatDiffStats(stats, false);
      expect(text).toBe('2 files changed, 5 insertions(+), 3 deletions(-)');
    });

    it('formats singular labels correctly', () => {
      const stats = {
        filesChanged: 1,
        additions: 1,
        deletions: 1,
        files: [],
      };
      const text = formatDiffStats(stats, false);
      expect(text).toBe('1 file changed, 1 insertion(+), 1 deletion(-)');
    });
  });

  describe('generateUnifiedDiff', () => {
    it('returns empty string if content is identical', () => {
      const diff = generateUnifiedDiff('hello\nworld', 'hello\nworld');
      expect(diff).toBe('');
    });

    it('generates unified diff with deletions and additions', () => {
      const oldCode = 'function calc() {\n  return 1;\n}';
      const newCode = 'function calc() {\n  return 2;\n}';

      const diff = generateUnifiedDiff(oldCode, newCode, { filePath: 'src/calc.ts' });

      expect(diff).toContain('--- a/src/calc.ts');
      expect(diff).toContain('+++ b/src/calc.ts');
      expect(diff).toContain('@@ -1,3 +1,3 @@');
      expect(diff).toContain('-  return 1;');
      expect(diff).toContain('+  return 2;');
    });

    it('generates diff when new lines are added', () => {
      const oldCode = 'line 1\nline 2';
      const newCode = 'line 1\nline 1.5\nline 2';

      const diff = generateUnifiedDiff(oldCode, newCode);
      expect(diff).toContain('+line 1.5');
    });

    it('generates diff from empty old content (new file)', () => {
      const oldCode = '';
      const newCode = 'export const test = true;';

      const diff = generateUnifiedDiff(oldCode, newCode, { filePath: 'src/new.ts' });
      expect(diff).toContain('--- a/src/new.ts');
      expect(diff).toContain('+++ b/src/new.ts');
      expect(diff).toContain('+export const test = true;');
    });
  });

  describe('renderDiffPreview', () => {
    it('renders colored terminal preview with line numbers and file banner', () => {
      const preview = renderDiffPreview(sampleDiff, { color: true, showLineNumbers: true });

      expect(preview).toContain('src/server.ts');
      expect(preview).toContain('+2 / -1');
      expect(preview).toContain('app.listen(3000)');
      expect(preview).toContain('app.listen(port)');
      expect(preview).toContain('Summary:');
    });

    it('renders clean uncolored preview when color is false', () => {
      const preview = renderDiffPreview(sampleDiff, { color: false, showLineNumbers: true });

      expect(preview).toContain('📄 src/server.ts');
      expect(preview).toContain('+2 / -1');
      expect(preview).toContain('@@ -10,4 +10,5 @@');
      expect(preview).toContain('- app.listen(3000);');
      expect(preview).toContain('+ const port = process.env.PORT || 8080;');
      expect(preview).toContain('Summary: 1 file changed, 2 insertions(+), 1 deletion(-)');
    });

    it('handles empty diff gracefully', () => {
      const preview = renderDiffPreview('', { color: false });
      expect(preview).toBe('(empty diff)');
    });

    it('supports disabling line numbers', () => {
      const preview = renderDiffPreview(sampleDiff, { color: false, showLineNumbers: false });
      // Gutter separator "│" should not be rendered
      expect(preview).not.toContain('│ 10 │');
      expect(preview).toContain('- app.listen(3000);');
    });

    it('truncates diff preview if maxLines is exceeded', () => {
      const preview = renderDiffPreview(sampleDiff, { color: false, maxLines: 2 });
      expect(preview).toContain('diff truncated');
    });
  });

  describe('renderProposalPreview', () => {
    it('renders proposal header with metadata, rationale, and colored diff', () => {
      const proposal = {
        id: 'prop-101',
        findingId: 'vuln-01',
        title: 'Fix Port Binding',
        rationale: 'Allow environment port override',
        filePath: 'src/server.ts',
        diff: sampleDiff,
      };

      const rendered = renderProposalPreview(proposal, { color: false });

      expect(rendered).toContain('REPAIR PROPOSAL PREVIEW');
      expect(rendered).toContain('Proposal ID:  prop-101');
      expect(rendered).toContain('Finding ID:   vuln-01');
      expect(rendered).toContain('Title:        Fix Port Binding');
      expect(rendered).toContain('Rationale:    Allow environment port override');
      expect(rendered).toContain('src/server.ts');
    });
  });

  describe('DiffPreviewer Class', () => {
    it('class methods work with instance configuration', () => {
      const previewer = new DiffPreviewer({ color: false });
      const stats = previewer.getStats(sampleDiff);
      expect(stats.additions).toBe(2);

      const preview = previewer.render(sampleDiff);
      expect(preview).toContain('src/server.ts');

      const generated = previewer.generateDiff('a', 'b');
      expect(generated).toContain('-a');
      expect(generated).toContain('+b');
    });
  });
});
