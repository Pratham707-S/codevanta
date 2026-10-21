/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/context/secret-redactor.ts
 * Owner: Manni
 * Purpose: Secret redactor: regex & high-entropy token sanitization before provider dispatch
 *
 * @todo Implementation planned in assigned milestone.
 */

const REDACTED = '[REDACTED]';

const SECRET_PATTERNS: RegExp[] = [
    // Private key blocks
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,

    // Authorization bearer tokens
    /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,

    // Common assignments: API keys, passwords, tokens and secrets
    /\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|client[_-]?secret|secret[_-]?key)\b(\s*[:=]\s*)(["'`]?)[^\s"'`;,}]+(?:\s+[^"'`;,}]*)?/gi,

    // Common GitHub tokens
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,

    // Common Slack tokens
    /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,

    // AWS access key IDs
    /\bAKIA[0-9A-Z]{16}\b/g,
];

/**
 * Redacts common secret patterns from a string.
 * The input string is not modified.
 */
export function redactSecrets(input: string): string {
    let redacted = input;

    for (const pattern of SECRET_PATTERNS) {
        // Create a fresh regex so repeated calls remain deterministic.
        const matcher = new RegExp(pattern.source, pattern.flags);
        redacted = redacted.replace(matcher, (match) => {
            // Preserve the variable name and assignment separator.
            const assignment = match.match(
                /^(\s*[\w-]+\s*[:=]\s*)/,
            );

            if (assignment) {
                return `${assignment[1]}${REDACTED}`;
            }

            return REDACTED;
        });
    }

    return redacted;
}

