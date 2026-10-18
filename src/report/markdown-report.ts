/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/report/markdown-report.ts
 * Owner: Ayan
 * Purpose: Report formatter: human-readable Markdown summary generation
 */

import { ScanRunRecord } from '../storage/run-store.js';
import { redactSecretEvidence } from './redaction.js';

export interface MarkdownReportOptions {
  includeEvidence?: boolean;
  maxFindingsPerCategory?: number;
}

export function formatMarkdownReport(
  record: ScanRunRecord,
  options: MarkdownReportOptions = {}
): string {
  const includeEvidence = options.includeEvidence !== false;
  const findings = record.findings || [];

  const lines: string[] = [];

  // Header
  lines.push(`# 🛡️ RepoGuard Audit Report: ${record.projectName}`);
  lines.push('');
  lines.push(`- **Scan Timestamp:** \`${record.timestamp}\``);
  lines.push(`- **Repository Root:** \`${record.repositoryRoot}\``);
  lines.push(`- **Files Scanned:** ${record.filesScanned}`);
  lines.push(`- **Duration:** ${record.durationMs}ms`);
  lines.push(`- **Total Findings:** ${findings.length}`);
  lines.push('');

  // Summary Table with optional chaining fallbacks for safety
  const summary = record.summary || { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  lines.push('## 📊 Executive Summary');
  lines.push('');
  lines.push('| Severity | Count | Status |');
  lines.push('| :--- | :--- | :--- |');
  lines.push(`| **CRITICAL** | ${summary.critical} | ${summary.critical > 0 ? '🚨 Immediate Action Required' : '✅ Clear'} |`);
  lines.push(`| **HIGH** | ${summary.high} | ${summary.high > 0 ? '⚠️ High Priority' : '✅ Clear'} |`);
  lines.push(`| **MEDIUM** | ${summary.medium} | ${summary.medium > 0 ? '⚡ Review Recommended' : '✅ Clear'} |`);
  lines.push(`| **LOW** | ${summary.low} | ${summary.low > 0 ? 'ℹ️ Minor Advisory' : '✅ Clear'} |`);
  lines.push(`| **INFO** | ${summary.info} | ${summary.info > 0 ? '📝 Informational' : '✅ Clear'} |`);
  lines.push('');

  // Findings Section
  lines.push('## 🔍 Findings & Evidence Details');
  lines.push('');

  if (findings.length === 0) {
    lines.push('✅ **No reliability or security findings discovered.** Repository passed all configured checks cleanly.');
    lines.push('');
    return lines.join('\n');
  }

  // Sort by severity priority: CRITICAL -> HIGH -> MEDIUM -> LOW -> INFO
  const severityRank: Record<string, number> = {
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    INFO: 1,
  };

  const sortedFindings = [...findings].sort(
    (a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0)
  );

  sortedFindings.forEach((finding, index) => {
    // FIXED: Added space between badge and title
    lines.push(`### ${index + 1}. [${finding.severity}] ${finding.title}`);
    lines.push('');
    lines.push(`- **ID:** \`${finding.id}\``);
    lines.push(`- **Category:** \`${finding.category}\``);
    lines.push(`- **Location:** \`${finding.path}\`${finding.lineRange ? ` (L${finding.lineRange.start}-${finding.lineRange.end})` : ''}`);
    
    if (finding.confidence !== undefined) {
      // FIXED: Added multiplication operator and handled decimal vs percentage values safely
      const confidenceVal = finding.confidence <= 1 ? finding.confidence * 100 : finding.confidence;
      lines.push(`- **Confidence Score:** \`${confidenceVal.toFixed(0)}%\``);
    }
    
    lines.push('');
    lines.push(`> **Analysis:** ${finding.explanation}`);
    lines.push('');

    if (includeEvidence && finding.evidence) {
      lines.push('**Evidence:**');
      lines.push('```');
      lines.push(redactSecretEvidence(finding.evidence));
      lines.push('```');
      lines.push('');
    }
  });

  lines.push('---');
  lines.push('*Report generated autonomously by RepoGuard Software Reliability & Security Platform.*');

  return lines.join('\n');
}