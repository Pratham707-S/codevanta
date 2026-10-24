/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/context/secret-redactor.test.ts
 * Owner: Security / Context (Manni / Team Lead)
 * Purpose: Unit tests for secret redactor (AWS keys, GitHub tokens, private keys, inline secrets)
 */

import { describe, it, expect } from 'vitest';
import {
  redactSecrets,
  sanitizeWithAudit,
  containsPotentialSecrets,
  REDACTION_MARKERS,
} from '../../../src/context/secret-redactor.js';

describe('Context: SecretRedactor', () => {
  describe('AWS Credentials', () => {
    it('redacts standard 20-character AWS Access Key IDs (AKIA prefix)', () => {
      const code = 'const awsKey = "AKIAIOSFODNN7EXAMPLE";';
      const result = redactSecrets(code);
      expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(result).toContain('AKIA****************');
    });

    it('redacts AWS Secret Access Keys', () => {
      const code = 'aws_secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"';
      const result = redactSecrets(code);
      expect(result).not.toContain('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
      expect(result).toContain(REDACTION_MARKERS.SECRET);
    });
  });

  describe('GitHub Tokens', () => {
    it('redacts classic GitHub Personal Access Tokens (ghp_)', () => {
      const token = 'ghp_' + 'A'.repeat(36);
      const code = `const token = "${token}";`;
      const result = redactSecrets(code);
      expect(result).not.toContain(token);
      expect(result).toContain('ghp_********************************');
    });

    it('redacts OAuth and App tokens (gho_, ghs_)', () => {
      const gho = 'gho_' + 'B'.repeat(36);
      const ghs = 'ghs_' + 'C'.repeat(36);
      expect(redactSecrets(`token = "${gho}"`)).toContain('gho_********************************');
      expect(redactSecrets(`token = "${ghs}"`)).toContain('ghs_********************************');
    });

    it('redacts fine-grained GitHub PATs (github_pat_)', () => {
      const pat = 'github_pat_11AAAAAAA_example_token_suffix_xyz_1234567890';
      const code = `export GITHUB_TOKEN="${pat}"`;
      const result = redactSecrets(code);
      expect(result).not.toContain(pat);
      expect(result).toContain('github_pat_********************');
    });
  });

  describe('Private Keys (PEM / RSA / OpenSSH)', () => {
    it('redacts multiline RSA / PEM private key blocks', () => {
      const rsaKey = `
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y1v8+hP6N3...
multiple lines of secret base64 data here...
...ending with footer
-----END RSA PRIVATE KEY-----
`;
      const code = `const key = \`${rsaKey}\`;`;
      const result = redactSecrets(code);
      expect(result).not.toContain('MIIEowIBAAKCAQEA0Y1v8+hP6N3');
      expect(result).toContain(REDACTION_MARKERS.PRIVATE_KEY);
    });

    it('redacts generic OpenSSH private key blocks', () => {
      const openSsh = `
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
-----END OPENSSH PRIVATE KEY-----
`;
      const result = redactSecrets(openSsh);
      expect(result).not.toContain('b3BlbnNzaC1rZXktdjE');
      expect(result).toContain(REDACTION_MARKERS.PRIVATE_KEY);
    });

    it('redacts PGP private key blocks (PRIVATE KEY BLOCK syntax)', () => {
      const pgp = `
-----BEGIN PGP PRIVATE KEY BLOCK-----
Version: BCPG C# v1.6.1.0
lQOsBFZ4F4oBCADQ
-----END PGP PRIVATE KEY BLOCK-----
`;
      const result = redactSecrets(pgp);
      expect(result).not.toContain('lQOsBFZ4F4oBCADQ');
      expect(result).toContain(REDACTION_MARKERS.PRIVATE_KEY);
    });

    it('preserves exact newline count when redacting multiline private keys', () => {
      const multiline = [
        'line 1',
        '-----BEGIN RSA PRIVATE KEY-----',
        'secret line 3',
        'secret line 4',
        '-----END RSA PRIVATE KEY-----',
        'line 6',
      ].join('\n');

      const result = redactSecrets(multiline);
      expect(result.split('\n').length).toBe(6);
      expect(result).not.toContain('secret line 3');
      expect(result).not.toContain('secret line 4');
      expect(result).toContain('line 1');
      expect(result).toContain('line 6');
    });

    it('redacts unclosed or truncated private key streams safely', () => {
      const unclosed = [
        'const key = `-----BEGIN PRIVATE KEY-----',
        'UNCLOSED_SECRET_DATA_AAAAAA',
        'UNCLOSED_SECRET_DATA_BBBBBB',
      ].join('\n');

      const result = redactSecrets(unclosed);
      expect(result).not.toContain('UNCLOSED_SECRET_DATA_AAAAAA');
      expect(result).not.toContain('UNCLOSED_SECRET_DATA_BBBBBB');
      expect(result).toContain(REDACTION_MARKERS.PRIVATE_KEY);
    });
  });

  describe('Bearer and Slack Tokens', () => {
    it('redacts Bearer tokens in headers', () => {
      const code = 'const headers = { Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.secret" };';
      const result = redactSecrets(code);
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9.secret');
      expect(result).toContain(`Bearer ${REDACTION_MARKERS.TOKEN}`);
    });

    it('redacts Slack bot/user tokens (xoxb-, xoxp-)', () => {
      const code = 'const slack = "xoxb-123456789012-1234567890123-abcdefghijklmnopqrstuvwx";';
      const result = redactSecrets(code);
      expect(result).not.toContain('xoxb-123456789012');
      expect(result).toContain(REDACTION_MARKERS.TOKEN);
    });
  });

  describe('Common Credentials & Passwords (JSON, YAML, .env, Code)', () => {
    it('redacts generic API key and secret assignments with quotes', () => {
      const samples = [
        'api_key: "ai_live_secret_key_98765"',
        'apiKey = \'my-secret-cloud-api-key-here\'',
        'jwt_secret: "super-secure-jwt-signing-secret"',
        'client_secret = "google_oauth_client_secret_xyz"',
        'db_password: "ProdPostgresPassword123#"',
      ];

      for (const sample of samples) {
        const result = redactSecrets(sample);
        expect(result).toContain(REDACTION_MARKERS.SECRET);
      }
    });

    it('redacts unquoted .env format assignments', () => {
      const envLines = [
        'API_KEY=live_sk_abcdef1234567890',
        'DATABASE_PASSWORD=ProdDbPassword#2026',
        'JWT_SECRET=super_secret_jwt_signature_key',
      ];

      for (const line of envLines) {
        const result = redactSecrets(line);
        expect(result).toContain(REDACTION_MARKERS.SECRET);
      }
    });
  });

  describe('Inline Secrets in URLs', () => {
    it('redacts basic auth credentials inside database and HTTP URLs', () => {
      const urls = [
        'postgres://admin:SuperSecretDbPass99@database.internal.prod:5432/main',
        'mongodb://root:TopSecretMongodbPassword@cluster0.mongodb.net/app',
        'https://user123:PersonalPass!@api.service.internal/v1',
      ];

      for (const url of urls) {
        const result = redactSecrets(url);
        expect(result).not.toContain('SuperSecretDbPass99');
        expect(result).not.toContain('TopSecretMongodbPassword');
        expect(result).not.toContain('PersonalPass!');
        expect(result).toContain(REDACTION_MARKERS.PASSWORD);
      }
    });
  });

  describe('Non-Secret Preservation & Edge Cases', () => {
    it('preserves ordinary code and identifiers intact', () => {
      const ordinaryCode = `
function calculateSecurityScore(metrics) {
  const secretOffset = 42;
  const passwordValidator = new RegExp('^[a-z]+$');
  return metrics.total + secretOffset;
}
`;
      const result = redactSecrets(ordinaryCode);
      expect(result).toBe(ordinaryCode);
    });

    it('handles null, undefined, and empty string safely', () => {
      expect(redactSecrets(null)).toBe('');
      expect(redactSecrets(undefined)).toBe('');
      expect(redactSecrets('')).toBe('');
    });
  });

  describe('Audit & Detection Utilities', () => {
    it('sanitizeWithAudit reports matches accurately', () => {
      const sample = `
api_key = "secret_key_1234567"
const aws = "AKIAIOSFODNN7EXAMPLE";
`;
      const audit = sanitizeWithAudit(sample);
      expect(audit.hasRedactions).toBe(true);
      expect(audit.redactedCount).toBeGreaterThanOrEqual(2);
    });

    it('containsPotentialSecrets detects known leaks', () => {
      expect(containsPotentialSecrets('const x = "AKIAIOSFODNN7EXAMPLE";')).toBe(true);
      expect(containsPotentialSecrets('const x = 123;')).toBe(false);
    });
  });
});
