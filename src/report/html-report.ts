/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/report/html-report.ts
 * Owner: Ayan
 * Purpose: Report formatter: self-contained, secure HTML audit report output with warm AI beige & white aesthetic
 */

import { ScanRunRecord, StorageFinding, RunSummaryItem } from '../storage/run-store.js';
import { ScanComparison, compareScans } from './scan-comparison.js';
import { redactSecretEvidence, sanitizeFindingsForReport } from './redaction.js';
import { formatEvidenceTimelineHtml, TimelineEvent } from './evidence-timeline.js';

export interface HtmlReportOptions {
  title?: string;
  includeEvidence?: boolean;
  history?: RunSummaryItem[];
  previousRecord?: ScanRunRecord;
  comparison?: ScanComparison;
}

/**
 * Strictly escapes untrusted string content for safe embedding in HTML text and attributes.
 * Prevents Cross-Site Scripting (XSS) attacks from user-controlled code, filenames, or explanations.
 */
export function escapeHtml(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) {
    return '';
  }
  const str = String(unsafe);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Provides an actionable remediation recommendation for a finding.
 * Uses finding.recommendation if provided; otherwise synthesizes advice from category and rule ID.
 */
export function getRemediationRecommendation(finding: StorageFinding): string {
  if (finding.recommendation && finding.recommendation.trim().length > 0) {
    return finding.recommendation.trim();
  }
  const id = (finding.id || '').toUpperCase();
  const category = (finding.category || '').toUpperCase();
  const title = (finding.title || '').toLowerCase();

  if (
    id.startsWith('SEC-001') ||
    category.includes('SECRET') ||
    title.includes('secret') ||
    title.includes('credential') ||
    title.includes('key') ||
    title.includes('token')
  ) {
    return 'Immediately revoke and rotate the exposed credential. Move sensitive values to secure environment variables (.env) or a secret manager (e.g., AWS Secrets Manager, HashiCorp Vault), and ensure configuration files containing secrets are added to .gitignore.';
  }
  if (id.startsWith('SEC-002') || category.includes('INJECTION') || title.includes('sql')) {
    return 'Refactor query construction to use parameterized queries, prepared statements, or an Object-Relational Mapper (ORM) instead of raw string concatenation or template interpolation.';
  }
  if (id.startsWith('SEC-003') || title.includes('command') || title.includes('exec')) {
    return 'Avoid passing unsanitized user inputs to shell execution functions. Prefer execFile or spawn with fixed arguments and an explicit allowlist of authorized commands.';
  }
  if (id.startsWith('SEC-004') || title.includes('catch') || title.includes('error')) {
    return 'Avoid swallowing exceptions silently in empty catch blocks. Log the caught error with contextual details, handle graceful degradation, or rethrow the error for centralized error handling.';
  }
  if (title.includes('path') || title.includes('traversal')) {
    return 'Validate and sanitize file paths using path normalization and enforce that resolved paths remain strictly within the designated root directory.';
  }
  return 'Review the affected code block against security best practices, apply defensive input validation, and verify behavior with automated unit and regression tests.';
}

/**
 * Formats a scan run record into a standalone, styled HTML report with warm AI beige & white styling.
 */
export function formatHtmlReport(
  record: ScanRunRecord,
  options: HtmlReportOptions = {}
): string {
  const pageTitle = escapeHtml(options.title || `RepoGuard Audit Report — ${record.projectName}`);
  const includeEvidence = options.includeEvidence !== false;

  // Sanitize findings evidence to ensure zero secret leakage in HTML output
  const rawFindings = record.findings || [];
  const findings = sanitizeFindingsForReport(rawFindings);
  const summary = record.summary || { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const totalFindings = record.findingsCount ?? findings.length;

  const severityBadgeClass: Record<string, string> = {
    CRITICAL: 'badge-critical',
    HIGH: 'badge-high',
    MEDIUM: 'badge-medium',
    LOW: 'badge-low',
    INFO: 'badge-info',
  };

  const severityBorderClass: Record<string, string> = {
    CRITICAL: 'border-critical',
    HIGH: 'border-high',
    MEDIUM: 'border-medium',
    LOW: 'border-low',
    INFO: 'border-info',
  };

  // 1. Findings Cards
  const findingsHtml = findings.length === 0
    ? `
      <div class="empty-state">
        <div class="empty-icon">🛡️</div>
        <h3>No Security or Reliability Findings Detected</h3>
        <p>Repository passed all configured static and dynamic validation checks cleanly.</p>
      </div>
    `
    : findings.map((f, i) => {
        const badgeClass = severityBadgeClass[f.severity] || 'badge-info';
        const borderClass = severityBorderClass[f.severity] || 'border-info';
        
        let lineInfo = '';
        if (f.lineRange) {
          if (f.lineRange.start === f.lineRange.end) {
            lineInfo = ` (Line ${escapeHtml(f.lineRange.start)})`;
          } else {
            lineInfo = ` (Lines ${escapeHtml(f.lineRange.start)}–${escapeHtml(f.lineRange.end)})`;
          }
        }
        
        const confidenceVal = typeof f.confidence === 'number' 
          ? (f.confidence <= 1 ? f.confidence * 100 : f.confidence) 
          : undefined;
        const confidenceInfo = confidenceVal !== undefined 
          ? `<span class="confidence-tag">Confidence: ${confidenceVal.toFixed(0)}%</span>` 
          : '';

        const cweBadge = f.cwe ? `<span class="badge badge-cwe">${escapeHtml(f.cwe)}</span>` : '';
        const verificationBadge = f.verification
          ? `<span class="badge ${f.verification.verified ? 'badge-clean' : 'badge-critical'}">${f.verification.verified ? '✔ VERIFIED' : '✖ UNVERIFIED'}</span>`
          : '';

        const ruleInfo = f.ruleId ? `<span><strong>Rule:</strong> <code>${escapeHtml(f.ruleId)}</code></span>` : '';
        const sourceInfo = (f.agentName || f.source) ? `<span><strong>Source:</strong> ${escapeHtml(f.agentName || f.source)}</span>` : '';

        let blameInfo = '';
        if (f.blame) {
          const sha = f.blame.commitSha ? `<code>${escapeHtml(f.blame.commitSha.slice(0, 8))}</code>` : '';
          const author = f.blame.author ? ` by ${escapeHtml(f.blame.author)}` : '';
          const date = f.blame.date ? ` (${escapeHtml(f.blame.date)})` : '';
          blameInfo = `<span><strong>Blame:</strong> ${sha}${author}${date}</span>`;
        } else if (f.commitSha) {
          blameInfo = `<span><strong>Commit:</strong> <code>${escapeHtml(f.commitSha.slice(0, 8))}</code></span>`;
        }

        const evidenceBlock = (includeEvidence && f.evidence)
          ? `<pre class="evidence"><code>${escapeHtml(redactSecretEvidence(f.evidence))}</code></pre>`
          : '';

        const recommendationText = getRemediationRecommendation(f);
        const recommendationHtml = `
          <div class="remediation-box">
            <div class="remediation-header">
              <span class="remediation-icon">💡</span>
              <strong>Remediation Recommendation</strong>
            </div>
            <p>${escapeHtml(recommendationText)}</p>
          </div>
        `;

        let patchBlock = '';
        if (f.patch) {
          patchBlock = `
            <div class="patch-box">
              <div class="patch-header">
                <span class="patch-icon">🛠️</span>
                <strong>Proposed Remediation Diff</strong>
              </div>
              <pre class="evidence patch-code"><code>${escapeHtml(redactSecretEvidence(f.patch))}</code></pre>
            </div>
          `;
        } else if (f.suggestedFix) {
          patchBlock = `
            <div class="patch-box">
              <div class="patch-header">
                <span class="patch-icon">💡</span>
                <strong>Suggested Fix</strong>
              </div>
              <pre class="evidence patch-code"><code>${escapeHtml(redactSecretEvidence(f.suggestedFix))}</code></pre>
            </div>
          `;
        }

        return `
          <div class="finding-card ${borderClass}">
            <div class="finding-header">
              <span class="finding-number">#${i + 1}</span>
              <span class="badge ${badgeClass}">${escapeHtml(f.severity)}</span>
              ${cweBadge}
              ${verificationBadge}
              <span class="finding-title">${escapeHtml(f.title)}</span>
              ${confidenceInfo}
            </div>
            <div class="finding-meta">
              <span><strong>Category:</strong> ${escapeHtml(f.category)}</span>
              <span><strong>Location:</strong> <code>${escapeHtml(f.path)}</code>${lineInfo}</span>
              <span><strong>ID:</strong> <code>${escapeHtml(f.id)}</code></span>
              ${ruleInfo}
              ${sourceInfo}
              ${blameInfo}
            </div>
            <div class="finding-explanation">
              <p>${escapeHtml(f.explanation)}</p>
            </div>
            ${evidenceBlock}
            ${recommendationHtml}
            ${patchBlock}
          </div>
        `;
      }).join('\n');

  // 2. Scan Comparison / Differential Timeline
  let comparison = options.comparison;
  if (!comparison && options.previousRecord) {
    comparison = compareScans(record, options.previousRecord);
  }

  let comparisonHtml = '';
  if (comparison) {
    const newCount = comparison.newFindings.length;
    const resolvedCount = comparison.resolvedFindings.length;
    const unchangedCount = comparison.unchangedFindings.length;
    const totalDelta = comparison.delta.total;

    let deltaLabel = 'No change in total findings';
    let deltaClass = 'badge-info';
    if (totalDelta > 0) {
      deltaLabel = `+${totalDelta} findings`;
      deltaClass = 'badge-critical';
    } else if (totalDelta < 0) {
      deltaLabel = `${totalDelta} findings`;
      deltaClass = 'badge-clean';
    }

    const newItems = comparison.newFindings.map((f) => {
      const lineStr = f.lineRange ? `:${f.lineRange.start}` : '';
      return `
        <div class="timeline-item timeline-new">
          <span class="timeline-badge badge-critical">NEW</span>
          <span class="timeline-title"><strong>${escapeHtml(f.title)}</strong> in <code>${escapeHtml(f.path)}${lineStr}</code></span>
        </div>
      `;
    }).join('\n');

    const resolvedItems = comparison.resolvedFindings.map((f) => {
      const lineStr = f.lineRange ? `:${f.lineRange.start}` : '';
      return `
        <div class="timeline-item timeline-resolved">
          <span class="timeline-badge badge-resolved">RESOLVED</span>
          <span class="timeline-title"><strong>${escapeHtml(f.title)}</strong> in <code>${escapeHtml(f.path)}${lineStr}</code></span>
        </div>
      `;
    }).join('\n');

    const unchangedSummary = unchangedCount > 0
      ? `<div class="timeline-item timeline-unchanged">
           <span class="timeline-badge badge-info">UNCHANGED</span>
           <span class="timeline-title">${unchangedCount} finding(s) persisted from previous scan</span>
         </div>`
      : '';

    comparisonHtml = `
      <section class="dashboard-section">
        <div class="section-header-row">
          <h2 class="section-title">⏱️ Differential Scan Timeline</h2>
          <span class="badge ${deltaClass}">${deltaLabel} vs previous run</span>
        </div>
        <div class="comparison-card">
          <div class="comparison-meta">
            <span><strong>Current:</strong> <code>${escapeHtml(comparison.currentRunId)}</code> (${escapeHtml(comparison.currentTimestamp)})</span>
            <span><strong>Previous:</strong> <code>${escapeHtml(comparison.previousRunId)}</code> (${escapeHtml(comparison.previousTimestamp)})</span>
          </div>
          <div class="comparison-metrics">
            <span class="metric-pill metric-new"><strong>${newCount}</strong> New</span>
            <span class="metric-pill metric-resolved"><strong>${resolvedCount}</strong> Resolved</span>
            <span class="metric-pill metric-unchanged"><strong>${unchangedCount}</strong> Unchanged</span>
          </div>
          <div class="timeline-list">
            ${newItems}
            ${resolvedItems}
            ${unchangedSummary}
            ${newCount === 0 && resolvedCount === 0 && unchangedCount === 0 ? '<p class="text-muted">No findings in either scan.</p>' : ''}
          </div>
        </div>
      </section>
    `;
  }

  // 3. Scan History Table
  const history = options.history || [];
  let historyHtml = '';
  if (history.length > 0) {
    const rows = history.map((item) => {
      const isCurrent = item.runId === record.runId;
      const rowClass = isCurrent ? 'class="current-run-row"' : '';
      const curBadge = isCurrent ? ' <span class="badge badge-info">Current</span>' : '';
      const s = item.summary || { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

      return `
        <tr ${rowClass}>
          <td><code>${escapeHtml(item.runId)}</code>${curBadge}</td>
          <td>${escapeHtml(item.timestamp)}</td>
          <td>${item.filesScanned ?? '-'}</td>
          <td><strong>${item.findingsCount}</strong></td>
          <td>
            <div class="mini-badges">
              ${s.critical > 0 ? `<span class="badge badge-critical">${s.critical} C</span>` : ''}
              ${s.high > 0 ? `<span class="badge badge-high">${s.high} H</span>` : ''}
              ${s.medium > 0 ? `<span class="badge badge-medium">${s.medium} M</span>` : ''}
              ${s.low > 0 ? `<span class="badge badge-low">${s.low} L</span>` : ''}
              ${s.critical === 0 && s.high === 0 && s.medium === 0 && s.low === 0 ? '<span class="badge badge-clean">0 issues</span>' : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('\n');

    historyHtml = `
      <section class="dashboard-section">
        <h2 class="section-title">📊 Scan History & Trend</h2>
        <div class="table-container">
          <table class="history-table">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Timestamp</th>
                <th>Files</th>
                <th>Total Findings</th>
                <th>Severity Breakdown</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  // 4. Audit & Root-Cause Discovery Timeline
  const auditTimelineHtml = (record.timeline && record.timeline.length > 0)
    ? formatEvidenceTimelineHtml(record.timeline as TimelineEvent[])
    : '';

  // Safe serialized JSON for the download button with redacted evidence
  const safeRecordForExport: ScanRunRecord = {
    ...record,
    findings,
  };
  const safeRecordJson = JSON.stringify(safeRecordForExport).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  <style>
    :root {
      --canvas: #f6f3eb;
      --canvas-subtle: #efebe0;
      --card-bg: #ffffff;
      --border: #e2ddd3;
      --border-subtle: #eae5db;
      --text: #201e1b;
      --text-muted: #6b645b;
      --text-subtle: #8c8479;
      --primary: #1e3a5f;
      --primary-hover: #152943;
      --critical: #b91c1c;
      --critical-bg: #fef2f2;
      --critical-border: #fecaca;
      --high: #c2410c;
      --high-bg: #fff7ed;
      --high-border: #ffedd5;
      --medium: #b45309;
      --medium-bg: #fffbeb;
      --medium-border: #fef3c7;
      --low: #4d7c0f;
      --low-bg: #f7fee7;
      --low-border: #ecfccb;
      --info: #0369a1;
      --info-bg: #f0f9ff;
      --info-border: #e0f2fe;
      --success: #15803d;
      --success-bg: #f0fdf4;
      --success-border: #dcfce7;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--canvas);
      background-image: radial-gradient(circle at 10% 20%, rgba(255,255,255,0.7) 0%, transparent 40%),
                        radial-gradient(circle at 90% 80%, rgba(235,228,214,0.5) 0%, transparent 50%);
      color: var(--text);
      line-height: 1.6;
      padding: 2.5rem 1.5rem;
      min-height: 100vh;
    }
    .container { max-width: 980px; margin: 0 auto; }
    header {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.75rem 2rem;
      margin-bottom: 1.75rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1.25rem;
      box-shadow: 0 1px 3px rgba(32, 30, 27, 0.04), 0 6px 16px rgba(32, 30, 27, 0.02);
    }
    .brand-eyebrow {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 0.25rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .header-title-area { flex: 1; min-width: 280px; }
    h1 {
      font-size: 1.65rem;
      font-weight: 700;
      color: var(--text);
      letter-spacing: -0.02em;
    }
    .meta-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-top: 0.6rem;
    }
    .meta-bar span strong { color: var(--text); font-weight: 600; }
    .header-actions { display: flex; gap: 0.6rem; align-items: center; }
    .btn {
      font-size: 0.85rem;
      font-weight: 600;
      padding: 0.55rem 1.1rem;
      border-radius: 6px;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      transition: all 0.15s ease;
      border: none;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.08);
    }
    .btn-primary:hover {
      background: var(--primary-hover);
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.12);
    }
    .btn-secondary {
      background: #faf8f5;
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover {
      background: #f2eee6;
      border-color: #d8d2c4;
    }
    .dashboard-section { margin-bottom: 2rem; }
    .section-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .section-title {
      font-size: 1.2rem;
      font-weight: 700;
      color: var(--text);
      letter-spacing: -0.01em;
      margin-bottom: 0.85rem;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 1rem;
      margin-bottom: 1.75rem;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1rem 1.25rem;
      text-align: left;
      box-shadow: 0 1px 2px rgba(32, 30, 27, 0.03);
    }
    .stat-val { font-size: 1.75rem; font-weight: 700; line-height: 1.1; margin-bottom: 0.2rem; }
    .stat-label { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .finding-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.35rem 1.5rem;
      margin-bottom: 1.25rem;
      box-shadow: 0 1px 3px rgba(32, 30, 27, 0.03);
    }
    .border-critical { border-left: 4px solid var(--critical); }
    .border-high { border-left: 4px solid var(--high); }
    .border-medium { border-left: 4px solid var(--medium); }
    .border-low { border-left: 4px solid var(--low); }
    .border-info { border-left: 4px solid var(--info); }
    .finding-header { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
    .finding-number { color: var(--text-subtle); font-weight: 600; font-size: 0.9rem; }
    .finding-title { font-size: 1.05rem; font-weight: 600; color: var(--text); flex: 1; }
    .badge {
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.15rem 0.55rem;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: inline-block;
    }
    .badge-critical { background: var(--critical-bg); color: var(--critical); border: 1px solid var(--critical-border); }
    .badge-high { background: var(--high-bg); color: var(--high); border: 1px solid var(--high-border); }
    .badge-medium { background: var(--medium-bg); color: var(--medium); border: 1px solid var(--medium-border); }
    .badge-low { background: var(--low-bg); color: var(--low); border: 1px solid var(--low-border); }
    .badge-info { background: var(--info-bg); color: var(--info); border: 1px solid var(--info-border); }
    .badge-resolved { background: var(--success-bg); color: var(--success); border: 1px solid var(--success-border); }
    .badge-clean { background: var(--success-bg); color: var(--success); border: 1px solid var(--success-border); }
    .badge-cwe { background: #f3e8ff; color: #7e22ce; border: 1px solid #d8b4fe; }
    .confidence-tag {
      font-size: 0.75rem;
      color: var(--text-muted);
      background: var(--canvas);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      border: 1px solid var(--border);
    }
    .finding-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 0.75rem;
      padding-bottom: 0.6rem;
      border-bottom: 1px solid var(--border-subtle);
    }
    .finding-meta code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: var(--canvas-subtle);
      color: #2e2a24;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .finding-explanation { font-size: 0.95rem; color: #38342f; margin-bottom: 0.85rem; line-height: 1.5; }
    pre.evidence {
      background: #1c1917;
      border: 1px solid #292524;
      border-radius: 6px;
      padding: 0.85rem 1rem;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.82rem;
      color: #7dd3fc;
      margin-bottom: 0.85rem;
    }
    .remediation-box {
      background: #fdfaf3;
      border: 1px solid #e8dec8;
      border-radius: 8px;
      padding: 0.85rem 1rem;
      font-size: 0.88rem;
      color: #4a4133;
    }
    .remediation-header {
      font-weight: 700;
      color: #383024;
      display: flex;
      align-items: center;
      gap: 0.45rem;
      margin-bottom: 0.35rem;
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .remediation-box p { line-height: 1.5; margin: 0; }
    .patch-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 0.85rem 1rem;
      margin-top: 0.85rem;
    }
    .patch-header {
      font-weight: 700;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 0.45rem;
      margin-bottom: 0.35rem;
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .patch-code { background: #0f172a; color: #38bdf8; margin-bottom: 0; }
    .comparison-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.25rem 1.5rem;
      box-shadow: 0 1px 3px rgba(32, 30, 27, 0.03);
    }
    .comparison-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 1rem;
      padding-bottom: 0.6rem;
      border-bottom: 1px solid var(--border-subtle);
    }
    .comparison-meta code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: var(--canvas-subtle);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
    }
    .comparison-metrics {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .metric-pill {
      font-size: 0.85rem;
      padding: 0.35rem 0.8rem;
      border-radius: 6px;
      font-weight: 600;
    }
    .metric-new { background: var(--critical-bg); color: var(--critical); border: 1px solid var(--critical-border); }
    .metric-resolved { background: var(--success-bg); color: var(--success); border: 1px solid var(--success-border); }
    .metric-unchanged { background: var(--info-bg); color: var(--info); border: 1px solid var(--info-border); }
    .timeline-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .timeline-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 0.8rem;
      background: var(--canvas);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      font-size: 0.85rem;
      flex-wrap: wrap;
    }
    .timeline-badge {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.1rem 0.45rem;
      border-radius: 4px;
      letter-spacing: 0.05em;
    }
    .timeline-title { flex: 1; min-width: 200px; color: var(--text); }
    .timeline-title code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: var(--canvas-subtle);
      padding: 0.1rem 0.3rem;
      border-radius: 3px;
      font-size: 0.8rem;
    }
    .timeline-events-container { display: flex; flex-direction: column; gap: 0.75rem; }
    .timeline-event-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.9rem 1.15rem;
      box-shadow: 0 1px 2px rgba(32, 30, 27, 0.02);
    }
    .event-header { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.35rem; }
    .event-time { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.78rem; color: var(--text-muted); }
    .event-step { color: var(--text); font-size: 0.9rem; flex: 1; }
    .event-dur { font-size: 0.75rem; color: var(--text-muted); background: var(--canvas-subtle); padding: 0.1rem 0.4rem; border-radius: 4px; }
    .event-detail { font-size: 0.88rem; color: #38342f; margin-bottom: 0.35rem; line-height: 1.4; }
    .timeline-lineage { font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.4rem; }
    .timeline-lineage code { font-family: ui-monospace, SFMono-Regular, monospace; background: var(--canvas-subtle); padding: 0.1rem 0.3rem; border-radius: 3px; }
    .lineage-label { font-weight: 600; text-transform: uppercase; font-size: 0.7rem; }
    .table-container {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow-x: auto;
      box-shadow: 0 1px 3px rgba(32, 30, 27, 0.03);
    }
    .history-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.85rem;
    }
    .history-table th {
      background: var(--canvas-subtle);
      padding: 0.75rem 1rem;
      font-weight: 600;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      text-transform: uppercase;
      font-size: 0.72rem;
      letter-spacing: 0.05em;
    }
    .history-table td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border-subtle);
      color: var(--text);
    }
    .history-table tr:last-child td { border-bottom: none; }
    .current-run-row { background: #faf7f0; }
    .history-table code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: var(--canvas-subtle);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .mini-badges { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .empty-state {
      background: var(--card-bg);
      border: 1px dashed var(--border);
      border-radius: 12px;
      padding: 3.5rem 2rem;
      text-align: center;
      color: var(--text-muted);
      box-shadow: 0 1px 3px rgba(32, 30, 27, 0.02);
    }
    .empty-icon { font-size: 2.75rem; margin-bottom: 0.75rem; }
    .empty-state h3 { color: var(--text); font-size: 1.2rem; font-weight: 700; margin-bottom: 0.35rem; }
    footer {
      text-align: center;
      margin-top: 2.5rem;
      font-size: 0.8rem;
      color: var(--text-subtle);
    }
    @media print {
      body { background: #fff; color: #000; padding: 0; }
      .header-actions { display: none; }
      .stat-card, .finding-card, .comparison-card, .table-container { border: 1px solid #ccc; background: #fff; color: #000; box-shadow: none; }
      pre.evidence { background: #f4f4f4; color: #000; border-color: #ccc; }
      .remediation-box { background: #f9f9f9; border-color: #ddd; color: #111; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-title-area">
        <div class="brand-eyebrow">🛡️ RepoGuard Autonomous Reliability & Security</div>
        <h1>${escapeHtml(record.projectName)}</h1>
        <div class="meta-bar">
          <span><strong>Run ID:</strong> <code>${escapeHtml(record.runId)}</code></span>
          <span><strong>Timestamp:</strong> ${escapeHtml(record.timestamp)}</span>
          <span><strong>Files Scanned:</strong> ${record.filesScanned}</span>
          <span><strong>Duration:</strong> ${record.durationMs}ms</span>
          <span><strong>Total Findings:</strong> ${totalFindings}</span>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" onclick="downloadJsonReport()">📥 Download JSON</button>
        <button class="btn btn-secondary" onclick="window.print()">🖨️ Print / PDF</button>
      </div>
    </header>

    <div class="stats-grid">
      <div class="stat-card" style="border-top: 3px solid var(--primary)">
        <div class="stat-val" style="color: var(--primary)">${totalFindings}</div>
        <div class="stat-label">Total Findings</div>
      </div>
      <div class="stat-card" style="border-top: 3px solid var(--critical)">
        <div class="stat-val" style="color: var(--critical)">${summary.critical}</div>
        <div class="stat-label">Critical</div>
      </div>
      <div class="stat-card" style="border-top: 3px solid var(--high)">
        <div class="stat-val" style="color: var(--high)">${summary.high}</div>
        <div class="stat-label">High</div>
      </div>
      <div class="stat-card" style="border-top: 3px solid var(--medium)">
        <div class="stat-val" style="color: var(--medium)">${summary.medium}</div>
        <div class="stat-label">Medium</div>
      </div>
      <div class="stat-card" style="border-top: 3px solid var(--low)">
        <div class="stat-val" style="color: var(--low)">${summary.low}</div>
        <div class="stat-label">Low</div>
      </div>
      <div class="stat-card" style="border-top: 3px solid var(--info)">
        <div class="stat-val" style="color: var(--info)">${summary.info}</div>
        <div class="stat-label">Info</div>
      </div>
    </div>

    ${comparisonHtml}

    ${historyHtml}

    ${auditTimelineHtml}

    <section class="dashboard-section">
      <h2 class="section-title">Audit Findings & Remediation</h2>
      ${findingsHtml}
    </section>

    <footer>
      Report generated autonomously by RepoGuard Platform. Confidential and verified evidence-backed audit.
    </footer>
  </div>

  <script>
    const reportData = ${safeRecordJson};
    function downloadJsonReport() {
      const jsonString = JSON.stringify(reportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = "repoguard-" + (reportData.runId || 'scan') + ".json";
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>`;
}
