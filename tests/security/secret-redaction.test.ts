/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/security/secret-redaction.test.ts
 * Owner: Security / Reporting (Ayan)
 * Purpose: Security test: ensure secrets, credentials, and private tokens are redacted in all report outputs
 */

import { describe, it, expect } from 'vitest';
import {
  redactSecretEvidence,
  sanitizeFindingsForReport,
  formatHtmlReport,
  formatMarkdownReport,
  formatJsonReport,
} from '../../src/report/index.js';
import { ScanRunRecord } from '../../src/storage/index.js';

describe('Security: Secret & Credential Redaction in Reports', () => {
  it('redacts AWS Access Key IDs', () => {
    const raw = 'aws_key = "AKIA1234567890EXAMPLE";';
    const redacted = redactSecretEvidence(raw);
    expect(redacted).not.toContain('AKIA1234567890EXAMPLE');
    expect(redacted).toContain('AKIA****************');
  });

  it('redacts classic GitHub Personal Access Tokens (ghp_)', () => {
    const raw = 'const token = "ghp_123456789012345678901234567890123456";';
    const redacted = redactSecretEvidence(raw);
    expect(redacted).not.toContain('ghp_123456789012345678901234567890123456');
    expect(redacted).toContain('ghp_********************************');
  });

  it('redacts fine-grained GitHub PATs (github_pat_)', () => {
    const raw = 'token: "github_pat_11ABCD_example_token_value_that_is_long"';
    const redacted = redactSecretEvidence(raw);
    expect(redacted).not.toContain('github_pat_11ABCD_example_token_value_that_is_long');
    expect(redacted).toContain('github_pat_********************');
  });

  it('redacts generic secrets, passwords, and API key assignments', () => {
    const samples = [
      'api_key = "my_super_secret_api_key_12345"',
      'password: "SuperSecretPassword999!"',
      'jwt_secret: "jwt_signing_token_value_xyz"',
      'auth_token: "secret_auth_token_string_here"',
    ];

    for (const sample of samples) {
      const redacted = redactSecretEvidence(sample);
      expect(redacted).toContain('[REDACTED_SECRET]');
    }
  });

  it('redacts Bearer authorization tokens', () => {
    const raw = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz';
    const redacted = redactSecretEvidence(raw);
    expect(redacted).toContain('Bearer [REDACTED_SECRET]');
    expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz');
  });

  it('redacts private keys and Slack tokens', () => {
    const privateKey = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----';
    const slack = 'slack_token = "xoxb-123456789012-1234567890123-abcdef123456";';

    expect(redactSecretEvidence(privateKey)).toBe('[REDACTED_PRIVATE_KEY]');
    expect(redactSecretEvidence(slack)).toContain('[REDACTED_SLACK_TOKEN]');
  });

  it('guarantees zero secret leakage across HTML, Markdown, and JSON report generation', () => {
    const recordWithSecrets: ScanRunRecord = {
      runId: 'sec-audit-001',
      projectName: 'vault-service',
      timestamp: '2026-10-18T10:00:00.000Z',
      durationMs: 95,
      repositoryRoot: '/workspace/vault-service',
      filesScanned: 5,
      findingsCount: 2,
      summary: { critical: 2, high: 0, medium: 0, low: 0, info: 0 },
      findings: [
        {
          id: 'SEC-001',
          category: 'SECURITY',
          severity: 'CRITICAL',
          title: 'Hardcoded AWS Credentials',
          path: 'src/cloud/aws.ts',
          lineRange: { start: 14, end: 16 },
          explanation: 'AWS credentials embedded directly in client instantiation.',
          evidence: 'const client = new AWS.S3({ accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" });',
        },
        {
          id: 'SEC-002',
          category: 'SECURITY',
          severity: 'CRITICAL',
          title: 'Exposed GitHub Token',
          path: 'src/ci/deploy.ts',
          lineRange: { start: 8, end: 8 },
          explanation: 'GitHub deployment token committed to source.',
          evidence: 'const GITHUB_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";',
        },
      ],
    };

    const html = formatHtmlReport(recordWithSecrets);
    const md = formatMarkdownReport(recordWithSecrets);
    const json = formatJsonReport(recordWithSecrets);

    // Verify raw secrets never appear in any report format
    for (const report of [html, md, json]) {
      expect(report).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(report).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
      expect(report).toContain('AKIA****************');
      expect(report).toContain('ghp_********************************');
    }
  });

  it('sanitizes findings arrays with sanitizeFindingsForReport()', () => {
    const findings = [
      {
        id: 'F-1',
        category: 'SECURITY',
        severity: 'CRITICAL' as const,
        title: 'Secret',
        path: 'a.ts',
        explanation: 'Exp',
        evidence: 'api_key: "abcdefghijklmnop"',
      },
    ];

    const sanitized = sanitizeFindingsForReport(findings);
    expect(sanitized[0]?.evidence).toContain('[REDACTED_SECRET]');
    expect(sanitized[0]?.evidence).not.toContain('abcdefghijklmnop');
  });
});
