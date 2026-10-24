/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/providers/mock-adapter.ts
 * Owner: Team Lead
 * Purpose: Deterministic mock provider adapter for tests and offline demos
 */

import {
  IAIProvider,
  InvestigationResult,
  RepairProposalResult,
  ProviderExecutionError,
} from './provider.contract.js';
import { SanitizedPromptContext } from '../context/context-builder.js';
import { validateAIRepairPayload } from './schemas.js';

export interface MockAdapterOptions {
  model?: string;
  defaultConfidence?: number;
  simulateFailure?: boolean;
}

export class MockAdapter implements IAIProvider {
  public readonly name = 'mock';
  private readonly model: string;
  private readonly defaultConfidence: number;
  private simulateFailure: boolean;

  private customInvestigationResponse?: (context: SanitizedPromptContext) => InvestigationResult;
  private customRepairResponse?: (context: SanitizedPromptContext) => RepairProposalResult;

  constructor(options: MockAdapterOptions = {}) {
    this.model = options.model ?? 'mock-deterministic-v1';
    this.defaultConfidence = options.defaultConfidence ?? 0.88;
    this.simulateFailure = options.simulateFailure ?? false;
  }

  public async isAvailable(): Promise<boolean> {
    return !this.simulateFailure;
  }

  public setSimulateFailure(fail: boolean): void {
    this.simulateFailure = fail;
  }

  public setCustomInvestigation(handler: (context: SanitizedPromptContext) => InvestigationResult): void {
    this.customInvestigationResponse = handler;
  }

  public setCustomRepair(handler: (context: SanitizedPromptContext) => RepairProposalResult): void {
    this.customRepairResponse = handler;
  }

  public async generateInvestigation(context: SanitizedPromptContext): Promise<InvestigationResult> {
    if (this.simulateFailure) {
      throw new ProviderExecutionError('Simulated mock provider failure', this.name, 500);
    }

    if (this.customInvestigationResponse) {
      return this.customInvestigationResponse(context);
    }

    const finding = context.finding;
    return {
      provider: this.name,
      model: this.model,
      findingId: finding.id,
      explanation: `Deterministic investigation for ${finding.id} (${finding.category}): The vulnerable pattern in "${finding.path}" lacks required defensive validation.`,
      rootCause: `Defect originated from unvalidated or hardcoded parameter at lines ${finding.lineRange?.start ?? 1}-${finding.lineRange?.end ?? 1}.`,
      reproductionNotes: 'Can be reproduced by evaluating deterministic rule checks against the target file.',
      suggestedMitigation: 'Refactor parameter into safe environment variable or parameterized statement.',
      confidence: this.defaultConfidence,
      timestamp: new Date().toISOString(),
    };
  }

  public async generateRepair(context: SanitizedPromptContext): Promise<RepairProposalResult> {
    if (this.simulateFailure) {
      throw new ProviderExecutionError('Simulated mock provider failure', this.name, 500);
    }

    if (this.customRepairResponse) {
      return this.customRepairResponse(context);
    }

    const finding = context.finding;
    const filePath = finding.path;
    const startLine = finding.lineRange?.start ?? 1;

    // Generate a valid, deterministic unified diff matching the finding category
    let diff = '';
    let description = '';
    let rootCause = '';

    if (finding.category.includes('SEC-001') || finding.title.toLowerCase().includes('secret')) {
      description = `Replace hardcoded secret in ${filePath} with environment variable lookup`;
      rootCause = 'Plaintext sensitive credential found in source code';
      diff = [
        `--- a/${filePath}`,
        `+++ b/${filePath}`,
        `@@ -${startLine},3 +${startLine},3 @@`,
        ` // Configuration initialization`,
        `-const secretKey = "hardcoded_sensitive_credential";`,
        `+const secretKey = process.env.SERVICE_SECRET || '';`,
        ` export default secretKey;`,
      ].join('\n');
    } else if (finding.category.includes('SEC-002') || finding.title.toLowerCase().includes('sql')) {
      description = `Refactor raw SQL string concatenation in ${filePath} to parameterized query`;
      rootCause = 'User-controlled input concatenated directly into database query';
      diff = [
        `--- a/${filePath}`,
        `+++ b/${filePath}`,
        `@@ -${startLine},3 +${startLine},3 @@`,
        ` // Database query execution`,
        `-const query = "SELECT * FROM users WHERE id = " + userId;`,
        `+const query = "SELECT * FROM users WHERE id = $1";`,
        ` return db.execute(query, [userId]);`,
      ].join('\n');
    } else if (finding.category.includes('SEC-003') || finding.title.toLowerCase().includes('command')) {
      description = `Replace shell string execution in ${filePath} with execFile array arguments`;
      rootCause = 'Untrusted input passed to shell interpreter';
      diff = [
        `--- a/${filePath}`,
        `+++ b/${filePath}`,
        `@@ -${startLine},3 +${startLine},3 @@`,
        ` // Subprocess execution`,
        `-exec("git checkout " + branchName);`,
        `+execFile("git", ["checkout", branchName]);`,
        ` return true;`,
      ].join('\n');
    } else {
      description = `Apply automated remediation for finding ${finding.id} in ${filePath}`;
      rootCause = `Vulnerability identified at line ${startLine}`;
      diff = [
        `--- a/${filePath}`,
        `+++ b/${filePath}`,
        `@@ -${startLine},3 +${startLine},3 @@`,
        ` // Verified boundary check`,
        `-const result = dangerousOperation(input);`,
        `+const result = safeOperation(schema.parse(input));`,
        ` return result;`,
      ].join('\n');
    }

    // Validate generated diff through our schema & patch validator
    const validation = validateAIRepairPayload(
      {
        explanation: description,
        rootCause,
        suggestedFixDescription: description,
        diff,
        confidence: this.defaultConfidence,
      },
      filePath
    );

    return {
      provider: this.name,
      model: this.model,
      findingId: finding.id,
      targetFilePath: filePath,
      description,
      rootCause,
      diff,
      confidence: this.defaultConfidence,
      isValidDiff: validation.isValidDiff,
      isSafePath: validation.isSafePath,
      validationErrors: validation.errors.length > 0 ? validation.errors : undefined,
      timestamp: new Date().toISOString(),
    };
  }
}
