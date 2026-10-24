import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  formatMarkdownReport,
  formatHtmlReport,
  formatJsonReport,
  ReportBuilder,
  formatEvidenceTimelineHtml,
} from '../../../src/report/index.js';
import { ScanRunRecord, StorageFinding } from '../../../src/storage/index.js';

describe('Intelligence Report & Storage Contract Alignment', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'repoguard-intel-report-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  const enrichedFinding: StorageFinding = {
    id: 'SEC-001-src-auth-token.ts-L14',
    ruleId: 'SEC-001',
    cwe: 'CWE-798',
    category: 'Security / Hardcoded Secrets',
    severity: 'CRITICAL',
    title: 'Hardcoded AWS Access Key ID Detected',
    path: 'src/auth/token.ts',
    lineRange: { start: 14, end: 14 },
    explanation: 'Recognizable AWS Access Key ID committed to source.',
    evidence: 'const key = "AKIAIOSFODNN7EXAMPLE";',
    confidence: 0.98,
    status: 'UNRESOLVED',
    source: 'ai-security-review',
    agentName: 'SecurityReviewAgent',
    blame: {
      commitSha: 'a1b2c3d4e5f67890123456789abcdef012345678',
      author: 'Alice Developer',
      date: '2026-10-14T08:30:00Z',
      line: 14,
      summary: 'Add auth token service',
    },
    recommendation: 'Rotate the exposed key and switch to environment variables.',
    patch: '--- a/src/auth/token.ts\n+++ b/src/auth/token.ts\n@@ -14,1 +14,1 @@\n-const key = "AKIAIOSFODNN7EXAMPLE";\n+const key = process.env.AWS_KEY || "";\n',
    verification: {
      verified: true,
      command: 'npm test',
      exitCode: 0,
      durationMs: 450,
      summary: 'Automated test suite passed cleanly.',
    },
    fingerprint: 'fp-sec001-authtoken-l14',
  };

  const enrichedRecord: ScanRunRecord = {
    runId: 'run-intel-001',
    projectName: 'banking-core',
    timestamp: '2026-10-24T12:00:00.000Z',
    durationMs: 320,
    repositoryRoot: '/workspace/banking-core',
    filesScanned: 24,
    findingsCount: 1,
    summary: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
    findings: [enrichedFinding],
    timeline: [
      {
        timestamp: '12:00:00.010',
        step: 'AST Rule Evaluation',
        status: 'INFO',
        detail: 'Evaluated rules SEC-001 through SEC-004',
        durationMs: 45,
      },
      {
        timestamp: '12:00:00.080',
        step: 'Git Blame Correlation',
        status: 'SUCCESS',
        detail: 'Extracted blame lineage for 1 finding',
        durationMs: 30,
        commitSha: 'a1b2c3d4e5f67890123456789abcdef012345678',
        author: 'Alice Developer',
      },
      {
        timestamp: '12:00:00.150',
        step: 'Sandbox Check Runner',
        status: 'SUCCESS',
        detail: 'Candidate repair passed verification check runner',
        durationMs: 450,
      },
    ],
  };

  it('renders intelligence, CWE, blame, and patch fields in markdown report', () => {
    const md = formatMarkdownReport(enrichedRecord);

    expect(md).toContain('# 🛡️ RepoGuard Audit Report: banking-core');
    expect(md).toContain('- **CWE:** `CWE-798`');
    expect(md).toContain('- **Rule ID:** `SEC-001`');
    expect(md).toContain('- **Detection Source:** `SecurityReviewAgent`');
    expect(md).toContain('- **Git Blame Origin:** `a1b2c3d4` by Alice Developer on 2026-10-14T08:30:00Z');
    expect(md).toContain('- **Verification:** ✅ Verified Passed (`npm test`)');
    expect(md).toContain('> **Recommendation:** Rotate the exposed key and switch to environment variables.');
    expect(md).toContain('**Proposed Remediation Patch:**');
    expect(md).toContain('process.env.AWS_KEY');

    // Secret in patch and evidence must be redacted
    expect(md).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(md).toContain('AKIA****************');

    // Discovery timeline must be included
    expect(md).toContain('### ⏱️ Audit & Discovery Timeline');
    expect(md).toContain('AST Rule Evaluation');
    expect(md).toContain('Git Blame Correlation');
  });

  it('renders intelligence, CWE badge, blame pill, verification badge, and patch diff in HTML report', () => {
    const html = formatHtmlReport(enrichedRecord);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('badge-cwe');
    expect(html).toContain('CWE-798');
    expect(html).toContain('✔ VERIFIED');
    expect(html).toContain('Rule:');
    expect(html).toContain('SEC-001');
    expect(html).toContain('Source:');
    expect(html).toContain('SecurityReviewAgent');
    expect(html).toContain('Blame:');
    expect(html).toContain('a1b2c3d4');
    expect(html).toContain('Alice Developer');

    // Patch box must appear
    expect(html).toContain('patch-box');
    expect(html).toContain('Proposed Remediation Diff');
    expect(html).toContain('process.env.AWS_KEY');

    // Secret must be redacted in both evidence and patch
    expect(html).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(html).toContain('AKIA****************');

    // Timeline section must be rendered
    expect(html).toContain('Audit & Root-Cause Discovery Timeline');
    expect(html).toContain('AST Rule Evaluation');
  });

  it('preserves all intelligence attributes in JSON report with redacted secrets', () => {
    const jsonStr = formatJsonReport(enrichedRecord);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.findings).toHaveLength(1);
    const f = parsed.findings[0];
    expect(f.cwe).toBe('CWE-798');
    expect(f.ruleId).toBe('SEC-001');
    expect(f.source).toBe('ai-security-review');
    expect(f.agentName).toBe('SecurityReviewAgent');
    expect(f.blame.commitSha).toBe('a1b2c3d4e5f67890123456789abcdef012345678');
    expect(f.blame.author).toBe('Alice Developer');
    expect(f.verification.verified).toBe(true);
    expect(f.verification.command).toBe('npm test');

    // Evidence and patch secrets must be redacted
    expect(f.evidence).toContain('AKIA****************');
    expect(f.evidence).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(f.patch).toContain('AKIA****************');
    expect(f.patch).not.toContain('AKIAIOSFODNN7EXAMPLE');

    // Timeline preserved
    expect(parsed.timeline).toHaveLength(3);
    expect(parsed.timeline[1].author).toBe('Alice Developer');
  });

  it('ReportBuilder safely integrates intelligence records and saves them to disk', async () => {
    const builder = new ReportBuilder(enrichedRecord, { outputDir: tempDir });
    const all = builder.generateAll();

    expect(all.markdown).toContain('CWE-798');
    expect(all.html).toContain('CWE-798');
    expect(all.json).toContain('CWE-798');

    const saved = await builder.saveReports(tempDir);
    expect(saved.htmlPath).toBeDefined();
    expect(saved.markdownPath).toBeDefined();
    expect(saved.jsonPath).toBeDefined();

    const writtenHtml = await fs.readFile(saved.htmlPath!, 'utf-8');
    expect(writtenHtml).toContain('Proposed Remediation Diff');
    expect(writtenHtml).toContain('CWE-798');
  });

  it('backward compatibility: legacy records with minimal fields render cleanly without errors', () => {
    const legacyRecord: ScanRunRecord = {
      runId: 'legacy-run-001',
      projectName: 'legacy-app',
      timestamp: '2026-10-18T10:00:00.000Z',
      durationMs: 100,
      repositoryRoot: '/workspace/legacy-app',
      filesScanned: 5,
      findingsCount: 1,
      summary: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
      findings: [
        {
          id: 'LEGACY-01',
          category: 'Security',
          severity: 'HIGH',
          title: 'Unvalidated Redirect',
          path: 'src/routes.js',
          explanation: 'Target URL is not checked against an allowlist.',
        },
      ],
    };

    const md = formatMarkdownReport(legacyRecord);
    expect(md).toContain('Unvalidated Redirect');
    expect(md).not.toContain('undefined');
    expect(md).not.toContain('null');

    const html = formatHtmlReport(legacyRecord);
    expect(html).toContain('Unvalidated Redirect');
    expect(html).not.toContain('<span class="badge badge-cwe">');
    expect(html).not.toContain('undefined');

    const json = JSON.parse(formatJsonReport(legacyRecord));
    expect(json.findings[0].id).toBe('LEGACY-01');
  });

  it('formatEvidenceTimelineHtml formats timeline events into structured HTML', () => {
    const events = [
      {
        timestamp: '10:00:00',
        step: 'Init',
        status: 'SUCCESS' as const,
        detail: 'Started scan',
        durationMs: 15,
      },
      {
        timestamp: '10:00:01',
        step: 'Blame Origin',
        status: 'INFO' as const,
        detail: 'Found blame commit',
        commitSha: 'c0ffee123456',
        author: 'John Doe',
      },
    ];

    const html = formatEvidenceTimelineHtml(events);
    expect(html).toContain('timeline-events-container');
    expect(html).toContain('Init');
    expect(html).toContain('15ms');
    expect(html).toContain('c0ffee12');
    expect(html).toContain('John Doe');
  });
});
