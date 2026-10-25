/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/report/redaction.ts
 * Owner: Ayan
 * Purpose: Report-level defensive redaction of sensitive credentials and tokens in evidence
 */

import { StorageFinding } from '../storage/run-store.js';

/**
 * Defensive secret redaction for evidence strings.
 * Scrubs AWS keys, GitHub tokens, Slack tokens, private keys, bearer tokens,
 * and generic password/secret assignments before embedding into any report.
 */
export function redactSecretEvidence(evidence: unknown): string {
  if (evidence === null || evidence === undefined) {
    return '';
  }
  let str = String(evidence);

  // 1. AWS Access Key ID (AKIA prefix)
  str = str.replace(/\b(AKIA[0-9A-Z]{16,28})\b/g, (match) => match.slice(0, 4) + '*'.repeat(Math.max(16, match.length - 4)));

  // 2. GitHub Personal Access Tokens (classic ghp_ and fine-grained github_pat_)
  str = str.replace(/\b(ghp_[a-zA-Z0-9]{36})\b/g, (match) => match.slice(0, 4) + '********************************');
  str = str.replace(/\b(github_pat_[a-zA-Z0-9_]{22,82})\b/g, (match) => match.slice(0, 11) + '********************');

  // 3. Generic credentials, API keys, tokens, and secret assignments
  str = str.replace(
    /((?:api_?key|jwt_?secret|auth_?token|client_?secret|password|passwd|secret|access_?token|secret_?access_?key|aws_?secret_?key|aws_?secret)\s*[:=]\s*["'])[^"'\r\n]+(["'])/gi,
    '$1[REDACTED_SECRET]$2'
  );
  str = str.replace(
    /((?:api_?key|jwt_?secret|auth_?token|client_?secret|password|passwd|secret|access_?token|secret_?access_?key|aws_?secret_?key|aws_?secret)\s*[:=]\s*)(?!["'])[^\s,;]{8,}/gi,
    '$1[REDACTED_SECRET]'
  );

  // 4. Bearer tokens in headers or authorization strings
  str = str.replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]{16,}\b/gi, '$1[REDACTED_SECRET]');

  // 5. PEM / OpenSSH / RSA Private Keys
  str = str.replace(/-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');

  // 6. Slack API tokens
  str = str.replace(/\b(xox[baprs]-[0-9a-zA-Z]{10,48})\b/g, '[REDACTED_SLACK_TOKEN]');

  return str;
}

/**
 * Returns a cloned finding with its evidence safely sanitized for report output.
 */
export function sanitizeFindingForReport(finding: StorageFinding): StorageFinding {
  return {
    ...finding,
    evidence: finding.evidence !== undefined ? redactSecretEvidence(finding.evidence) : undefined,
    patch: finding.patch !== undefined ? redactSecretEvidence(finding.patch) : undefined,
    suggestedFix: finding.suggestedFix !== undefined ? redactSecretEvidence(finding.suggestedFix) : undefined,
  };
}

/**
 * Sanitizes an array of findings for safe inclusion in reports.
 */
export function sanitizeFindingsForReport(findings: StorageFinding[]): StorageFinding[] {
  return findings.map(sanitizeFindingForReport);
}
