/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/report/html-report.ts
 * Owner: Ayan
 * Purpose: Report formatter: self-contained, secure HTML audit report output with warm AI beige & white aesthetic
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
 * Formats a scan run record into a standalone, styled HTML report with warm AI beige & white styling.
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

  const severityBorderClass: Record<string, string> = {
    CRITICAL: 'border-critical',
    HIGH: 'border-high',
    MEDIUM: 'border-medium',
    LOW: 'border-low',
    INFO: 'border-info',
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
        const borderClass = severityBorderClass[f.severity] || 'border-info';
        const lineInfo = f.lineRange ? ` (Lines ${escapeHtml(f.lineRange.start)}–${escapeHtml(f.lineRange.end)})` : '';
        
        // FIXED: Added missing multiplication operator and safeguard for confidence value
        const confidenceVal = typeof f.confidence === 'number' 
          ? (f.confidence <= 1 ? f.confidence * 100 : f.confidence) 
          : undefined;
        const confidenceInfo = confidenceVal !== undefined 
          ? `<span class="confidence-tag">Confidence: ${confidenceVal.toFixed(0)}%</span>` 
          : '';

        const evidenceBlock = (includeEvidence && f.evidence)
          ? `<pre class="evidence"><code>${escapeHtml(f.evidence)}</code></pre>`
          : '';

        return `
          <div class="finding-card ${borderClass}">
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

  // JSON serialization for client-side download button
  const safeRecordJson = JSON.stringify(record).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --canvas: #f6f3eb;
      --canvas-subtle: #efebe0;
      --card-bg: #ffffff;
      --text: #201e1b;
      --text-muted: #6b645b;
      --text-subtle: #968e83;
      --border: #e4dfd3;
      --border-subtle: #ebe7de;
      --critical: #c5221f;
      --critical-bg: #fdf2f2;
      --critical-border: #f8b4b4;
      --high: #b45309;
      --high-bg: #fef8ee;
      --high-border: #fcd34d;
      --medium: #b45309;
      --medium-bg: #fffbeb;
      --medium-border: #fde68a;
      --low: #1d4ed8;
      --low-bg: #eff6ff;
      --low-border: #bfdbfe;
      --info: #44403c;
      --info-bg: #f5f5f4;
      --info-border: #d6d3d1;
      --success: #15803d;
      --primary: #201e1b;
      --primary-hover: #000000;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--canvas);
      background-image: radial-gradient(circle at 10% 20%, rgba(255,255,255,0.7) 0%, transparent 40%),
                        radial-gradient(circle at 90% 80%, rgba(235,228,214,0.5) 0%, transparent 50%);
      color: var(--text);
      line-height: 1.6;
      padding: 2.5rem 1.5rem;
      min-height: 100vh;
    }
    .container { max-width: 960px; margin: 0 auto; }
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
      font-size: 1.6rem;
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
      padding: 0.55rem 1.1rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      text-decoration: none;
      transition: all 0.15s ease;
      font-family: inherit;
    }
    .btn-primary {
      background: var(--primary);
      color: #fafaf9;
      border: 1px solid var(--primary);
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
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
    .section-title {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 1rem;
      letter-spacing: -0.01em;
    }
    .finding-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.35rem 1.5rem;
      margin-bottom: 1rem;
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
    }
    .badge-critical { background: var(--critical-bg); color: var(--critical); border: 1px solid var(--critical-border); }
    .badge-high { background: var(--high-bg); color: var(--high); border: 1px solid var(--high-border); }
    .badge-medium { background: var(--medium-bg); color: var(--medium); border: 1px solid var(--medium-border); }
    .badge-low { background: var(--low-bg); color: var(--low); border: 1px solid var(--low-border); }
    .badge-info { background: var(--info-bg); color: var(--info); border: 1px solid var(--info-border); }
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
      font-family: 'JetBrains Mono', monospace;
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
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.82rem;
      color: #7dd3fc;
    }
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
      .stat-card, .finding-card { border: 1px solid #ccc; background: #fff; color: #000; box-shadow: none; }
      pre.evidence { background: #f4f4f4; color: #000; border-color: #ccc; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-title-area">
        <div class="brand-eyebrow">🛡️ RepoGuard Autonomous Reliability</div>
        <h1>${escapeHtml(record.projectName)}</h1>
        <div class="meta-bar">
          <span><strong>Timestamp:</strong> ${escapeHtml(record.timestamp)}</span>
          <span><strong>Files Scanned:</strong> ${record.filesScanned}</span>
          <span><strong>Duration:</strong> ${record.durationMs}ms</span>
          <span><strong>Total Findings:</strong> ${findings.length}</span>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" onclick="downloadJsonReport()">📥 Download JSON</button>
        <button class="btn btn-secondary" onclick="window.print()">🖨️ Print / PDF</button>
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
      <h2 class="section-title">Audit Findings & Evidence</h2>
      ${findingsHtml}
    </section>

    <footer>
      Report generated autonomously by RepoGuard Platform. Confidential and verified.
    </footer>
  </div>

  <script>
    const reportData = ${safeRecordJson};
    function downloadJsonReport() {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reportData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "repoguard-" + reportData.runId + ".json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    }
  </script>
</body>
</html>`;
}