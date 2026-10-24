/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/report/evidence-timeline.ts
 * Owner: Ayan
 * Purpose: Formats chronological audit steps and evidence discovery timelines
 */

export interface TimelineEvent {
  timestamp?: string;
  step?: string;
  detail?: string;
  status?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  durationMs?: number;
  commitSha?: string;
  author?: string;
  commitDate?: string;
  filePath?: string;
  line?: number;
  findingId?: string;
}

/**
 * Safely escapes markdown table characters and prevents crashes on missing values.
 */
function escapeTableCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r\n|\r|\n/g, ' ');
}

/**
 * Safely escapes HTML entities.
 */
function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders an evidence timeline as a formatted Markdown section.
 */
export function formatEvidenceTimelineMarkdown(events: TimelineEvent[]): string {
  if (!Array.isArray(events) || events.length === 0) {
    return '_No timeline events recorded._';
  }

  const lines: string[] = [];
  lines.push('### ⏱️ Audit & Discovery Timeline');
  lines.push('');
  lines.push('| Timestamp | Stage | Status | Detail | Duration |');
  lines.push('| :--- | :--- | :--- | :--- | :--- |');

  for (const ev of events) {
    const statusIcon =
      ev?.status === 'ERROR' ? '❌' :
      ev?.status === 'WARNING' ? '⚠️' :
      ev?.status === 'SUCCESS' ? '✅' : 'ℹ️';

    const dur =
      typeof ev?.durationMs === 'number' &&
      Number.isFinite(ev.durationMs) &&
      ev.durationMs >= 0
        ? `${ev.durationMs}ms`
        : '-';

    const timestamp = escapeTableCell(ev?.timestamp || 'N/A');
    const step = escapeTableCell(ev?.step || 'Unknown Step');
    let detailText = ev?.detail || '';
    if (ev?.commitSha) {
      const shortSha = ev.commitSha.slice(0, 8);
      const authorText = ev.author ? ` by ${ev.author}` : '';
      detailText = detailText ? `${detailText} (commit: \`${shortSha}\`${authorText})` : `Commit: \`${shortSha}\`${authorText}`;
    }
    const detail = escapeTableCell(detailText);
    const status = ev?.status || 'INFO';

    lines.push(
      `| \`${timestamp}\` | **${step}** | ${statusIcon} ${status} | ${detail} | ${dur} |`
    );
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Renders an evidence timeline as a structured HTML section.
 */
export function formatEvidenceTimelineHtml(events: TimelineEvent[]): string {
  if (!Array.isArray(events) || events.length === 0) {
    return '';
  }

  const statusBadgeClass: Record<string, string> = {
    SUCCESS: 'badge-clean',
    WARNING: 'badge-medium',
    ERROR: 'badge-critical',
    INFO: 'badge-info',
  };

  const rows = events.map((ev) => {
    const status = ev.status || 'INFO';
    const badgeClass = statusBadgeClass[status] || 'badge-info';
    const timestamp = escapeHtml(ev.timestamp || 'N/A');
    const step = escapeHtml(ev.step || 'Execution Step');
    const detail = escapeHtml(ev.detail || '');
    const dur = typeof ev.durationMs === 'number' && ev.durationMs >= 0 ? `${ev.durationMs}ms` : '';

    let lineageHtml = '';
    if (ev.commitSha || ev.author) {
      const shaStr = ev.commitSha ? `<code>${escapeHtml(ev.commitSha.slice(0, 8))}</code>` : '';
      const authorStr = ev.author ? `<span>${escapeHtml(ev.author)}</span>` : '';
      lineageHtml = `
        <div class="timeline-lineage">
          <span class="lineage-label">Origin:</span> ${shaStr} ${authorStr}
        </div>
      `;
    }

    return `
      <div class="timeline-event-card">
        <div class="event-header">
          <span class="event-time">${timestamp}</span>
          <span class="badge ${badgeClass}">${status}</span>
          <span class="event-step"><strong>${step}</strong></span>
          ${dur ? `<span class="event-dur">${dur}</span>` : ''}
        </div>
        ${detail ? `<div class="event-detail">${detail}</div>` : ''}
        ${lineageHtml}
      </div>
    `;
  }).join('\n');

  return `
    <section class="dashboard-section">
      <h2 class="section-title">⏱️ Audit & Root-Cause Discovery Timeline</h2>
      <div class="timeline-events-container">
        ${rows}
      </div>
    </section>
  `;
}
