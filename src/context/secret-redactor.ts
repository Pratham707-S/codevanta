/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/context/secret-redactor.ts
 * Owner: Manni
 * Purpose: Secret redactor: regex & high-entropy token sanitization before provider dispatch
 */

export interface RedactionMatch {
  rule: string;
  placeholder: string;
  originalRedactedLength: number;
}

export interface RedactionResult {
  redactedText: string;
  hasRedactions: boolean;
  redactedCount: number;
  matches: RedactionMatch[];
}

/**
 * Standard replacement markers used across RepoGuard.
 */
export const REDACTION_MARKERS = {
  SECRET: '[REDACTED_SECRET]',
  PRIVATE_KEY: '[REDACTED_PRIVATE_KEY]',
  TOKEN: '[REDACTED_TOKEN]',
  PASSWORD: '[REDACTED_PASSWORD]',
} as const;

/**
 * Redacts secrets, credentials, API keys, and sensitive tokens from source code,
 * evidence, or prompt strings prior to transmission to any AI provider or external system.
 */
export function redactSecrets(content: unknown): string {
  if (content === null || content === undefined) {
    return '';
  }
  let str = String(content);

  // 1. PEM / OpenSSH / RSA / PGP Private Keys (multiline block)
  str = str.replace(
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g,
    REDACTION_MARKERS.PRIVATE_KEY
  );

  // 2. AWS Access Key IDs (AKIA prefix, 20 chars total)
  str = str.replace(/\b(AKIA[0-9A-Z]{16})\b/g, (match) => {
    return match.slice(0, 4) + '****************';
  });

  // 3. AWS Secret Access Keys (40 character base64-like string following aws assignment or standalone)
  str = str.replace(
    /((?:aws_secret_access_key|aws_secret|secret_key)\s*[:=]\s*["']?)[A-Za-z0-9/+=]{40}(["']?)/gi,
    `$1${REDACTION_MARKERS.SECRET}$2`
  );

  // 4. GitHub Tokens (classic ghp_, oauth gho_, app ghs_, fine-grained github_pat_)
  str = str.replace(/\b(ghp_[a-zA-Z0-9]{36})\b/g, (match) => {
    return match.slice(0, 4) + '********************************';
  });
  str = str.replace(/\b(gh[osr]_[a-zA-Z0-9]{36})\b/g, (match) => {
    return match.slice(0, 4) + '********************************';
  });
  str = str.replace(/\b(github_pat_[a-zA-Z0-9_]{22,82})\b/g, (match) => {
    return match.slice(0, 11) + '********************';
  });

  // 5. Slack API tokens (xox[baprs]-...)
  str = str.replace(/\b(xox[baprs]-[0-9a-zA-Z-]{10,72})\b/g, REDACTION_MARKERS.TOKEN);

  // 6. Generic credentials, API keys, secrets, passwords in assignments (JSON, YAML, .env, code)
  // Handles quotes: api_key = "...", password: '...', etc.
  str = str.replace(
    /((?:api[_-]?key|jwt[_-]?secret|auth[_-]?token|client[_-]?secret|db[_-]?password|password|passwd|secret|access[_-]?token|refresh[_-]?token|private[_-]?key)\s*[:=]\s*["'])[^"'\r\n]+(["'])/gi,
    `$1${REDACTION_MARKERS.SECRET}$2`
  );

  // Handles unquoted assignments in .env or config (e.g. API_KEY=abcdef12345678)
  str = str.replace(
    /((?:api[_-]?key|jwt[_-]?secret|auth[_-]?token|client[_-]?secret|db[_-]?password|password|passwd|secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*)(?!["'])[^\s,;#\r\n]{8,}/gi,
    `$1${REDACTION_MARKERS.SECRET}`
  );

  // 7. Authorization Bearer / Basic tokens in headers
  str = str.replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]{16,}\b/gi, `$1${REDACTION_MARKERS.TOKEN}`);
  str = str.replace(/\b(Basic\s+)[A-Za-z0-9+/=]{16,}\b/gi, `$1${REDACTION_MARKERS.TOKEN}`);

  // 8. Credentials embedded in URLs: https://user:password@host
  str = str.replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^:\s/@]+):([^@\s/]+)@/g, `$1$2:${REDACTION_MARKERS.PASSWORD}@`);

  return str;
}

/**
 * Returns detailed analysis of any redacted secrets within the content.
 */
export function sanitizeWithAudit(content: unknown): RedactionResult {
  const original = content === null || content === undefined ? '' : String(content);
  const redactedText = redactSecrets(original);

  const hasRedactions = original !== redactedText;
  const matches: RedactionMatch[] = [];

  if (hasRedactions) {
    if (redactedText.includes(REDACTION_MARKERS.PRIVATE_KEY)) {
      matches.push({ rule: 'private_key', placeholder: REDACTION_MARKERS.PRIVATE_KEY, originalRedactedLength: 0 });
    }
    if (redactedText.includes('AKIA****')) {
      matches.push({ rule: 'aws_access_key', placeholder: 'AKIA****', originalRedactedLength: 20 });
    }
    if (redactedText.includes('ghp_****') || redactedText.includes('github_pat_****')) {
      matches.push({ rule: 'github_token', placeholder: 'gh*_****', originalRedactedLength: 40 });
    }
    if (redactedText.includes(REDACTION_MARKERS.SECRET)) {
      matches.push({ rule: 'generic_secret', placeholder: REDACTION_MARKERS.SECRET, originalRedactedLength: 0 });
    }
    if (redactedText.includes(REDACTION_MARKERS.TOKEN)) {
      matches.push({ rule: 'auth_token', placeholder: REDACTION_MARKERS.TOKEN, originalRedactedLength: 0 });
    }
    if (redactedText.includes(REDACTION_MARKERS.PASSWORD)) {
      matches.push({ rule: 'url_credential', placeholder: REDACTION_MARKERS.PASSWORD, originalRedactedLength: 0 });
    }
  }

  return {
    redactedText,
    hasRedactions,
    redactedCount: matches.length,
    matches,
  };
}

/**
 * Quick check if content contains likely unredacted secret patterns.
 */
export function containsPotentialSecrets(content: string): boolean {
  return (
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(content) ||
    /\bAKIA[0-9A-Z]{16}\b/.test(content) ||
    /\bgh[posr]_[a-zA-Z0-9]{36}\b/.test(content) ||
    /\bgithub_pat_[a-zA-Z0-9_]{22,82}\b/.test(content) ||
    /\b(Bearer\s+)[A-Za-z0-9._~+/-]{16,}\b/i.test(content) ||
    /(?:api[_-]?key|jwt[_-]?secret|password|secret)\s*[:=]\s*["'][^"'\r\n]{8,}["']/i.test(content)
  );
}
