/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/analysis/rules/suspicious-patterns.ts
 * Owner: Team Lead
 * Purpose: Rule engine: deterministic pattern detection rules
 */

import { SecurityRule, RuleFileContext } from './rule.contract.js';
import { StorageFinding } from '../../storage/run-store.js';
import { detectFileLanguage } from '../../repository/discovery.js';

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
 * Lexical state machine to track multiline and single-line comment context.
 *
 * NOTE: This is a fast, maintainable lexical tracker designed for line-by-line scanning,
 * not a full AST language parser. It tracks C-style multiline block comments (/* ... *\/)
 * and Python triple-quoted docstrings (""" / ''').
 * Limitations: Complex inline regex literals containing /*, string literals spanning
 * multiple lines, or macro expansions in C are not tracked by AST. Where language syntax is
 * ambiguous, RepoGuard chooses to evaluate the line rather than skip it (preferring to avoid false negatives).
 */
export class CommentTracker {
  private inBlockComment = false;
  private inTripleQuote: '"""' | "'''" | null = null;
  private readonly language?: string;

  constructor(language?: string) {
    this.language = language;
  }

  /**
   * Evaluates whether a line contains solely comments/whitespace or active code.
   * Updates internal state for multiline comments.
   * Returns true if the line is purely comment/docstring, false if active code is present.
   */
  public isComment(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed === '') {
      return false;
    }

    // Shebang lines (e.g. #!/usr/bin/env node) are always non-code comments
    if (trimmed.startsWith('#!')) {
      return true;
    }

    // Single-line C-style comment (//) - recognized universally as non-code
    if (trimmed.startsWith('//')) {
      return true;
    }

    // 1. C-Style Block Comment Tracking (/* ... */)
    // Universal across C, C++, Java, JS, TS, Go, Rust, C#, PHP, SQL, and polyglot files
    if (this.inBlockComment) {
      const closeIdx = trimmed.indexOf('*/');
      if (closeIdx !== -1) {
        this.inBlockComment = false;
        // If active code follows the closing delimiter (e.g. '*/ doSomething();')
        const after = trimmed.slice(closeIdx + 2).trim();
        return after === '' || after.startsWith('//');
      }
      return true;
    }

    if (trimmed.startsWith('/*')) {
      const closeIdx = trimmed.indexOf('*/', 2);
      if (closeIdx !== -1) {
        // Block comment opens and closes on the same line
        const after = trimmed.slice(closeIdx + 2).trim();
        return after === '' || after.startsWith('//');
      }
      // Block comment opens and stays open
      this.inBlockComment = true;
      return true;
    }

    // If block comment opened after active code on this line (e.g. 'const x = 1; /* start')
    const openBlockIdx = trimmed.lastIndexOf('/*');
    if (openBlockIdx !== -1) {
      const closeIdx = trimmed.indexOf('*/', openBlockIdx + 2);
      if (closeIdx === -1) {
        this.inBlockComment = true;
      }
    }

    // 2. Python Triple-Quoted Docstring Tracking
    if (this.language === 'Python') {
      if (this.inTripleQuote) {
        const delimiter = this.inTripleQuote;
        const closeIdx = trimmed.indexOf(delimiter);
        if (closeIdx !== -1) {
          this.inTripleQuote = null;
          // Check if there is active code after the closing delimiter
          const after = trimmed.slice(closeIdx + 3).trim();
          return after === '' || after.startsWith('#');
        }
        return true;
      }

      // Check if a standalone triple-quoted docstring starts on this line
      if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
        const delimiter = trimmed.startsWith('"""') ? '"""' : "'''";
        const rest = trimmed.slice(3);
        const closeIdx = rest.indexOf(delimiter);
        if (closeIdx !== -1) {
          // Closed on same line: e.g. """docstring"""
          const after = rest.slice(closeIdx + 3).trim();
          return after === '' || after.startsWith('#');
        }
        // Opened and continues to next lines
        this.inTripleQuote = delimiter;
        return true;
      }

      // Check if triple quote opens after active code on this line (e.g. val = """doc)
      if (trimmed.includes('"""') || trimmed.includes("'''")) {
        const delimiter = trimmed.includes('"""') ? '"""' : "'''";
        const openIdx = trimmed.indexOf(delimiter);
        const closeIdx = trimmed.indexOf(delimiter, openIdx + 3);
        if (closeIdx === -1) {
          this.inTripleQuote = delimiter;
        }
        return false;
      }

      // Python single-line comment (#)
      if (trimmed.startsWith('#')) {
        return true;
      }

      return false;
    }

    // 3. SQL Line Comment (-- comment)
    // ONLY SQL treats '--' as a comment. In JS/C/Java, '--count;' is a pre-decrement operator!
    if (this.language === 'SQL' && trimmed.startsWith('--')) {
      return true;
    }

    // 4. Hash (#) comments for Ruby, Shell, YAML, etc.
    if (trimmed.startsWith('#')) {
      // In JavaScript and TypeScript, # denotes private class fields/methods (#field)
      if (this.language === 'JavaScript' || this.language === 'TypeScript') {
        return false;
      }
      return true;
    }

    return false;
  }
}

/**
 * Creates a stateful line-by-line comment evaluator for a given language.
 */
export function createCommentTracker(language?: string): (line: string) => boolean {
  const tracker = new CommentTracker(language);
  return (line: string) => tracker.isComment(line);
}

/**
 * Helper to determine whether a line is a non-code comment line statelessly.
 */
export function isCommentOnly(line: string, language?: string): boolean {
  const tracker = new CommentTracker(language);
  if (tracker.isComment(line)) {
    return true;
  }
  const trimmed = line.trim();
  const isCStyle = !language || [
    'JavaScript',
    'TypeScript',
    'Java',
    'C',
    'C++',
    'C#',
    'Go',
    'Rust',
    'PHP',
  ].includes(language);
  if (isCStyle && (trimmed.startsWith('* ') || trimmed === '*' || trimmed.startsWith('*/'))) {
    return true;
  }
  return false;
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
    const language = context.language ?? detectFileLanguage(context.filePath || context.relativePath);
    const isComment = createCommentTracker(language);
    const ignoreKeywords = ['example', 'dummy', 'placeholder', 'fake', 'mock', 'todo', 'your_key', 'process.env'];

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i]!;

      // Skip lines that are purely comments/documentation (AWS, GitHub, and generic secrets)
      if (isComment(line)) {
        continue;
      }

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
    const language = context.language ?? detectFileLanguage(context.filePath || context.relativePath);
    const isComment = createCommentTracker(language);

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i]!;

      // Skip lines that are purely comments/documentation
      if (isComment(line)) {
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
    const language = context.language ?? detectFileLanguage(context.filePath || context.relativePath);
    const isComment = createCommentTracker(language);

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i]!;

      // Skip lines that are purely comments/documentation
      if (isComment(line)) {
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
    const language = context.language ?? detectFileLanguage(context.filePath || context.relativePath);
    const isComment = createCommentTracker(language);

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i]!;

      // Skip lines that are purely comments/documentation
      if (isComment(line)) {
        continue;
      }

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
