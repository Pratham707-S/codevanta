import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScanAction } from '../dist/cli/commands/scan.command.js';
import { ReportBuilder } from '../dist/report/report-builder.js';
import { RunStore } from '../dist/storage/run-store.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demoRoot = path.join(projectRoot, 'fixtures', 'demo');
const reportsRoot = path.join(projectRoot, 'artifacts', 'demo-reports');
const temporaryReportsRoot = await mkdtemp(path.join(tmpdir(), 'repoguard-demo-'));
const runStore = new RunStore('.repoguard/state', demoRoot);
const previousRunIds = new Set((await runStore.listRuns()).map((run) => run.runId));
const expectedRules = ['SEC-001', 'SEC-002', 'SEC-003', 'SEC-004'];

try {
  await runScanAction(demoRoot, { format: 'summary', outputDir: temporaryReportsRoot });
  assert.equal(process.exitCode, undefined, 'RepoGuard scan failed');

  const newRuns = (await runStore.listRuns()).filter((run) => !previousRunIds.has(run.runId));
  assert.equal(newRuns.length, 1, 'Expected exactly one new scan record');
  const record = await runStore.getRun(newRuns[0].runId);
  assert.ok(record, 'Could not load the new scan record');
  assert.equal(record.findingsCount, 4, 'Expected exactly four findings');

  const findingIds = record.findings.map((finding) => finding.id);
  for (const ruleId of expectedRules) {
    assert.equal(
      findingIds.filter((id) => id.startsWith(ruleId)).length,
      1,
      `Expected exactly one ${ruleId} finding`
    );
  }

  const reports = new ReportBuilder(record).generateAll();
  const jsonReport = JSON.parse(reports.json);
  assert.equal(jsonReport.findingsCount, 4);
  assert.deepEqual(
    expectedRules.map((ruleId) => jsonReport.findings.filter((finding) => finding.id.startsWith(ruleId)).length),
    [1, 1, 1, 1]
  );

  for (const finding of record.findings) {
    const line = finding.lineRange?.start;
    assert.ok(jsonReport.findings.some((reported) =>
      reported.id === finding.id &&
      reported.title === finding.title &&
      reported.severity === finding.severity &&
      reported.path === finding.path &&
      reported.lineRange?.start === line
    ), `JSON report does not match finding ${finding.id}`);
    assert.ok(reports.html.includes(finding.id), `HTML report is missing ${finding.id}`);
    assert.ok(reports.html.includes(finding.title), `HTML report is missing title for ${finding.id}`);
    assert.ok(reports.html.includes(`(Line ${line})`), `HTML report is missing location for ${finding.id}`);
    assert.ok(reports.markdown.includes(finding.id), `Markdown report is missing ${finding.id}`);
    assert.ok(reports.markdown.includes(finding.title), `Markdown report is missing title for ${finding.id}`);
    assert.ok(reports.markdown.includes(`(L${line}-${line})`), `Markdown report is missing location for ${finding.id}`);
  }
  assert.ok(reports.html.includes('Total Findings'));
  assert.ok(reports.markdown.includes('**Total Findings:** 4'));

  for (const content of [reports.html, reports.markdown, reports.json]) {
    assert.ok(content.includes('AKIA****************'), 'Expected the synthetic key to be redacted');
    assert.ok(!content.includes('AKIA0000000000000000'), 'Raw synthetic key leaked into a report');
  }

  await mkdir(reportsRoot, { recursive: true });
  await Promise.all([
    writeFile(path.join(reportsRoot, 'demo-report.html'), reports.html, 'utf8'),
    writeFile(path.join(reportsRoot, 'demo-report.md'), reports.markdown, 'utf8'),
    writeFile(path.join(reportsRoot, 'demo-report.json'), reports.json, 'utf8'),
  ]);

  console.log(`Verified ${record.findingsCount} findings: ${expectedRules.join(', ')}`);
  console.log(`Reports written to ${path.relative(projectRoot, reportsRoot)}`);
} finally {
  await rm(temporaryReportsRoot, { recursive: true, force: true });
}