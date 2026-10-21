
/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/context/secret-redactor.ts
 * Owner: Manni
 * Purpose: Redact common secrets before provider dispatch.
 */

const REDACTED = '[REDACTED]';

const SECRET_PATTERNS: RegExp[] = [
    // Private key blocks
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,

    // Bearer tokens
    /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,

    // Secret assignments; capture only the value.
    /\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|client[_-]?secret|secret[_-]?key)\b["']?(\s*[:=]\s*)(?:"([^"]*)"|'([^']*)'|`([^`]*)`|([^"'`\s;,}]+))/gi,

    // GitHub tokens
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,

    // Slack tokens
    /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,

    // AWS access key IDs
    /\bAKIA[0-9A-Z]{16}\b/g,
];

function hasHighEntropy(value: string): boolean {
    if (value.length < 32) {
        return false;
    }

    const classes = [
        /[a-z]/.test(value),
        /[A-Z]/.test(value),
        /\d/.test(value),
        /[^A-Za-z0-9]/.test(value),
    ].filter(Boolean).length;

    // Conservative heuristic, not a cryptographic entropy calculation.
    return classes >= 3 && new Set(value).size >= 10;
}

function redactHighEntropyCandidates(input: string): string {
    return input.replace(
        /[^\s"'`,;{}()[\]=:]{32,}/g,
        (candidate) => hasHighEntropy(candidate) ? REDACTED : candidate,
    );
}

/**
 * Redacts common secret patterns and long high-entropy candidates.
 * This is a heuristic; it cannot guarantee detection of every secret.
 */
export function redactSecrets(input: string): string {
    let redacted = input;

    for (const pattern of SECRET_PATTERNS) {
        const matcher = new RegExp(pattern.source, pattern.flags);

        if (pattern.source.includes('api[_-]?key')) {
            redacted = redacted.replace(
                matcher,
                (
                    _match,
                    name: string,
                    separator: string,
                    doubleQuoted: string | undefined,
                    singleQuoted: string | undefined,
                    backtickQuoted: string | undefined,
                    _unquoted: string | undefined,
                ) => {
                    if (doubleQuoted !== undefined) {
                        return `${name}${separator}"${REDACTED}"`;
                    }

                    if (singleQuoted !== undefined) {
                        return `${name}${separator}'${REDACTED}'`;
                    }

                    if (backtickQuoted !== undefined) {
                        return `${name}${separator}\`${REDACTED}\``;
                    }

                    return `${name}${separator}${REDACTED}`;
                },
            );
        } else {
            redacted = redacted.replace(matcher, REDACTED);
        }
    }

    return redactHighEntropyCandidates(redacted);
}
