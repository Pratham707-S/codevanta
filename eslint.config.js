/**
 * RepoGuard ESLint Configuration
 * Owner: Shared (Team Lead coordinates)
 * Purpose: ESLint flat configuration
 *
 * @todo Configure flat linting rules for TypeScript and test files in planned tooling milestone.
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.repoguard/**'],
  },
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {},
  },
];
