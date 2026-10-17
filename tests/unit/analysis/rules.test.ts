/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/analysis/rules.test.ts
 * Owner: Team Lead
 * Purpose: Unit tests for deterministic security rules (SEC-001 - SEC-004) and RuleRunner
 */

import { describe, it, expect } from 'vitest';
import {
  hardcodedSecretsRule,
  sqlInjectionRule,
  commandInjectionRule,
  emptyCatchBlockRule,
  redactSecretSnippet,
  RuleRunner,
  RuleFileContext,
} from '../../../src/analysis/rules/index.js';

function createContext(content: string, relativePath = 'src/test.ts'): RuleFileContext {
  return {
    filePath: `/repo/${relativePath}`,
    relativePath,
    content,
    lines: content.split('\n'),
  };
}

describe('Deterministic Security Rules Suite', () => {
  describe('SEC-001: Hardcoded Secrets & Token Exposure', () => {
    it('detects AWS Access Key ID and redacts secret in evidence snippet', async () => {
      const code = 'const awsKey = "AKIAIOSFODNN7EXAMPLE";\n';
      const findings = await hardcodedSecretsRule.evaluate(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]!.severity).toBe('CRITICAL');
      expect(findings[0]!.title).toContain('AWS Access Key ID');
      expect(findings[0]!.lineRange).toEqual({ start: 1, end: 1 });
      expect(findings[0]!.evidence).toContain('AKIA****************');
      expect(findings[0]!.evidence).not.toContain('AKIAIOSFODNN7EXAMPLE');
    });

    it('detects GitHub Personal Access Token and redacts secret in evidence', async () => {
      const code = 'const token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";\n';
      const findings = await hardcodedSecretsRule.evaluate(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]!.severity).toBe('CRITICAL');
      expect(findings[0]!.title).toContain('GitHub Personal Access Token');
      expect(findings[0]!.evidence).toContain('ghp_********************************');
      expect(findings[0]!.evidence).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
    });

    it('detects high-entropy generic API secret assignment and redacts value', async () => {
      const code = 'const apiKey = "sec_live_99887766554433221100";\n';
      const findings = await hardcodedSecretsRule.evaluate(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]!.severity).toBe('CRITICAL');
      expect(findings[0]!.title).toContain('High-Entropy API Secret Assignment');
      expect(findings[0]!.evidence).toContain('[REDACTED_SECRET]');
    });

    it('does not flag benign comments or placeholders', async () => {
      const code = [
        '// Note: Provide your api_key in production configuration',
        'const key = process.env.AWS_ACCESS_KEY_ID;',
        'const mockSecret = "example_secret_placeholder_value";',
        'const dummyKey = "dummy_key_for_testing_12345";',
      ].join('\n');

      const findings = await hardcodedSecretsRule.evaluate(createContext(code));
      expect(findings.length).toBe(0);
    });
  });

  describe('SEC-002: SQL Injection via Untrusted Query Construction', () => {
    it('detects template literal interpolation inside db.query call', async () => {
      const code = 'const result = await db.query(`SELECT * FROM users WHERE id = ${userId}`);\n';
      const findings = await sqlInjectionRule.evaluate(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]!.severity).toBe('HIGH');
      expect(findings[0]!.title).toContain('SQL Injection');
      expect(findings[0]!.lineRange).toEqual({ start: 1, end: 1 });
      expect(findings[0]!.evidence).toContain('SELECT * FROM users WHERE id');
    });

    it('detects dynamic string concatenation passed directly to query call', async () => {
      const code = 'const res = await connection.query("SELECT * FROM accounts WHERE name = " + userName);\n';
      const findings = await sqlInjectionRule.evaluate(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]!.severity).toBe('HIGH');
      expect(findings[0]!.title).toContain('SQL Injection');
    });

    it('detects dynamic query construction assigned to variable', async () => {
      const code1 = 'const query = "SELECT * FROM users WHERE role = " + role;\n';
      const findings1 = await sqlInjectionRule.evaluate(createContext(code1));
      expect(findings1.length).toBe(1);

      const code2 = 'const sql = `SELECT * FROM orders WHERE status = \'${status}\'`;\n';
      const findings2 = await sqlInjectionRule.evaluate(createContext(code2));
      expect(findings2.length).toBe(1);
    });

    it('does not flag parameterized queries or benign comments', async () => {
      const code = [
        '// Use SELECT statements carefully to avoid performance issues',
        'const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);',
        'const staticQuery = "SELECT id, name FROM products";',
      ].join('\n');

      const findings = await sqlInjectionRule.evaluate(createContext(code));
      expect(findings.length).toBe(0);
    });
  });

  describe('SEC-003: Command Injection & Dynamic Shell Execution', () => {
    it('detects template literal interpolation in exec call', async () => {
      const code = 'exec(`rm -rf ${userSuppliedPath}`);\n';
      const findings = await commandInjectionRule.evaluate(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]!.severity).toBe('CRITICAL');
      expect(findings[0]!.title).toContain('Command Injection');
      expect(findings[0]!.lineRange).toEqual({ start: 1, end: 1 });
    });

    it('detects dynamic string concatenation in execSync', async () => {
      const code = 'execSync("git checkout " + branchName);\n';
      const findings = await commandInjectionRule.evaluate(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]!.severity).toBe('CRITICAL');
    });

    it('detects dynamic eval usage', async () => {
      const code = 'eval(dynamicCodeString);\n';
      const findings = await commandInjectionRule.evaluate(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]!.severity).toBe('CRITICAL');
      expect(findings[0]!.title).toContain('eval()');
    });

    it('does not flag safe process execution or benign comments', async () => {
      const code = [
        '// Never run exec with unsanitized parameters',
        'execFile("ls", ["-la"], callback);',
        'spawn("git", ["status"], { stdio: "inherit" });',
      ].join('\n');

      const findings = await commandInjectionRule.evaluate(createContext(code));
      expect(findings.length).toBe(0);
    });
  });

  describe('SEC-004: Empty Catch Block (Suppressed Exceptions)', () => {
    it('detects single-line empty catch block with parameter', async () => {
      const code = 'try { doSomething(); } catch (err) {}\n';
      const findings = await emptyCatchBlockRule.evaluate(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]!.severity).toBe('MEDIUM');
      expect(findings[0]!.title).toContain('Empty Catch Block');
      expect(findings[0]!.lineRange).toEqual({ start: 1, end: 1 });
    });

    it('detects single-line empty catch block without parameter', async () => {
      const code = 'try { doSomething(); } catch {}\n';
      const findings = await emptyCatchBlockRule.evaluate(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]!.severity).toBe('MEDIUM');
    });

    it('does not flag catch blocks that log or handle errors', async () => {
      const code = [
        'try {',
        '  doSomething();',
        '} catch (err) {',
        '  console.error("Failed to execute", err);',
        '}',
      ].join('\n');

      const findings = await emptyCatchBlockRule.evaluate(createContext(code));
      expect(findings.length).toBe(0);
    });
  });

  describe('RuleRunner & Findings Normalization', () => {
    it('evaluates multiple files, deduplicates findings, and sorts by severity descending', async () => {
      const runner = new RuleRunner();
      const files = [
        {
          filePath: '/repo/src/medium.ts',
          relativePath: 'src/medium.ts',
          content: 'try { run(); } catch (e) {}\n',
        },
        {
          filePath: '/repo/src/critical.ts',
          relativePath: 'src/critical.ts',
          content: 'const key = "AKIAIOSFODNN7EXAMPLE";\n',
        },
        {
          filePath: '/repo/src/high.ts',
          relativePath: 'src/high.ts',
          content: 'const query = "SELECT * FROM users WHERE id = " + id;\n',
        },
      ];

      const findings = await runner.evaluateFiles(files);

      expect(findings.length).toBe(3);
      // Deterministic severity sort: CRITICAL first, then HIGH, then MEDIUM
      expect(findings[0]!.severity).toBe('CRITICAL');
      expect(findings[1]!.severity).toBe('HIGH');
      expect(findings[2]!.severity).toBe('MEDIUM');
    });

    it('redacts secrets via redactSecretSnippet correctly', () => {
      const raw = 'const secret = "AKIA1234567890EXAMPLE"; token = "ghp_123456789012345678901234567890123456";';
      const redacted = redactSecretSnippet(raw);

      expect(redacted).toContain('AKIA****************');
      expect(redacted).toContain('ghp_********************************');
      expect(redacted).not.toContain('AKIA1234567890EXAMPLE');
      expect(redacted).not.toContain('ghp_123456789012345678901234567890123456');
    });
  });
});
