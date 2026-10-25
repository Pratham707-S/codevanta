/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/providers/provider.contract.ts
 * Owner: Team Lead
 * Purpose: AI Provider interface, typed error hierarchy, and payload contracts
 */

import { SanitizedPromptContext } from '../context/context-builder.js';

export class ProviderError extends Error {
  public readonly provider: string;
  public readonly code: string;

  constructor(message: string, provider: string, code: string = 'PROVIDER_ERROR') {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.code = code;
  }
}

export class ProviderConfigurationError extends ProviderError {
  constructor(message: string, provider: string) {
    super(message, provider, 'PROVIDER_CONFIG_ERROR');
    this.name = 'ProviderConfigurationError';
  }
}

export class ProviderExecutionError extends ProviderError {
  public readonly status?: number;
  public readonly rawResponse?: string;

  constructor(message: string, provider: string, status?: number, rawResponse?: string) {
    super(message, provider, 'PROVIDER_EXECUTION_ERROR');
    this.name = 'ProviderExecutionError';
    this.status = status;
    this.rawResponse = rawResponse;
  }
}

export class ProviderValidationError extends ProviderError {
  public readonly validationErrors: string[];

  constructor(message: string, provider: string, validationErrors: string[] = []) {
    super(message, provider, 'PROVIDER_VALIDATION_ERROR');
    this.name = 'ProviderValidationError';
    this.validationErrors = validationErrors;
  }
}

export interface InvestigationResult {
  provider: string;
  model: string;
  findingId: string;
  explanation: string;
  rootCause: string;
  reproductionNotes?: string;
  suggestedMitigation: string;
  confidence: number;
  timestamp: string;
}

export interface RepairProposalResult {
  provider: string;
  model: string;
  findingId: string;
  targetFilePath: string;
  description: string;
  rootCause: string;
  diff: string;
  confidence: number;
  isValidDiff: boolean;
  isSafePath: boolean;
  validationErrors?: string[];
  timestamp: string;
}

export interface IAIProvider {
  readonly name: string;

  /**
   * Checks whether the provider is currently available and configured.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Generates a deep root-cause explanation for the provided finding context.
   */
  generateInvestigation(context: SanitizedPromptContext): Promise<InvestigationResult>;

  /**
   * Synthesizes a validated unified diff repair proposal for the finding.
   */
  generateRepair(context: SanitizedPromptContext): Promise<RepairProposalResult>;
}
