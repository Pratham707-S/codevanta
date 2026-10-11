/**
 * RepoGuard Vitest Configuration
 * Owner: Shared (Team Lead coordinates)
 * Purpose: Vitest test runner configuration with module alias resolution
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/fixtures/'],
    },
  },
  resolve: {
    alias: {
      '@repoguard': resolve(__dirname, './src'),
    },
  },
});
