/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/report/html-report.ts
 * Owner: Ayan
 * Purpose: Report formatter: self-contained, secure HTML audit report output with strict XSS sanitization
 */

import { ScanRunRecord } from '../storage/run-store.js';

export interface HtmlReportOptions {
  title?: string;
  includeEvidence?: boolean;
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
 * Formats a scan run record into a standalone, styled HTML report with security escaping.
 */
export function formatHtmlReport(
  record: ScanRunRecord,
  options: HtmlReportOptions = {}
): string {
  const pageTitle = escapeHtml(options.title || `RepoGuard Audit Report — ${record.projectName}`);
  const includeEvidence = options.includeEvidence !== false;
  const findings = record.findings || [];

  const severityBadgeClass: Record<string, string> = {
    CRITICAL: 'badge-critical',
    HIGH: 'badge-high',
    MEDIUM: 'badge-medium',
    LOW: 'badge-low',
    INFO: 'badge-info',
  };

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
        const lineInfo = f.lineRange ? ` (Lines ${escapeHtml(f.lineRange.start)}–${escapeHtml(f.lineRange.end)})` : '';
        const confidenceInfo = f.confidence !== undefined ? `<span class="confidence">Confidence: ${(f.confidence * 100).toFixed(0)}%</span>` : '';
        const evidenceBlock = (includeEvidence && f.evidence)
          ? `<pre class="evidence"><code>${escapeHtml(f.evidence)}</code></pre>`
          : '';

        return `
          <div class="finding-card ${badgeClass}-card">
            <div class="finding-header">
              <span class="finding-number">#${i + 1}</span>
              <span class="badge ${badgeClass}">${escapeHtml(f.severity)}</span>
              <span class="finding-title">${escapeHtml(f.title)}</span>
              ${confidenceInfo}
            </div>
            <div class="finding-meta">
              <span><strong>Category:</strong> ${escapeHtml(f.category)}</span>
              <span><strong>Location:</strong> <code>${escapeHtml(f.path)}</code>${lineInfo}</span>
              <span><strong>ID:</strong> <code>${escapeHtml(f.id)}</code></span>
            </div>
            <div class="finding-explanation">
              <p>${escapeHtml(f.explanation)}</p>
            </div>
            ${evidenceBlock}
          </div>
        `;
      }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
      --critical: #ef4444;
      --high: #f97316;
      --medium: #eab308;
      --low: #3b82f6;
      --info: #64748b;
      --success: #22c55e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 2rem;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }
    h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; }
    .meta-bar { display: flex; flex-wrap: wrap; gap: 1.5rem; color: var(--text-muted); font-size: 0.9rem; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      text-align: center;
    }
    .stat-val { font-size: 1.75rem; font-weight: 700; }
    .stat-label { font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .finding-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1rem;
    }
    .finding-header { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
    .finding-number { color: var(--text-muted); font-weight: bold; }
    .finding-title { font-size: 1.1rem; font-weight: 600; flex: 1; }
    .badge {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-critical { background: rgba(239, 68, 68, 0.2); color: var(--critical); border: 1px solid var(--critical); }
    .badge-high { background: rgba(249, 115, 22, 0.2); color: var(--high); border: 1px solid var(--high); }
    .badge-medium { background: rgba(234, 179, 8, 0.2); color: var(--medium); border: 1px solid var(--medium); }
    .badge-low { background: rgba(59, 130, 246, 0.2); color: var(--low); border: 1px solid var(--low); }
    .badge-info { background: rgba(100, 116, 139, 0.2); color: var(--info); border: 1px solid var(--info); }
    .finding-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .finding-explanation { font-size: 0.95rem; margin-bottom: 0.75rem; }
    pre.evidence {
      background: #090d16;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.75rem;
      overflow-x: auto;
      font-family: monospace;
      font-size: 0.85rem;
      color: #38bdf8;
    }
    .empty-state {
      background: var(--card-bg);
      border: 1px dashed var(--border);
      border-radius: 8px;
      padding: 3rem;
      text-align: center;
      color: var(--text-muted);
    }
    .empty-icon { font-size: 3rem; margin-bottom: 1rem; }
    footer {
      text-align: center;
      margin-top: 3rem;
      font-size: 0.8rem;
      color: var(--text-muted);
      border-top: 1px solid var(--border);
      padding-top: 1.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🛡️ RepoGuard Audit Report: ${escapeHtml(record.projectName)}</h1>
      <div class="meta-bar">
        <span><strong>Timestamp:</strong> ${escapeHtml(record.timestamp)}</span>
        <span><strong>Files Scanned:</strong> ${record.filesScanned}</span>
        <span><strong>Duration:</strong> ${record.durationMs}ms</span>
        <span><strong>Total Findings:</strong> ${findings.length}</span>
      </div>
    </header>

    <div class="stats-grid">
      <div class="stat-card" style="border-top: 3px solid var(--critical)">
        <div class="stat-val" style="color: var(--critical)">${record.summary.critical}</div>
        <div class="stat-label">Critical</div>
      </div>
      <div class="stat-card" style="border-top: 3px solid var(--high)">
        <div class="stat-val" style="color: var(--high)">${record.summary.high}</div>
        <div class="stat-label">High</div>
      </div>
      <div class="stat-card" style="border-top: 3px solid var(--medium)">
        <div class="stat-val" style="color: var(--medium)">${record.summary.medium}</div>
        <div class="stat-label">Medium</div>
      </div>
      <div class="stat-card" style="border-top: 3px solid var(--low)">
        <div class="stat-val" style="color: var(--low)">${record.summary.low}</div>
        <div class="stat-label">Low</div>
      </div>
      <div class="stat-card" style="border-top: 3px solid var(--info)">
        <div class="stat-val" style="color: var(--info)">${record.summary.info}</div>
        <div class="stat-label">Info</div>
      </div>
    </div>

    <section>
      <h2 style="font-size: 1.25rem; margin-bottom: 1rem;">Findings Details</h2>
      ${findingsHtml}
    </section>

    <footer>
      Generated autonomously by RepoGuard Platform. Confidential and verified.
    </footer>
  </div>
</body>
</html>`;
}
