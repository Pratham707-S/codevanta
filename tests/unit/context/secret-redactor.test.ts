
import { afterEach, describe, expect, it } from 'vitest';
import { redactSecrets } from '../../../src/context/secret-redactor.js';

describe('redactSecrets', () => {
    it('redacts API keys and passwords', () => {
        const input = 'api_key=abc123 password=mySecret123';

        const result = redactSecrets(input);

        expect(result).not.toContain('abc123');
        expect(result).not.toContain('mySecret123');
        expect(result).toContain('[REDACTED]');
    });

    it('redacts bearer tokens', () => {
        const result = redactSecrets(
            'Authorization: Bearer abc.def.ghi',
        );

        expect(result).not.toContain('abc.def.ghi');
        expect(result).toContain('[REDACTED]');
    });

    it('redacts GitHub tokens', () => {
        const token = 'ghp_' + 'a'.repeat(36);
        const result = redactSecrets(`token=${token}`);

        expect(result).not.toContain(token);
        expect(result).toContain('[REDACTED]');
    });

    it('redacts AWS access key IDs', () => {
        const key = 'AKIA' + 'A'.repeat(16);
        const result = redactSecrets(`key=${key}`);

        expect(result).not.toContain(key);
        expect(result).toContain('[REDACTED]');
    });

    it('preserves ordinary text', () => {
        const input = 'This is a normal README about JavaScript.';
        expect(redactSecrets(input)).toBe(input);
    });

    it('returns the same result for repeated calls', () => {
        const input = 'password=secret123';

        expect(redactSecrets(input)).toBe(redactSecrets(input));
    });

    it('redacts private key blocks', () => {
        const input = [
            '-----BEGIN PRIVATE KEY-----',
            'fake-private-key-content',
            '-----END PRIVATE KEY-----',
        ].join('\n');

        const result = redactSecrets(input);

        expect(result).not.toContain('fake-private-key-content');
        expect(result).toContain('[REDACTED]');
    });
});
