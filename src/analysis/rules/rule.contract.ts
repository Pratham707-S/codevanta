/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/analysis/rules/rule.contract.ts
 * Owner: Team Lead
 * Purpose: Rule engine: typed security-rule interface and file context
 */

import { StorageFinding } from '../../storage/run-store.js';

export interface RuleFileContext {
  filePath: string;
  relativePath: string;
  content: string;
  lines: string[];
  language?: string;
}

export interface SecurityRule {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  readonly cwe?: string;
  readonly description: string;
  evaluate(context: RuleFileContext): StorageFinding[] | Promise<StorageFinding[]>;
}
