/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/repair/repair-orchestrator.ts
 * Owner: Pratham
 * Purpose: Repair workflow: orchestrate proposal creation, diff preview, approval, and application
 */

import { validatePatch } from './patch-parser.js';
import { renderProposalPreview } from './diff-preview.js';
import {
  ApprovalGate,
  type ApprovalGateOptions,
  type PatchCandidate,
  type RiskLevel,
} from './approval-gate.js';
import {
  PatchApplicator,
  type PatchApplicatorOptions,
  type PatchApplicationResult,
} from './patch-applicator.js';

export type RepairWorkflowStatus =
  | 'VALIDATED'
  | 'APPROVED'
  | 'REJECTED'
  | 'ABORTED'
  | 'SKIPPED'
  | 'APPLIED'
  | 'FAILED';

export interface RepairProposal {
  id: string;
  findingId?: string;
  title?: string;
  description?: string;
  filePath: string;
  diff: string;
  rationale?: string;
  riskLevel?: RiskLevel;
}

export interface RepairExecutionResult {
  proposalId: string;
  findingId?: string;
  filePath: string;
  status: RepairWorkflowStatus;
  approved: boolean;
  applied: boolean;
  summary: string;
  preview?: string;
  approvalReason?: string;
  applicationResult?: PatchApplicationResult;
  timestamp: string;
}

export interface RepairOrchestratorOptions
  extends ApprovalGateOptions,
    PatchApplicatorOptions {
  skipPreview?: boolean;
}

/**
 * Orchestrates the full repair lifecycle:
 * 1. Patch validation and security guard against path traversal.
 * 2. Reviewable terminal diff preview formatting.
 * 3. Explicit interactive human confirmation gate.
 * 4. Safe patch application with automatic rollback on failure.
 */
export class RepairOrchestrator {
  private readonly approvalGate: ApprovalGate;
  private readonly patchApplicator: PatchApplicator;
  private readonly defaultOptions: RepairOrchestratorOptions;

  constructor(defaultOptions: RepairOrchestratorOptions = {}) {
    this.defaultOptions = defaultOptions;
    this.approvalGate = new ApprovalGate(defaultOptions);
    this.patchApplicator = new PatchApplicator(defaultOptions);
  }

  /**
   * Executes the full repair pipeline for a single proposal.
   */
  public async orchestrate(
    proposal: RepairProposal,
    options: RepairOrchestratorOptions = {}
  ): Promise<RepairExecutionResult> {
    const opts: RepairOrchestratorOptions = { ...this.defaultOptions, ...options };
    const timestamp = new Date().toISOString();

    // Step 1: Validate patch and guard against path traversal
    const validation = validatePatch(proposal.diff, { repoRoot: opts.repoRoot });
    if (!validation.valid) {
      return {
        proposalId: proposal.id,
        findingId: proposal.findingId,
        filePath: proposal.filePath,
        status: 'REJECTED',
        approved: false,
        applied: false,
        summary: `Patch validation failed: ${validation.errors.join('; ')}`,
        timestamp,
      };
    }

    // Step 2: Generate reviewable diff preview if enabled
    let preview: string | undefined;
    if (!opts.skipPreview) {
      preview = renderProposalPreview(
        {
          id: proposal.id,
          findingId: proposal.findingId,
          title: proposal.title,
          rationale: proposal.rationale,
          filePath: proposal.filePath,
          diff: proposal.diff,
        },
        { color: opts.output === undefined }
      );
    }

    // Step 3: Human confirmation approval gate (AGENTS.md Rule 6 invariant)
    const candidate: PatchCandidate = {
      id: proposal.id,
      findingId: proposal.findingId,
      filePath: proposal.filePath,
      diff: proposal.diff,
      description: proposal.description || proposal.title,
      riskLevel: proposal.riskLevel,
    };

    const approvalDecision = await this.approvalGate.requestApproval(candidate, opts);

    if (!approvalDecision.approved) {
      return {
        proposalId: proposal.id,
        findingId: proposal.findingId,
        filePath: proposal.filePath,
        status: approvalDecision.status,
        approved: false,
        applied: false,
        summary: `Approval gate halted repair: ${approvalDecision.reason}`,
        approvalReason: approvalDecision.reason,
        preview,
        timestamp,
      };
    }

    // Step 4: Apply patch safely to workspace with rollback guarantee
    const applicationResult = await this.patchApplicator.applyPatch(proposal.diff, opts);

    if (!applicationResult.success) {
      return {
        proposalId: proposal.id,
        findingId: proposal.findingId,
        filePath: proposal.filePath,
        status: 'FAILED',
        approved: true,
        applied: false,
        summary: `Patch application failed: ${applicationResult.errors.join('; ')}`,
        approvalReason: approvalDecision.reason,
        applicationResult,
        preview,
        timestamp,
      };
    }

    return {
      proposalId: proposal.id,
      findingId: proposal.findingId,
      filePath: proposal.filePath,
      status: 'APPLIED',
      approved: true,
      applied: true,
      summary: `Repair proposal ${proposal.id} applied successfully to ${proposal.filePath}.`,
      approvalReason: approvalDecision.reason,
      applicationResult,
      preview,
      timestamp,
    };
  }

  /**
   * Executes repair workflow sequentially for multiple proposals.
   * Halts immediately if any patch is aborted.
   */
  public async orchestrateBatch(
    proposals: RepairProposal[],
    options: RepairOrchestratorOptions = {}
  ): Promise<RepairExecutionResult[]> {
    const results: RepairExecutionResult[] = [];

    for (const proposal of proposals) {
      const result = await this.orchestrate(proposal, options);
      results.push(result);

      if (result.status === 'ABORTED') {
        break;
      }
    }

    return results;
  }
}

/**
 * Standalone helper to orchestrate a repair.
 */
export async function orchestrateRepair(
  proposal: RepairProposal,
  options?: RepairOrchestratorOptions
): Promise<RepairExecutionResult> {
  const orchestrator = new RepairOrchestrator();
  return orchestrator.orchestrate(proposal, options);
}

