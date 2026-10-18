/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/integration/scan-pipeline.test.ts
 * Owner: Shared — Team Lead coordinates
 * Purpose: Integration test: end-to-end repository scan pipeline with real fixtures
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCliProgram } from '../../src/cli/cli.js';
import { RunStore } from '../../src/storage/run-store.js';

describe('Integration: Scan Pipeline with Real Fixtures', () => {
  let vulnerableDir: string;
  let cleanDir: string;

  beforeEach(async () => {
    // 1. Setup vulnerable fixture
    vulnerableDir = await fs.mkdtemp(join(tmpdir(), 'repoguard-vuln-test-'));
    await fs.mkdir(join(vulnerableDir, 'src'), { recursive: true });

    const vulnCode = [
      '// Vulnerable fixture',
      'const awsKey = "AKIAIOSFODNN7EXAMPLE";',
      'const query = "SELECT * FROM users WHERE id = " + req.params.id;',
      'const { exec } = require("child_process");',
      'exec(`rm -rf ${userPath}`);',
      'try { doWork(); } catch (err) {}',
    ].join('\n');
    await fs.writeFile(join(vulnerableDir, 'src', 'vulnerable.js'), vulnCode, 'utf8');

    // 2. Setup clean fixture with benign comments
    cleanDir = await fs.mkdtemp(join(tmpdir(), 'repoguard-clean-test-'));
    await fs.mkdir(join(cleanDir, 'src'), { recursive: true });

    const cleanCode = [
      '// Clean fixture with benign references',
      '// Note: Always use parameterized SELECT queries in database code',
      '// Remember to inject your api_key via environment variables',
      'export function sum(a, b) {',
      '  return a + b;',
      '}',
      'export const safeValue = 42;',
    ].join('\n');
    await fs.writeFile(join(cleanDir, 'src', 'clean.js'), cleanCode, 'utf8');
  });

  afterEach(async () => {
    try {
      await fs.rm(vulnerableDir, { recursive: true, force: true });
      await fs.rm(cleanDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('detects all expected vulnerabilities in vulnerable fixture and redacts secrets in reports and storage', async () => {
    const program = createCliProgram('0.1.3');
    await program.parseAsync(['node', 'repoguard', 'scan', vulnerableDir, '--format', 'json']);

    // Inspect persisted record in RunStore
    const runStore = new RunStore('.repoguard/state', vulnerableDir);
    const latest = await runStore.getLatestRun();

    expect(latest).toBeDefined();
    expect(latest!.filesScanned).toBeGreaterThanOrEqual(1);
    expect(latest!.findingsCount).toBe(4);
    expect(latest!.summary.critical).toBe(2); // AWS key (SEC-001) + Command injection (SEC-003)
    expect(latest!.summary.high).toBe(1); // SQL injection (SEC-002)
    expect(latest!.summary.medium).toBe(1); // Empty catch block (SEC-004)

    // Verify secret redaction in evidence
    const secretFinding = latest!.findings.find((f) => f.id.startsWith('SEC-001'));
    expect(secretFinding).toBeDefined();
    expect(secretFinding!.evidence).toContain('AKIA****************');
    expect(secretFinding!.evidence).not.toContain('AKIAIOSFODNN7EXAMPLE');

    // Verify generated report file on disk
    const reportFiles = await fs.readdir(join(vulnerableDir, '.repoguard', 'reports'));
    const jsonReportFile = reportFiles.find((f) => f.endsWith('.json'));
    expect(jsonReportFile).toBeDefined();

    const reportContent = await fs.readFile(
      join(vulnerableDir, '.repoguard', 'reports', jsonReportFile!),
      'utf8'
    );
    const parsedReport = JSON.parse(reportContent);
    expect(parsedReport.findingsCount).toBe(4);
    expect(parsedReport.findings.some((f: { id: string }) => f.id.startsWith('SEC-001'))).toBe(true);
    expect(parsedReport.findings.some((f: { id: string }) => f.id.startsWith('SEC-002'))).toBe(true);
    expect(parsedReport.findings.some((f: { id: string }) => f.id.startsWith('SEC-003'))).toBe(true);
    expect(parsedReport.findings.some((f: { id: string }) => f.id.startsWith('SEC-004'))).toBe(true);
    expect(reportContent).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('reports zero findings on clean code and benign comments without false positives', async () => {
    const program = createCliProgram('0.1.3');
    await program.parseAsync(['node', 'repoguard', 'scan', cleanDir, '--format', 'json']);

    const runStore = new RunStore('.repoguard/state', cleanDir);
    const latest = await runStore.getLatestRun();

    expect(latest).toBeDefined();
    expect(latest!.filesScanned).toBeGreaterThanOrEqual(1);
    expect(latest!.findingsCount).toBe(0);
    expect(latest!.summary.critical).toBe(0);
    expect(latest!.summary.high).toBe(0);
    expect(latest!.summary.medium).toBe(0);
    expect(latest!.findings.length).toBe(0);
  });

  it('first CLI scan — no previous history: HTML report succeeds without differential timeline', async () => {
    // Fresh directory simulates the very first scan ever run in a project
    const freshDir = await fs.mkdtemp(join(tmpdir(), 'repoguard-first-scan-'));
    await fs.mkdir(join(freshDir, 'src'), { recursive: true });
    await fs.writeFile(
      join(freshDir, 'src', 'index.ts'),
      'export const greeting = "hello world";\n',
      'utf8'
    );

    try {
      const program = createCliProgram('0.1.3');
      await program.parseAsync(['node', 'repoguard', 'scan', freshDir, '--format', 'summary']);

      // HTML report must exist
      const reportFiles = await fs.readdir(join(freshDir, '.repoguard', 'reports'));
      const htmlFile = reportFiles.find((f) => f.endsWith('.html'));
      expect(htmlFile).toBeDefined();

      const html = await fs.readFile(join(freshDir, '.repoguard', 'reports', htmlFile!), 'utf8');

      // Report must load cleanly with standard structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Total Findings');

      // With only one run ever, there is no history table or previous run to compare
      expect(html).not.toContain('Differential Scan Timeline');
      // Either the heading is absent or we have exactly the current run in history
      // (history includes the current run itself, so the table may appear with 1 row — that is correct)
      // What must NOT appear is the differential timeline comparison section
      expect(html).not.toContain('Differential Scan Timeline');

      // RunStore must show exactly 1 entry
      const runStore = new RunStore('.repoguard/state', freshDir);
      const history = await runStore.getHistory(20);
      expect(history.length).toBe(1);
      expect(await runStore.getPreviousRun(history[0]!.runId)).toBeNull();
    } finally {
      await fs.rm(freshDir, { recursive: true, force: true });
    }
  });

  it('subsequent CLI scan — history table and differential timeline are present in HTML report', async () => {
    // Two sequential scans on the same project directory
    const projectDir = await fs.mkdtemp(join(tmpdir(), 'repoguard-two-scan-'));
    await fs.mkdir(join(projectDir, 'src'), { recursive: true });

    // Scan 1: file with a vulnerable pattern (SQL injection + hardcoded secret)
    const scan1Code = [
      '// Initial vulnerable code',
      'const awsKey = "AKIAIOSFODNN7EXAMPLE";',
      'const query = "SELECT * FROM users WHERE id = " + req.params.id;',
    ].join('\n');
    await fs.writeFile(join(projectDir, 'src', 'app.js'), scan1Code, 'utf8');

    try {
      // --- Run Scan 1 ---
      const prog1 = createCliProgram('0.1.3');
      await prog1.parseAsync(['node', 'repoguard', 'scan', projectDir, '--format', 'summary']);

      const runStore = new RunStore('.repoguard/state', projectDir);
      const afterScan1 = await runStore.getHistory(20);
      expect(afterScan1.length).toBe(1);

      // Scan 1 HTML — no previous run, so NO timeline
      const reports1 = await fs.readdir(join(projectDir, '.repoguard', 'reports'));
      const html1File = reports1.find((f) => f.endsWith('.html'));
      expect(html1File).toBeDefined();
      const html1 = await fs.readFile(join(projectDir, '.repoguard', 'reports', html1File!), 'utf8');
      expect(html1).not.toContain('Differential Scan Timeline');

      // Wait 1 ms to guarantee distinct timestamps between runs
      await new Promise((r) => setTimeout(r, 5));

      // --- Scan 2: fix SQL injection; secret persists ---
      const scan2Code = [
        '// Partially remediated code',
        'const awsKey = "AKIAIOSFODNN7EXAMPLE";',
        '// SQL injection fixed: now uses parameterized query',
        'db.query("SELECT * FROM users WHERE id = ?", [req.params.id]);',
      ].join('\n');
      await fs.writeFile(join(projectDir, 'src', 'app.js'), scan2Code, 'utf8');

      const prog2 = createCliProgram('0.1.3');
      await prog2.parseAsync(['node', 'repoguard', 'scan', projectDir, '--format', 'summary']);

      const afterScan2 = await runStore.getHistory(20);
      expect(afterScan2.length).toBe(2);

      // Scan 2 HTML — previous run exists, so history table AND differential timeline must appear
      const reports2 = await fs.readdir(join(projectDir, '.repoguard', 'reports'));
      // Pick the NEWEST html file (largest name sorts last alphabetically for our timestamped IDs)
      const htmlFiles = reports2
        .filter((f) => f.endsWith('.html'))
        .sort();
      const latestHtmlFile = htmlFiles[htmlFiles.length - 1]!;
      const html2 = await fs.readFile(join(projectDir, '.repoguard', 'reports', latestHtmlFile), 'utf8');

      // History table must be present with both run IDs
      expect(html2).toContain('Scan History & Trend');
      expect(html2).toContain(afterScan2[0]!.runId); // current run
      expect(html2).toContain(afterScan2[1]!.runId); // previous run

      // Differential timeline section must exist
      expect(html2).toContain('Differential Scan Timeline');
      // Must show "vs previous run" comparison card
      expect(html2).toContain('vs previous run');
      // At least one of: NEW, RESOLVED, or UNCHANGED items
      const hasDiffContent =
        html2.includes('NEW') || html2.includes('RESOLVED') || html2.includes('UNCHANGED');
      expect(hasDiffContent).toBe(true);
    } finally {
      await fs.rm(projectDir, { recursive: true, force: true });
    }
  });
});

