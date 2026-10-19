/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/report/report.test.ts
 * Owner: Ayan
 * Purpose: Unit tests for Markdown, JSON, HTML report generation and XSS sanitization
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  formatMarkdownReport,
  formatJsonReport,
  formatHtmlReport,
  escapeHtml,
  formatEvidenceTimelineMarkdown,
  ReportBuilder,
  compareScans,
} from '../../../src/report/index.js';
import { ScanRunRecord, RunSummaryItem } from '../../../src/storage/index.js';

describe('Reporting Engine — Markdown, JSON, HTML & Builder', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'repoguard-report-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  const sampleRecord: ScanRunRecord = {
    runId: 'rg-test-001',
    projectName: 'banking-api',
    timestamp: '2026-10-12T10:00:00.000Z',
    durationMs: 350,
    repositoryRoot: '/workspace/banking-api',
    filesScanned: 42,
    findingsCount: 2,
    summary: {
      critical: 1,
      high: 1,
      medium: 0,
      low: 0,
      info: 0,
    },
    findings: [
      {
        id: 'SEC-01',
        title: 'SQL Injection Vulnerability',
        severity: 'CRITICAL',
        category: 'SECURITY',
        path: 'src/db/users.ts',
        lineRange: { start: 45, end: 48 },
        explanation: 'User input concatenated directly into raw query string.',
        evidence: 'db.query(`SELECT * FROM users WHERE id = ${req.params.id}`);',
        confidence: 0.98,
      },
      {
        id: 'REL-02',
        title: 'Unhandled Promise Rejection',
        severity: 'HIGH',
        category: 'RELIABILITY',
        path: 'src/routes/pay.ts',
        lineRange: { start: 12, end: 14 },
        explanation: 'Async operation missing catch block.',
        confidence: 0.85,
      },
    ],
  };

  const cleanRecord: ScanRunRecord = {
    runId: 'rg-clean-002',
    projectName: 'clean-service',
    timestamp: '2026-10-12T10:05:00.000Z',
    durationMs: 120,
    repositoryRoot: '/workspace/clean-service',
    filesScanned: 25,
    findingsCount: 0,
    summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    findings: [],
  };

  describe('Markdown Reporting', () => {
    it('generates markdown with executive summary and finding details', () => {
      const md = formatMarkdownReport(sampleRecord);

      expect(md).toContain('# 🛡️ RepoGuard Audit Report: banking-api');
      expect(md).toContain('| **CRITICAL** | 1 | 🚨 Immediate Action Required |');
      expect(md).toContain('### 1. [CRITICAL] SQL Injection Vulnerability');
      expect(md).toContain('- **Confidence Score:** `98%`');
      expect(md).toContain('SELECT * FROM users WHERE id');
    });

    it('handles empty findings gracefully with a passing statement', () => {
      const md = formatMarkdownReport(cleanRecord);

      expect(md).toContain('✅ **No reliability or security findings discovered.**');
      expect(md).not.toContain('### 1.');
    });

    it('respects includeEvidence: false option', () => {
      const md = formatMarkdownReport(sampleRecord, { includeEvidence: false });

      expect(md).toContain('SQL Injection Vulnerability');
      expect(md).not.toContain('SELECT * FROM users WHERE id');
    });
  });

  describe('JSON Reporting', () => {
    it('serializes record to valid JSON with schema metadata', () => {
      const jsonStr = formatJsonReport(sampleRecord);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.schemaVersion).toBe('1.0.0');
      expect(parsed.runId).toBe('rg-test-001');
      expect(parsed.findings.length).toBe(2);
      expect(parsed.findings[0].evidence).toBeDefined();
    });

    it('strips evidence when includeEvidence is false', () => {
      const jsonStr = formatJsonReport(sampleRecord, { includeEvidence: false });
      const parsed = JSON.parse(jsonStr);

      expect(parsed.findings[0].evidence).toBeUndefined();
    });

    it('supports compact formatting when pretty is false', () => {
      const jsonStr = formatJsonReport(sampleRecord, { pretty: false });
      expect(jsonStr).not.toContain('\n');
    });
  });

  describe('HTML Reporting & XSS Protection', () => {
    it('escapes dangerous HTML characters in escapeHtml()', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
      expect(escapeHtml("Tom & Jerry's")).toBe('Tom &amp; Jerry&#39;s');
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
      expect(escapeHtml(123)).toBe('123');
    });

    it('safely escapes untrusted finding details in generated HTML', () => {
      const xssRecord: ScanRunRecord = {
        runId: 'rg-xss',
        projectName: '<script>alert(1)</script>',
        timestamp: '2026-10-12',
        durationMs: 50,
        repositoryRoot: '/test',
        filesScanned: 1,
        findingsCount: 1,
        summary: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
        findings: [
          {
            id: 'XSS-01',
            title: '<img src=x onerror=alert(2)>',
            severity: 'CRITICAL',
            category: 'INJECTION',
            path: 'test<foo>.ts',
            explanation: 'Exploit <script>alert(3)</script>',
            evidence: '<div onclick="hack()">click</div>',
          },
        ],
      };

      const html = formatHtmlReport(xssRecord);

      // Verify unescaped malicious tags are NOT present
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).not.toContain('<img src=x onerror=alert(2)>');
      expect(html).not.toContain('<script>alert(3)</script>');
      expect(html).not.toContain('<div onclick="hack()">');

      // Verify sanitized entities ARE present
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
      expect(html).toContain('&lt;div onclick=&quot;hack()&quot;&gt;');
    });

    it('safely maps severity CSS class without attribute injection for malformed or unknown severities', () => {
      const malformedRecord: ScanRunRecord = {
        runId: 'rg-malformed-sev',
        projectName: 'safe-proj',
        timestamp: '2026-10-12',
        durationMs: 50,
        repositoryRoot: '/test',
        filesScanned: 1,
        findingsCount: 1,
        summary: { critical: 0, high: 0, medium: 0, low: 0, info: 1 },
        findings: [
          {
            id: 'SEV-01',
            title: 'Test issue',
            // Malformed severity attempting attribute breakout
            severity: 'CRITICAL" onfocus="alert(1)' as unknown as 'CRITICAL',
            category: 'SECURITY',
            path: 'test.ts',
            explanation: 'Severity injection test',
            evidence: 'test()',
          },
        ],
      };

      const html = formatHtmlReport(malformedRecord);

      expect(html).toContain('finding-card border-info');
      expect(html).not.toContain('onfocus="alert(1)"');
      expect(html).not.toContain('border-critical"');
    });

    it('renders clean empty state for 0 findings', () => {
      const html = formatHtmlReport(cleanRecord);

      expect(html).toContain('No Security or Reliability Findings Detected');
      expect(html).not.toContain('badge-critical-card');
      expect(html).not.toContain('<div class="finding-card');
    });

    it('renders full security dashboard with total findings, severity cards, file paths, line numbers, and remediation recommendations', () => {
      const html = formatHtmlReport(sampleRecord);

      expect(html).toContain('Total Findings');
      expect(html).toContain('banking-api');
      expect(html).toContain('SQL Injection Vulnerability');
      expect(html).toContain('src/db/users.ts');
      expect(html).toContain('(Lines 45–48)');
      expect(html).toContain('Remediation Recommendation');
      expect(html).toContain('parameterized queries');
      expect(html).toContain('Unhandled Promise Rejection');
      expect(html).toContain('src/routes/pay.ts');
      expect(html).toContain('(Lines 12–14)');
    });

    it('renders custom remediation recommendation when explicitly set on finding', () => {
      const customRecord: ScanRunRecord = {
        ...sampleRecord,
        findings: [
          {
            ...sampleRecord.findings[0]!,
            recommendation: 'Rotate the database credentials and enforce strict prepared statements.',
          },
        ],
      };

      const html = formatHtmlReport(customRecord);
      expect(html).toContain('Rotate the database credentials and enforce strict prepared statements.');
    });

    it('renders scan history table with timestamps, finding counts, and severity breakdowns', () => {
      const historyItems: RunSummaryItem[] = [
        {
          runId: 'run-history-002',
          timestamp: '2026-10-12T11:00:00.000Z',
          findingsCount: 3,
          filesScanned: 45,
          durationMs: 250,
          summary: { critical: 1, high: 2, medium: 0, low: 0, info: 0 },
        },
        {
          runId: 'run-history-001',
          timestamp: '2026-10-12T10:00:00.000Z',
          findingsCount: 5,
          filesScanned: 40,
          durationMs: 300,
          summary: { critical: 2, high: 2, medium: 1, low: 0, info: 0 },
        },
      ];

      const html = formatHtmlReport(sampleRecord, { history: historyItems });

      expect(html).toContain('Scan History & Trend');
      expect(html).toContain('run-history-002');
      expect(html).toContain('run-history-001');
      expect(html).toContain('1 C');
      expect(html).toContain('2 H');
    });

    it('compares two fixture scans and renders differential timeline in HTML report', () => {
      const fixtureScan1: ScanRunRecord = {
        runId: 'scan-fixture-01',
        projectName: 'fixture-app',
        timestamp: '2026-10-12T09:00:00.000Z',
        durationMs: 150,
        repositoryRoot: '/test',
        filesScanned: 10,
        findingsCount: 2,
        summary: { critical: 1, high: 1, medium: 0, low: 0, info: 0 },
        findings: [
          {
            id: 'SEC-001',
            title: 'Hardcoded Secret',
            severity: 'CRITICAL',
            category: 'SECURITY',
            path: 'src/config.ts',
            lineRange: { start: 5, end: 5 },
            explanation: 'Hardcoded API key detected',
          },
          {
            id: 'SEC-002',
            title: 'SQL Injection',
            severity: 'HIGH',
            category: 'SECURITY',
            path: 'src/db.ts',
            lineRange: { start: 20, end: 22 },
            explanation: 'SQL string concatenation',
          },
        ],
      };

      const fixtureScan2: ScanRunRecord = {
        runId: 'scan-fixture-02',
        projectName: 'fixture-app',
        timestamp: '2026-10-12T10:00:00.000Z',
        durationMs: 160,
        repositoryRoot: '/test',
        filesScanned: 10,
        findingsCount: 2,
        summary: { critical: 1, high: 0, medium: 1, low: 0, info: 0 },
        findings: [
          // SEC-001 is unchanged
          {
            id: 'SEC-001',
            title: 'Hardcoded Secret',
            severity: 'CRITICAL',
            category: 'SECURITY',
            path: 'src/config.ts',
            lineRange: { start: 5, end: 5 },
            explanation: 'Hardcoded API key detected',
          },
          // SEC-003 is new (SEC-002 was resolved!)
          {
            id: 'SEC-003',
            title: 'Command Injection',
            severity: 'MEDIUM',
            category: 'SECURITY',
            path: 'src/exec.ts',
            lineRange: { start: 30, end: 32 },
            explanation: 'Unsanitized exec call',
          },
        ],
      };

      const diff = compareScans(fixtureScan2, fixtureScan1);

      expect(diff.newFindings.length).toBe(1);
      expect(diff.newFindings[0]?.id).toBe('SEC-003');
      expect(diff.resolvedFindings.length).toBe(1);
      expect(diff.resolvedFindings[0]?.id).toBe('SEC-002');
      expect(diff.unchangedFindings.length).toBe(1);
      expect(diff.unchangedFindings[0]?.id).toBe('SEC-001');

      const html = formatHtmlReport(fixtureScan2, { previousRecord: fixtureScan1 });

      expect(html).toContain('Differential Scan Timeline');
      expect(html).toContain('Command Injection');
      expect(html).toContain('SQL Injection');
      expect(html).toContain('RESOLVED');
      expect(html).toContain('NEW');
      expect(html).toContain('UNCHANGED');
    });

    it('defensively redacts secrets from evidence in HTML, Markdown, and JSON reports', () => {
      const secretRecord: ScanRunRecord = {
        runId: 'rg-secret-test',
        projectName: 'secret-service',
        timestamp: '2026-10-12T12:00:00.000Z',
        durationMs: 80,
        repositoryRoot: '/test',
        filesScanned: 2,
        findingsCount: 1,
        summary: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
        findings: [
          {
            id: 'SEC-001',
            title: 'Exposed Credentials in Source',
            severity: 'CRITICAL',
            category: 'SECURITY',
            path: 'src/credentials.ts',
            lineRange: { start: 10, end: 12 },
            explanation: 'Hardcoded credentials in configuration',
            evidence: 'const awsKey = "AKIA1234567890EXAMPLE";\nconst pat = "ghp_123456789012345678901234567890123456";\nconst password = "mySuperSecretPassword123";',
          },
        ],
      };

      const html = formatHtmlReport(secretRecord);
      expect(html).not.toContain('AKIA1234567890EXAMPLE');
      expect(html).not.toContain('ghp_123456789012345678901234567890123456');
      expect(html).not.toContain('mySuperSecretPassword123');
      expect(html).toContain('AKIA****************');
      expect(html).toContain('ghp_********************************');
      expect(html).toContain('[REDACTED_SECRET]');

      const md = formatMarkdownReport(secretRecord);
      expect(md).not.toContain('AKIA1234567890EXAMPLE');
      expect(md).not.toContain('ghp_123456789012345678901234567890123456');
      expect(md).not.toContain('mySuperSecretPassword123');
      expect(md).toContain('AKIA****************');
      expect(md).toContain('[REDACTED_SECRET]');

      const jsonStr = formatJsonReport(secretRecord);
      expect(jsonStr).not.toContain('AKIA1234567890EXAMPLE');
      expect(jsonStr).not.toContain('ghp_123456789012345678901234567890123456');
      expect(jsonStr).not.toContain('mySuperSecretPassword123');
      expect(jsonStr).toContain('AKIA****************');
      expect(jsonStr).toContain('[REDACTED_SECRET]');
    });
  });

  describe('Evidence Timeline & ReportBuilder', () => {
    it('formats evidence timeline in markdown table', () => {
      const timeline = formatEvidenceTimelineMarkdown([
        {
          timestamp: '10:00:01',
          step: 'File Scanner',
          status: 'SUCCESS',
          detail: '42 files ingested',
          durationMs: 80,
        },
        {
          timestamp: '10:00:02',
          step: 'AI Analysis',
          status: 'WARNING',
          detail: '1 critical finding identified',
          durationMs: 270,
        },
      ]);

      expect(timeline).toContain('### ⏱️ Audit & Discovery Timeline');
      expect(timeline).toContain('**File Scanner**');
      expect(timeline).toContain('✅ SUCCESS');
      expect(timeline).toContain('⚠️ WARNING');
    });

    it('ReportBuilder assembles and saves reports to disk safely', async () => {
      const builder = new ReportBuilder(sampleRecord, { outputDir: tempDir });
      builder.addTimelineEvent({
        timestamp: '10:00:00',
        step: 'Init',
        status: 'SUCCESS',
        detail: 'Started scan',
      });

      const all = builder.generateAll();
      expect(all.markdown).toContain('Audit & Discovery Timeline');
      expect(all.json).toContain('banking-api');
      expect(all.html).toContain('<!DOCTYPE html>');

      const saved = await builder.saveReports(tempDir);
      expect(saved.markdownPath).toBeDefined();
      expect(saved.jsonPath).toBeDefined();
      expect(saved.htmlPath).toBeDefined();

      const writtenMd = await fs.readFile(saved.markdownPath!, 'utf-8');
      expect(writtenMd).toBe(all.markdown);
    });
  });
});
