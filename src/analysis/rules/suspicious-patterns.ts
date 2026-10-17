/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/analysis/rules/suspicious-patterns.ts
 * Owner: Team Lead
 * Purpose: Rule engine: deterministic pattern detection rules
 */

import { SecurityRule, RuleFileContext } from './rule.contract.js';
import { StorageFinding } from '../../storage/run-store.js';

/**
 * Redacts recognized secrets from evidence snippets to prevent credential exposure in reports and storage.
 */
export function redactSecretSnippet(snippet: string): string {
  return snippet
    .replace(/(AKIA)[0-9A-Z]{16,28}/g, '$1****************')
    .replace(/(gh[pousr]_)[A-Za-z0-9_]{30,}/g, '$1********************************')
    .replace(/((?:api_?key|jwt_?secret|auth_?token|client_?secret|password|passwd|secret)\s*[:=]\s*["'])[A-Za-z0-9_\-]{8,}(["'])/gi, '$1[REDACTED_SECRET]$2');
}

/**
 * Extracts a formatted multi-line code snippet around a specific line number.
 */
function extractSnippet(lines: string[], lineIndex: number, contextLines = 2): string {
  const start = Math.max(0, lineIndex - contextLines);
  const end = Math.min(lines.length - 1, lineIndex + contextLines);
  const snippetLines: string[] = [];
  for (let i = start; i <= end; i++) {
    const prefix = i === lineIndex ? '>' : ' ';
    snippetLines.push(`${prefix} ${i + 1} | ${lines[i]}`);
  }
  return redactSecretSnippet(snippetLines.join('\n'));
}

/**
 * Helper to determine whether a line is a non-code comment line.
 */
function isCommentOnly(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

// 1. SEC-001: Hardcoded Secrets & Token Exposure
export const hardcodedSecretsRule: SecurityRule = {
  id: 'SEC-001',
  name: 'Hardcoded Secret / Token Exposure',
  category: 'Security / Hardcoded Secrets',
  severity: 'CRITICAL',
  cwe: 'CWE-798',
  description: 'Detected high-entropy access key, private token, or hardcoded credential in source code.',
  evaluate(context: RuleFileContext): StorageFinding[] {
    const findings: StorageFinding[] = [];
    const ignoreKeywords = ['example', 'dummy', 'placeholder', 'fake', 'mock', 'todo', 'your_key', 'process.env'];

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i]!;

      // AWS Access Key ID
      if (/(?:^|[^A-Z0-9])(AKIA[0-9A-Z]{16,28})(?:[^A-Z0-9]|$)/.test(line)) {
        findings.push({
          id: `SEC-001-${context.relativePath.replace(/[\\/]/g, '-')}-L${i + 1}`,
          category: this.category,
          severity: this.severity,
          title: 'Hardcoded AWS Access Key ID',
          path: context.relativePath,
          lineRange: { start: i + 1, end: i + 1 },
          explanation: 'Recognizable AWS Access Key ID committed to source. Committed credentials allow persistent unauthorized cloud resource access. Move credentials to environment variables.',
          evidence: redactSecretSnippet(extractSnippet(context.lines, i)),
          confidence: 0.98,
          status: 'UNRESOLVED',
        });
      }

      // GitHub Personal Access Token
      if (/(?:^|[^a-zA-Z0-9])((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,})/.test(line)) {
        findings.push({
          id: `SEC-001-${context.relativePath.replace(/[\\/]/g, '-')}-L${i + 1}-gh`,
          category: this.category,
          severity: this.severity,
          title: 'Hardcoded GitHub Personal Access Token',
          path: context.relativePath,
          lineRange: { start: i + 1, end: i + 1 },
          explanation: 'Recognizable GitHub Personal Access Token found in source. Stored tokens can grant unauthorized repository read/write access. Revoke and rotate this token immediately.',
          evidence: redactSecretSnippet(extractSnippet(context.lines, i)),
          confidence: 0.98,
          status: 'UNRESOLVED',
        });
      }

      // Generic High-Entropy API Secret Assignment
      if (!isCommentOnly(line)) {
        const secretAssignment = /(?:api_?key|jwt_?secret|auth_?token|client_?secret|password|passwd|secret)\s*[:=]\s*["']([a-zA-Z0-9_\-]{20,})["']/i.exec(line);
        if (secretAssignment && secretAssignment[1]) {
          const val = secretAssignment[1].toLowerCase();
          const isIgnored = ignoreKeywords.some((kw) => val.includes(kw));
          if (!isIgnored) {
            findings.push({
              id: `SEC-001-${context.relativePath.replace(/[\\/]/g, '-')}-L${i + 1}-secret`,
              category: this.category,
              severity: this.severity,
              title: 'Hardcoded High-Entropy API Secret Assignment',
              path: context.relativePath,
              lineRange: { start: i + 1, end: i + 1 },
              explanation: 'High-entropy secret or password variable detected in source code. Secret values must be read from environment variables or a secrets manager.',
              evidence: redactSecretSnippet(extractSnippet(context.lines, i)),
              confidence: 0.90,
              status: 'UNRESOLVED',
            });
          }
        }
      }
    }

    return findings;
  },
};

// 2. SEC-002: SQL Query Construction with Untrusted Interpolation
export const sqlInjectionRule: SecurityRule = {
  id: 'SEC-002',
  name: 'SQL Injection via Untrusted Query Construction',
  category: 'Security / SQL Injection',
  severity: 'HIGH',
  cwe: 'CWE-89',
  description: 'Unsanitized string interpolation or concatenation directly inside database queries.',
  evaluate(context: RuleFileContext): StorageFinding[] {
    const findings: StorageFinding[] = [];

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i]!;

      // Skip lines that are purely comments/documentation
      if (isCommentOnly(line)) {
        continue;
      }

      // Template literal interpolation inside query call
      const templateLiteralQuery = /(?:(?:db|client|pool|connection|knex|prisma|sequelize)\s*\.\s*(?:query|raw|execute)|(?:query|execute|rawQuery)\s*\()\s*`[^`]*(?:SELECT|INSERT|UPDATE|DELETE|DROP|FROM|WHERE)\b[^`]*\$\{[^}]+\}/i.test(line);

      // String concatenation directly passed to db query
      const concatenatedQueryCall = /(?:(?:db|client|pool|connection)\s*\.\s*(?:query|execute)|(?:query|execute)\s*\()\s*["']\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^"']*["']\s*\+\s*[a-zA-Z0-9_]/i.test(line);

      // Dynamic SQL statement variable assignment: const query = "SELECT ... " + var
      const concatenatedQueryAssign = /(?:const|let|var)\s+[a-zA-Z0-9_]*(?:query|sql|cmd|stmt)\s*=\s*["']\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^"']*["']\s*\+\s*[a-zA-Z0-9_]/i.test(line);

      // Dynamic SQL template literal assignment: const query = `SELECT ... ${var}`
      const templateLiteralQueryAssign = /(?:const|let|var)\s+[a-zA-Z0-9_]*(?:query|sql|cmd|stmt)\s*=\s*`[^`]*(?:SELECT|INSERT|UPDATE|DELETE|DROP|FROM|WHERE)\b[^`]*\$\{[^}]+\}/i.test(line);

      if (templateLiteralQuery || concatenatedQueryCall || concatenatedQueryAssign || templateLiteralQueryAssign) {
        findings.push({
          id: `SEC-002-${context.relativePath.replace(/[\\/]/g, '-')}-L${i + 1}`,
          category: this.category,
          severity: this.severity,
          title: 'Potential SQL Injection (Dynamic Query Concatenation)',
          path: context.relativePath,
          lineRange: { start: i + 1, end: i + 1 },
          explanation: 'Raw SQL query constructed via dynamic string concatenation or template literal. This pattern can allow attackers to manipulate query logic or extract data. Use parameterized queries ($1, ? or prepared statements).',
          evidence: extractSnippet(context.lines, i),
          confidence: 0.92,
          status: 'UNRESOLVED',
        });
      }
    }

    return findings;
  },
};

// 3. SEC-003: Suspicious Dynamic Shell Execution
export const commandInjectionRule: SecurityRule = {
  id: 'SEC-003',
  name: 'Command Injection / Unsafe Dynamic Execution',
  category: 'Security / Command Injection',
  severity: 'CRITICAL',
  cwe: 'CWE-78',
  description: 'Unsanitized user-controlled variables passed to shell execution functions.',
  evaluate(context: RuleFileContext): StorageFinding[] {
    const findings: StorageFinding[] = [];

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i]!;

      // Skip lines that are purely comments/documentation
      if (isCommentOnly(line)) {
        continue;
      }

      // exec or execSync with dynamic template interpolation
      const execInterpolated = /\b(?:exec|execSync)\s*\(\s*`[^`]*\$\{[^}]+\}[^`]*`/.test(line);
      // exec or execSync with dynamic string concatenation
      const execConcat = /\b(?:exec|execSync)\s*\(\s*["'][^"']*["']\s*\+\s*[a-zA-Z0-9_]/.test(line);
      // eval with non-literal parameter
      const unsafeEval = /\beval\s*\(\s*(?!["'][a-zA-Z0-9_ =;]*["']\))\s*[a-zA-Z0-9_$(`]/.test(line);

      if (execInterpolated || execConcat || unsafeEval) {
        findings.push({
          id: `SEC-003-${context.relativePath.replace(/[\\/]/g, '-')}-L${i + 1}`,
          category: this.category,
          severity: this.severity,
          title: unsafeEval ? 'Arbitrary Code Execution via eval()' : 'Command Injection via Dynamic Shell Execution',
          path: context.relativePath,
          lineRange: { start: i + 1, end: i + 1 },
          explanation: unsafeEval
            ? 'Use of eval() with dynamic input executes arbitrary JavaScript with full process privileges. Avoid eval().'
            : 'Shell command constructed with dynamic variables passed to exec(). An attacker can append shell operators (; | &&) to execute arbitrary commands. Use execFile() or spawn() with explicit argument arrays.',
          evidence: extractSnippet(context.lines, i),
          confidence: 0.95,
          status: 'UNRESOLVED',
        });
      }
    }

    return findings;
  },
};

// 4. SEC-004: Empty Catch Block (Suppressed Exceptions)
export const emptyCatchBlockRule: SecurityRule = {
  id: 'SEC-004',
  name: 'Empty Catch Block (Suppressed Exceptions)',
  category: 'Reliability / Error Handling',
  severity: 'MEDIUM',
  cwe: 'CWE-703',
  description: 'Empty catch block silently swallows exceptions, hiding runtime failures.',
  evaluate(context: RuleFileContext): StorageFinding[] {
    const findings: StorageFinding[] = [];

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i]!;

      // Empty single-line catch block: catch {} or catch (err) {}
      if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(line)) {
        findings.push({
          id: `SEC-004-${context.relativePath.replace(/[\\/]/g, '-')}-L${i + 1}`,
          category: this.category,
          severity: this.severity,
          title: 'Empty Catch Block (Suppressed Exceptions)',
          path: context.relativePath,
          lineRange: { start: i + 1, end: i + 1 },
          explanation: 'An empty catch block silently swallows runtime errors, concealing underlying bugs, failed I/O, or broken security assumptions. Log the exception or handle it explicitly.',
          evidence: extractSnippet(context.lines, i),
          confidence: 0.88,
          status: 'UNRESOLVED',
        });
      }
    }

    return findings;
  },
};

/**
 * Standard rule suite bundle.
 */
export const STANDARD_RULES: SecurityRule[] = [
  hardcodedSecretsRule,
  sqlInjectionRule,
  commandInjectionRule,
  emptyCatchBlockRule,
];
