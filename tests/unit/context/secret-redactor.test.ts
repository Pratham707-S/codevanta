/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/context/secret-redactor.ts
 * Owner: Manni
 * Purpose: Redact common secrets before provider dispatch.
 */

import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../../../src/context/secret-redactor.js';

describe('redactSecrets', () => {
    it('redacts API keys and passwords', () => {
        const result = redactSecrets(
            'api_key=abc123 password=mySecret123',
        );

        expect(result).not.toContain('abc123');
        expect(result).not.toContain('mySecret123');
        expect(result).toContain('[REDACTED]');
    });

    it('redacts bearer tokens', () => {
        const result = redactSecrets(
            'Authorization: Bearer abc.def.ghi',
        );

        expect(result).not.toContain('abc.def.ghi');
    });

    it('redacts GitHub tokens', () => {
        const token = 'ghp_' + 'a'.repeat(36);
        expect(redactSecrets(`token=${token}`)).not.toContain(token);
    });

    it('redacts AWS access key IDs', () => {
        const key = 'AKIA' + 'A'.repeat(16);
        expect(redactSecrets(`key=${key}`)).not.toContain(key);
    });

    it('redacts private key blocks', () => {
        const input = [
            '-----BEGIN PRIVATE KEY-----',
            'fake-private-key-content',
            '-----END PRIVATE KEY-----',
        ].join('\n');

        expect(redactSecrets(input)).not.toContain(
            'fake-private-key-content',
        );
    });

    it('redacts long high-entropy candidates', () => {
        const candidate = 'K8$mQ2!vR9#xT4@pL7^nB5&zW3*eH6?c';
        expect(redactSecrets(`value=${candidate}`)).not.toContain(candidate);
    });

    it('preserves ordinary text and short values', () => {
        const input = 'A normal README about JavaScript. id=abc123';
        expect(redactSecrets(input)).toBe(input);
    });

    it('preserves text after an assignment value', () => {
        const input = 'password=secret123; mode=development';
        const result = redactSecrets(input);

        expect(result).toContain('mode=development');
        expect(result).not.toContain('secret123');
    });

    it('returns the same result for repeated calls', () => {
        const input = 'password=secret123';
        expect(redactSecrets(input)).toBe(redactSecrets(input));
    });

    it('redacts quoted secret values completely', () => {
        const input = 'password="my quoted secret value"';

        const result = redactSecrets(input);

        expect(result).toBe('password="[REDACTED]"');
        expect(result).not.toContain('my');
        expect(result).not.toContain('quoted');
        expect(result).not.toContain('secret value');
    });

    it('redacts secrets in JSON-style assignments', () => {
        const input = '{"api_key": "my-json-secret-value"}';
        const result = redactSecrets(input);

        expect(result).not.toContain('my-json-secret-value');
        expect(result).toContain('[REDACTED]');
    });
});
