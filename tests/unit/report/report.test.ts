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
} from '../../../src/report/index.js';
import { ScanRunRecord } from '../../../src/storage/index.js';

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

    it('renders clean empty state for 0 findings', () => {
      const html = formatHtmlReport(cleanRecord);

      expect(html).toContain('No Security or Reliability Findings Detected');
      expect(html).not.toContain('badge-critical-card');
      expect(html).not.toContain('<div class="finding-card');
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
