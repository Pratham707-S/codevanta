/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/report/scan-comparison.ts
 * Owner: Ayan
 * Purpose: Scan comparison and differential timeline generation between consecutive scans
 */

import { ScanRunRecord, StorageFinding } from '../storage/run-store.js';

export interface ScanComparison {
  currentRunId: string;
  previousRunId: string;
  currentTimestamp: string;
  previousTimestamp: string;
  newFindings: StorageFinding[];
  resolvedFindings: StorageFinding[];
  unchangedFindings: StorageFinding[];
  delta: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

/**
 * Derives a reliable identifier for tracking findings across runs.
 * Uses finding.fingerprint if available; otherwise finding.id; falls back to composite path:lineRange:category:title.
 */
export function computeFindingIdentifier(finding: StorageFinding): string {
  if (finding.fingerprint && finding.fingerprint.trim().length > 0) {
    return finding.fingerprint.trim();
  }
  if (finding.id && finding.id.trim().length > 0) {
    return finding.id.trim();
  }
  const lines = finding.lineRange ? `${finding.lineRange.start}-${finding.lineRange.end}` : '0';
  return `${finding.path}:${lines}:${finding.category}:${finding.title}`;
}

/**
 * Compares two scan runs and classifies findings into:
 * - newFindings: introduced in the current scan
 * - resolvedFindings: present in the previous scan but now resolved
 * - unchangedFindings: persisted across both scans
 */
export function compareScans(
  current: ScanRunRecord,
  previous: ScanRunRecord
): ScanComparison {
  const prevMap = new Map<string, StorageFinding>();
  for (const f of previous.findings || []) {
    prevMap.set(computeFindingIdentifier(f), f);
  }

  const currMap = new Map<string, StorageFinding>();
  const newFindings: StorageFinding[] = [];
  const unchangedFindings: StorageFinding[] = [];

  for (const f of current.findings || []) {
    const id = computeFindingIdentifier(f);
    currMap.set(id, f);
    if (prevMap.has(id)) {
      unchangedFindings.push(f);
    } else {
      newFindings.push(f);
    }
  }

  const resolvedFindings: StorageFinding[] = [];
  for (const [id, f] of prevMap.entries()) {
    if (!currMap.has(id)) {
      resolvedFindings.push(f);
    }
  }

  const currSum = current.summary || { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const prevSum = previous.summary || { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

  return {
    currentRunId: current.runId,
    previousRunId: previous.runId,
    currentTimestamp: current.timestamp,
    previousTimestamp: previous.timestamp,
    newFindings,
    resolvedFindings,
    unchangedFindings,
    delta: {
      total: (current.findingsCount ?? current.findings?.length ?? 0) -
             (previous.findingsCount ?? previous.findings?.length ?? 0),
      critical: (currSum.critical ?? 0) - (prevSum.critical ?? 0),
      high: (currSum.high ?? 0) - (prevSum.high ?? 0),
      medium: (currSum.medium ?? 0) - (prevSum.medium ?? 0),
      low: (currSum.low ?? 0) - (prevSum.low ?? 0),
      info: (currSum.info ?? 0) - (prevSum.info ?? 0),
    },
  };
}
