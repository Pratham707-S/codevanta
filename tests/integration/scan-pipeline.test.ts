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
});
