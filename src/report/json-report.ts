/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/report/json-report.ts
 * Owner: Ayan
 * Purpose: Report formatter: machine-readable JSON report output
 */

import { ScanRunRecord } from '../storage/run-store.js';

export interface JsonReportOptions {
  pretty?: boolean;
  indent?: number;
  includeEvidence?: boolean;
}

/**
 * Formats a scan run record into a structured JSON report string.
 * Ensures consistent serialization, optional indentation, and handles potential edge cases.
 */
export function formatJsonReport(
  record: ScanRunRecord,
  options: JsonReportOptions = {}
): string {
  const pretty = options.pretty !== false;
  const indent = options.indent ?? (pretty ? 2 : 0);
  const includeEvidence = options.includeEvidence !== false;

  // Clone to avoid mutating original record
  const findings = (record.findings || []).map((f) => {
    const copy = { ...f };
    if (!includeEvidence) {
      delete copy.evidence;
    }
    return copy;
  });

  const payload = {
    schemaVersion: '1.0.0',
    generator: 'RepoGuard Reliability & Security Platform',
    ...record,
    findings,
  };

  return JSON.stringify(payload, null, indent);
}
