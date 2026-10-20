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
  isCommentOnly,
  RuleRunner,
  RuleFileContext,
} from '../../../src/analysis/rules/index.js';
import { detectFileLanguage } from '../../../src/repository/index.js';

function createContext(
  content: string,
  relativePath = 'src/test.ts',
  language?: string
): RuleFileContext {
  return {
    filePath: `/repo/${relativePath}`,
    relativePath,
    content,
    lines: content.split('\n'),
    language,
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

    it('does not flag commented-out secrets in Python (# comment syntax)', async () => {
      const pythonCode = [
        '# Configuration file for cloud backend',
        '# api_key = "sec_live_99887766554433221100"',
        '# passwd = "super_secret_unencrypted_token_12345"',
        'api_key = os.environ.get("API_KEY")',
      ].join('\n');

      const findings = await hardcodedSecretsRule.evaluate(
        createContext(pythonCode, 'src/backend.py')
      );
      expect(findings.length).toBe(0);
    });

    it('does not flag commented-out secrets in Ruby (# comment syntax)', async () => {
      const rubyCode = [
        '# Production secrets configuration',
        '# jwt_secret = "sec_live_99887766554433221100"',
        'jwt_secret = ENV["JWT_SECRET"]',
      ].join('\n');

      const findings = await hardcodedSecretsRule.evaluate(
        createContext(rubyCode, 'config/initializers/secrets.rb')
      );
      expect(findings.length).toBe(0);
    });

    it('flags private class fields with # in JavaScript and TypeScript (not a comment)', async () => {
      const tsCode = [
        'export class SecureClient {',
        '  #api_key = "sec_live_99887766554433221100";',
        '}',
      ].join('\n');

      const findings = await hardcodedSecretsRule.evaluate(
        createContext(tsCode, 'src/client.ts')
      );
      expect(findings.length).toBe(1);
      expect(findings[0]!.title).toContain('High-Entropy API Secret Assignment');
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

    it('does not flag commented-out SQL query in SQL files (-- comment)', async () => {
      const sqlCode = [
        '-- Deprecated dynamic query:',
        '-- const query = "SELECT * FROM users WHERE id = " + userId;',
        'SELECT id, name FROM users WHERE id = $1;',
      ].join('\n');

      const findings = await sqlInjectionRule.evaluate(
        createContext(sqlCode, 'db/migrations/001.sql')
      );
      expect(findings.length).toBe(0);
    });

    it('does not flag commented-out SQL query in Python files (# comment)', async () => {
      const pyCode = [
        '# Example vulnerable pattern to avoid:',
        '# const query = "SELECT * FROM users WHERE id = " + userId;',
        'cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))',
      ].join('\n');

      const findings = await sqlInjectionRule.evaluate(
        createContext(pyCode, 'app/repository.py')
      );
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

    it('does not flag commented-out exec calls in Python (# comments)', async () => {
      const pyCode = [
        '# exec(`rm -rf ${userPath}`)',
        'subprocess.run(["ls", "-la"], check=True)',
      ].join('\n');

      const findings = await commandInjectionRule.evaluate(
        createContext(pyCode, 'scripts/cleanup.py')
      );
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

    it('does not flag commented-out catch blocks', async () => {
      const code = [
        '// try { doSomething(); } catch (err) {}',
        '/* try { run(); } catch {} */',
        '# try { run(); } catch (e) {}',
      ].join('\n');

      const findings = await emptyCatchBlockRule.evaluate(
        createContext(code, 'src/example.py')
      );
      expect(findings.length).toBe(0);
    });
  });

  describe('Language Detection & Comment Safety', () => {
    it('detects single file languages from extension case-insensitively', () => {
      expect(detectFileLanguage('src/app.ts')).toBe('TypeScript');
      expect(detectFileLanguage('SRC/APP.TS')).toBe('TypeScript');
      expect(detectFileLanguage('src/app.tsx')).toBe('TypeScript');
      expect(detectFileLanguage('src/server.js')).toBe('JavaScript');
      expect(detectFileLanguage('scripts/build.mjs')).toBe('JavaScript');
      expect(detectFileLanguage('main.py')).toBe('Python');
      expect(detectFileLanguage('MAIN.PY')).toBe('Python');
      expect(detectFileLanguage('App.java')).toBe('Java');
      expect(detectFileLanguage('server.go')).toBe('Go');
      expect(detectFileLanguage('main.rs')).toBe('Rust');
      expect(detectFileLanguage('index.php')).toBe('PHP');
      expect(detectFileLanguage('app.rb')).toBe('Ruby');
      expect(detectFileLanguage('Program.cs')).toBe('C#');
      expect(detectFileLanguage('main.c')).toBe('C');
      expect(detectFileLanguage('main.cpp')).toBe('C++');
      expect(detectFileLanguage('schema.sql')).toBe('SQL');
      expect(detectFileLanguage('SCHEMA.SQL')).toBe('SQL');
    });

    it('returns undefined for unknown extensions or missing extensions', () => {
      expect(detectFileLanguage('README.md')).toBeUndefined();
      expect(detectFileLanguage('Dockerfile')).toBeUndefined();
      expect(detectFileLanguage('file_without_extension')).toBeUndefined();
      expect(detectFileLanguage('')).toBeUndefined();
    });

    it('isCommentOnly correctly handles language-specific comment syntax', () => {
      // C-style comments (JS, TS, C, Java, etc.)
      expect(isCommentOnly('// single line comment', 'JavaScript')).toBe(true);
      expect(isCommentOnly('/* block comment start', 'TypeScript')).toBe(true);
      expect(isCommentOnly('* continuation of block comment', 'Java')).toBe(true);

      // SQL comments
      expect(isCommentOnly('-- SQL line comment', 'SQL')).toBe(true);
      // Non-SQL languages must NOT treat -- as a comment (--count; is pre-decrement)
      expect(isCommentOnly('--count;', 'JavaScript')).toBe(false);
      expect(isCommentOnly('--counter;', 'TypeScript')).toBe(false);
      expect(isCommentOnly('--idx;', 'C')).toBe(false);
      expect(isCommentOnly('--idx;', 'Java')).toBe(false);

      // C/C++ pointer dereferences must NOT be treated as comments
      expect(isCommentOnly('*token_ptr = "ghp_12345";', 'C')).toBe(false);
      expect(isCommentOnly('*dest = *src;', 'C++')).toBe(false);
      expect(isCommentOnly('*ptr = val;', 'Go')).toBe(false);

      // Python / Ruby comments
      expect(isCommentOnly('# Python comment', 'Python')).toBe(true);
      expect(isCommentOnly('# Ruby comment', 'Ruby')).toBe(true);
      expect(isCommentOnly('#!/usr/bin/env python3', 'Python')).toBe(true);

      // JS / TS private class fields are NOT comments
      expect(isCommentOnly('  #privateField = "secret";', 'TypeScript')).toBe(false);
      expect(isCommentOnly('#apiKey = 123;', 'JavaScript')).toBe(false);

      // JS / TS shebang line IS a comment
      expect(isCommentOnly('#!/usr/bin/env node', 'JavaScript')).toBe(true);
      expect(isCommentOnly('#!/usr/bin/env node', 'TypeScript')).toBe(true);

      // Inline comments on code lines must not be identified as comment-only
      expect(isCommentOnly('const x = 1; // inline comment', 'JavaScript')).toBe(false);
      expect(isCommentOnly('x = 1 # inline comment', 'Python')).toBe(false);

      // Empty or whitespace lines
      expect(isCommentOnly('', 'Python')).toBe(false);
      expect(isCommentOnly('   ', 'JavaScript')).toBe(false);
    });

    it('does not flag commented-out AWS and GitHub tokens in Python and SQL (false-positive elimination)', async () => {
      const pythonCommentedTokens = [
        '# AWS Credentials for backup:',
        '# AKIAIOSFODNN7EXAMPLE',
        '# GitHub Personal Access Token:',
        '# ghp_0123456789ABCDEFGHIJKLMNOPQRST',
      ].join('\n');

      const pyFindings = await hardcodedSecretsRule.evaluate(
        createContext(pythonCommentedTokens, 'scripts/deploy.py')
      );
      expect(pyFindings.length).toBe(0);

      const sqlCommentedTokens = [
        '-- Database Migration Script',
        '-- Master AWS Key: AKIAIOSFODNN7EXAMPLE',
        '-- Deployment Token: ghp_0123456789ABCDEFGHIJKLMNOPQRST',
      ].join('\n');

      const sqlFindings = await hardcodedSecretsRule.evaluate(
        createContext(sqlCommentedTokens, 'migrations/001_init.sql')
      );
      expect(sqlFindings.length).toBe(0);
    });

    it('detects active AWS and GitHub tokens in Python, SQL, and JS/TS (false-negative prevention)', async () => {
      const pythonActiveCode = [
        'import os',
        'aws_key = "AKIAIOSFODNN7EXAMPLE"',
        'github_token = "ghp_0123456789ABCDEFGHIJKLMNOPQRST"',
      ].join('\n');

      const pyFindings = await hardcodedSecretsRule.evaluate(
        createContext(pythonActiveCode, 'src/cloud.py')
      );
      expect(pyFindings.length).toBe(2);

      const sqlActiveCode = [
        "INSERT INTO credentials (service, token) VALUES ('aws', 'AKIAIOSFODNN7EXAMPLE');",
      ].join('\n');

      const sqlFindings = await hardcodedSecretsRule.evaluate(
        createContext(sqlActiveCode, 'seeds/data.sql')
      );
      expect(sqlFindings.length).toBe(1);
    });

    it('does not skip C/C++ pointer dereference statements containing secrets or tokens', async () => {
      const cCode = [
        '#include <stdio.h>',
        'void init_auth(char **token_ptr, char **key_ptr) {',
        '  *token_ptr = "ghp_0123456789ABCDEFGHIJKLMNOPQRST";',
        '  *key_ptr = "AKIAIOSFODNN7EXAMPLE";',
        '}',
      ].join('\n');

      const cFindings = await hardcodedSecretsRule.evaluate(
        createContext(cCode, 'src/auth.c')
      );
      expect(cFindings.length).toBe(2);
      expect(cFindings[0]!.title).toContain('GitHub Personal Access Token');
      expect(cFindings[1]!.title).toContain('AWS Access Key ID');
    });

    it('safely handles multiline /* ... */ comments and active code on boundary lines', async () => {
      // 1. Pure multiline comment with embedded secret (must produce 0 findings)
      const multilineComment = [
        '/*',
        '  Old deprecated credentials for testing only:',
        '  AKIAIOSFODNN7EXAMPLE',
        '  ghp_0123456789ABCDEFGHIJKLMNOPQRST',
        '*/',
      ].join('\n');

      const findings1 = await hardcodedSecretsRule.evaluate(
        createContext(multilineComment, 'src/config.ts')
      );
      expect(findings1.length).toBe(0);

      // 2. Active code after closing */ on the same line (must detect secret)
      const codeAfterClose = [
        '/* end of config header */ const apiKey = "AKIAIOSFODNN7EXAMPLE";',
      ].join('\n');

      const findings2 = await hardcodedSecretsRule.evaluate(
        createContext(codeAfterClose, 'src/config.ts')
      );
      expect(findings2.length).toBe(1);

      // 3. Active code before opening /* on the same line (must detect secret)
      const codeBeforeOpen = [
        'const awsKey = "AKIAIOSFODNN7EXAMPLE"; /* inline comment start',
        'continued comment block',
        '*/',
      ].join('\n');

      const findings3 = await hardcodedSecretsRule.evaluate(
        createContext(codeBeforeOpen, 'src/config.ts')
      );
      expect(findings3.length).toBe(1);
    });

    it('safely handles Python triple-quoted docstrings and multiline expressions', async () => {
      // Standalone multiline docstring containing tokens (must produce 0 findings)
      const pythonDocstring = [
        '"""',
        'Module documentation',
        'Example key: AKIAIOSFODNN7EXAMPLE',
        'Token: ghp_0123456789ABCDEFGHIJKLMNOPQRST',
        '"""',
        'def run():',
        '    pass',
      ].join('\n');

      const docFindings = await hardcodedSecretsRule.evaluate(
        createContext(pythonDocstring, 'src/module.py')
      );
      expect(docFindings.length).toBe(0);

      // Single-line standalone triple-quoted docstring
      const singleLineDoc = '"""Example key: AKIAIOSFODNN7EXAMPLE"""\n';
      const singleDocFindings = await hardcodedSecretsRule.evaluate(
        createContext(singleLineDoc, 'src/module.py')
      );
      expect(singleDocFindings.length).toBe(0);

      // Active dynamic query assignment using triple quotes (must produce SEC-002 finding)
      const dynamicQueryAssignment = [
        'const query = `SELECT * FROM users WHERE id = ${userId}`;',
      ].join('\n');
      const queryFindings = await sqlInjectionRule.evaluate(
        createContext(dynamicQueryAssignment, 'src/db.ts')
      );
      expect(queryFindings.length).toBe(1);
    });

    it('detects secrets on lines with active code followed by inline comments', async () => {
      const tsInline = 'const key = "AKIAIOSFODNN7EXAMPLE"; // AWS deployment key\n';
      const tsFindings = await hardcodedSecretsRule.evaluate(
        createContext(tsInline, 'src/aws.ts')
      );
      expect(tsFindings.length).toBe(1);

      const pyInline = 'token = "ghp_0123456789ABCDEFGHIJKLMNOPQRST" # Production GitHub token\n';
      const pyFindings = await hardcodedSecretsRule.evaluate(
        createContext(pyInline, 'scripts/ci.py')
      );
      expect(pyFindings.length).toBe(1);
    });

    it('ignores SQL comments with -- in SEC-002', async () => {
      const sqlComment = [
        '-- SELECT * FROM users WHERE id = " + userId',
        '-- DROP TABLE accounts;',
      ].join('\n');

      const sqlFindings = await sqlInjectionRule.evaluate(
        createContext(sqlComment, 'db/query.sql')
      );
      expect(sqlFindings.length).toBe(0);
    });

    it('RuleRunner automatically resolves context.language when scanning files', async () => {
      const runner = new RuleRunner();
      const files = [
        {
          filePath: '/repo/backend/service.py',
          relativePath: 'backend/service.py',
          content: [
            '# Commented AWS key must be skipped:',
            '# AKIAIOSFODNN7EXAMPLE',
            '# api_key = "sec_live_99887766554433221100"',
          ].join('\n'),
        },
        {
          filePath: '/repo/src/client.ts',
          relativePath: 'src/client.ts',
          content: 'export class Client { #api_key = "sec_live_99887766554433221100"; }\n',
        },
        {
          filePath: '/repo/src/native.c',
          relativePath: 'src/native.c',
          content: 'void init(char **p) { *p = "AKIAIOSFODNN7EXAMPLE"; }\n',
        },
        {
          filePath: '/repo/db/schema.sql',
          relativePath: 'db/schema.sql',
          content: '-- AKIAIOSFODNN7EXAMPLE\n-- ghp_0123456789ABCDEFGHIJKLMNOPQRST\n',
        },
      ];

      const findings = await runner.evaluateFiles(files);

      // Python commented secret and SQL commented secret should produce NO findings
      const pyFindings = findings.filter((f) => f.path.endsWith('.py'));
      expect(pyFindings.length).toBe(0);

      const sqlFindings = findings.filter((f) => f.path.endsWith('.sql'));
      expect(sqlFindings.length).toBe(0);

      // TypeScript private field secret MUST produce finding
      const tsFindings = findings.filter((f) => f.path.endsWith('.ts'));
      expect(tsFindings.length).toBe(1);

      // C pointer dereference MUST produce finding
      const cFindings = findings.filter((f) => f.path.endsWith('.c'));
      expect(cFindings.length).toBe(1);
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
