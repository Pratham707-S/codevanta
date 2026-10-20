/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/analysis/rules/rule-runner.ts
 * Owner: Team Lead
 * Purpose: Rule engine: execute registered security rules across candidate files
 */

import { SecurityRule, RuleFileContext } from './rule.contract.js';
import { STANDARD_RULES, redactSecretSnippet } from './suspicious-patterns.js';
import { StorageFinding } from '../../storage/run-store.js';
import { detectFileLanguage } from '../../repository/index.js';

export interface RuleRunnerOptions {
  rules?: SecurityRule[];
}

const SEVERITY_WEIGHT: Record<StorageFinding['severity'], number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

export class RuleRunner {
  private readonly rules: SecurityRule[];

  constructor(options: RuleRunnerOptions = {}) {
    this.rules = options.rules || STANDARD_RULES;
  }

  /**
   * Evaluates rules against a single file context.
   */
  public async evaluateFile(context: RuleFileContext): Promise<StorageFinding[]> {
    const fileFindings: StorageFinding[] = [];
    const language = context.language ?? detectFileLanguage(context.filePath || context.relativePath);
    const resolvedContext: RuleFileContext = { ...context, language };

    for (const rule of this.rules) {
      try {
        const results = await rule.evaluate(resolvedContext);
        for (const finding of results) {
          if (finding.evidence) {
            finding.evidence = redactSecretSnippet(finding.evidence);
          }
          fileFindings.push(finding);
        }
      } catch {
        // Individual rule failure should not crash the scanner
      }
    }

    return fileFindings;
  }

  /**
   * Evaluates rules across a collection of source files and normalizes findings.
   */
  public async evaluateFiles(
    files: Array<{ filePath: string; relativePath: string; content: string; language?: string }>
  ): Promise<StorageFinding[]> {
    const rawFindings: StorageFinding[] = [];

    for (const file of files) {
      const lines = file.content.split('\n');
      const language = file.language ?? detectFileLanguage(file.filePath || file.relativePath);
      const findings = await this.evaluateFile({
        filePath: file.filePath,
        relativePath: file.relativePath,
        content: file.content,
        lines,
        language,
      });
      rawFindings.push(...findings);
    }

    // Deduplicate findings by stable composite key
    const seen = new Set<string>();
    const deduplicated: StorageFinding[] = [];

    for (const finding of rawFindings) {
      const key = `${finding.id}-${finding.path}-${finding.lineRange?.start || 0}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(finding);
      }
    }

    // Deterministic sort: Severity descending, then path ascending, then start line ascending
    deduplicated.sort((a, b) => {
      const weightDiff = (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0);
      if (weightDiff !== 0) return weightDiff;

      const pathDiff = a.path.localeCompare(b.path);
      if (pathDiff !== 0) return pathDiff;

      return (a.lineRange?.start || 0) - (b.lineRange?.start || 0);
    });

    return deduplicated;
  }
}
