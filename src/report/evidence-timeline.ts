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
    const detail = escapeTableCell(ev?.detail || '');
    const status = ev?.status || 'INFO';

    lines.push(
      `| \`${timestamp}\` | **${step}** | ${statusIcon} ${status} | ${detail} | ${dur} |`
    );
  }

  lines.push('');
  return lines.join('\n');
}