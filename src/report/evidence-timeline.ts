/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/report/evidence-timeline.ts
 * Owner: Ayan
 * Purpose: Formats chronological audit steps and evidence discovery timelines
 */

export interface TimelineEvent {
  timestamp: string;
  step: string;
  detail: string;
  status?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  durationMs?: number;
}

/**
 * Renders an evidence timeline as a formatted Markdown section.
 */
export function formatEvidenceTimelineMarkdown(events: TimelineEvent[]): string {
  if (!events || events.length === 0) {
    return '_No timeline events recorded._';
  }

  const lines: string[] = [];
  lines.push('### ⏱️ Audit & Discovery Timeline');
  lines.push('');
  lines.push('| Timestamp | Stage | Status | Detail | Duration |');
  lines.push('| :--- | :--- | :--- | :--- | :--- |');

  for (const ev of events) {
    const statusIcon = ev.status === 'ERROR' ? '❌' :
      ev.status === 'WARNING' ? '⚠️' :
      ev.status === 'SUCCESS' ? '✅' : 'ℹ️';
    const dur = ev.durationMs !== undefined ? `${ev.durationMs}ms` : '-';
    lines.push(`| \`${ev.timestamp}\` | **${ev.step}** | ${statusIcon} ${ev.status || 'INFO'} | ${ev.detail} | ${dur} |`);
  }

  lines.push('');
  return lines.join('\n');
}
