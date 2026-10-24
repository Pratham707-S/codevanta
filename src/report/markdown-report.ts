/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/report/markdown-report.ts
 * Owner: Ayan
 * Purpose: Report formatter: human-readable Markdown summary generation
 */

import { ScanRunRecord } from '../storage/run-store.js';
import { redactSecretEvidence } from './redaction.js';
import { formatEvidenceTimelineMarkdown, TimelineEvent } from './evidence-timeline.js';

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
    if (record.timeline && record.timeline.length > 0) {
      lines.push(formatEvidenceTimelineMarkdown(record.timeline as TimelineEvent[]));
      lines.push('');
    }
    lines.push('---');
    lines.push('*Report generated autonomously by RepoGuard Software Reliability & Security Platform.*');
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
    lines.push(`### ${index + 1}. [${finding.severity}] ${finding.title}`);
    lines.push('');
    lines.push(`- **ID:** \`${finding.id}\``);
    if (finding.ruleId) {
      lines.push(`- **Rule ID:** \`${finding.ruleId}\``);
    }
    if (finding.cwe) {
      lines.push(`- **CWE:** \`${finding.cwe}\``);
    }
    lines.push(`- **Category:** \`${finding.category}\``);
    if (finding.agentName || finding.source) {
      lines.push(`- **Detection Source:** \`${finding.agentName || finding.source}\``);
    }
    lines.push(`- **Location:** \`${finding.path}\`${finding.lineRange ? ` (L${finding.lineRange.start}-${finding.lineRange.end})` : ''}`);
    
    if (finding.confidence !== undefined) {
      const confidenceVal = finding.confidence <= 1 ? finding.confidence * 100 : finding.confidence;
      lines.push(`- **Confidence Score:** \`${confidenceVal.toFixed(0)}%\``);
    }

    if (finding.blame) {
      const shaStr = finding.blame.commitSha ? `\`${finding.blame.commitSha.slice(0, 8)}\`` : '`unknown`';
      const authorStr = finding.blame.author ? ` by ${finding.blame.author}` : '';
      const dateStr = finding.blame.date ? ` on ${finding.blame.date}` : '';
      lines.push(`- **Git Blame Origin:** ${shaStr}${authorStr}${dateStr}`);
    } else if (finding.commitSha) {
      lines.push(`- **Git Commit:** \`${finding.commitSha.slice(0, 8)}\``);
    }

    if (finding.verification) {
      const statusIcon = finding.verification.verified ? '✅ Verified Passed' : '❌ Verification Failed';
      const cmdStr = finding.verification.command ? ` (\`${finding.verification.command}\`)` : '';
      lines.push(`- **Verification:** ${statusIcon}${cmdStr}`);
    }
    
    lines.push('');
    lines.push(`> **Analysis:** ${finding.explanation}`);
    if (finding.recommendation) {
      lines.push(`> **Recommendation:** ${finding.recommendation}`);
    }
    lines.push('');

    if (includeEvidence && finding.evidence) {
      lines.push('**Evidence:**');
      lines.push('```');
      lines.push(redactSecretEvidence(finding.evidence));
      lines.push('```');
      lines.push('');
    }

    if (finding.patch) {
      lines.push('**Proposed Remediation Patch:**');
      lines.push('```diff');
      lines.push(redactSecretEvidence(finding.patch));
      lines.push('```');
      lines.push('');
    } else if (finding.suggestedFix) {
      lines.push('**Suggested Fix:**');
      lines.push('```');
      lines.push(redactSecretEvidence(finding.suggestedFix));
      lines.push('```');
      lines.push('');
    }
  });

  if (record.timeline && record.timeline.length > 0) {
    lines.push(formatEvidenceTimelineMarkdown(record.timeline as TimelineEvent[]));
    lines.push('');
  }

  lines.push('---');
  lines.push('*Report generated autonomously by RepoGuard Software Reliability & Security Platform.*');

  return lines.join('\n');
}
