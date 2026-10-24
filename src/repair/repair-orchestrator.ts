/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/repair/repair-orchestrator.ts
 * Owner: Pratham
 * Purpose: Repair workflow: orchestrate proposal creation, diff preview, approval, safe application, allowlisted verification, rollback, and confidence calibration
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validatePatch, validateSafePath } from './patch-parser.js';
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
import {
  CheckRunner,
  type VerificationSuiteInput,
  type VerificationSuiteResult,
} from '../verification/index.js';
import {
  calibrateConfidence,
  type ConfidenceEvaluation,
} from '../analysis/confidence.js';
import {
  IAIProvider,
  MockAdapter,
  RepairProposalResult,
} from '../providers/index.js';
import {
  buildSanitizedContext,
  type SanitizedPromptContext,
} from '../context/index.js';
import type { StorageFinding } from '../storage/run-store.js';

export type RepairWorkflowStatus =
  | 'VALIDATED'
  | 'APPROVED'
  | 'REJECTED'
  | 'ABORTED'
  | 'SKIPPED'
  | 'APPLIED'
  | 'FAILED'
  | 'VERIFIED'
  | 'VERIFICATION_FAILED'
  | 'ROLLED_BACK';

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
  verificationResult?: VerificationSuiteResult;
  confidence?: ConfidenceEvaluation;
  rollbackOccurred?: boolean;
  timestamp: string;
}

export interface RepairOrchestratorOptions
  extends ApprovalGateOptions,
    PatchApplicatorOptions {
  skipPreview?: boolean;
  provider?: IAIProvider;
  verificationSuite?: VerificationSuiteInput;
  runVerification?: boolean;
  autoRollbackOnVerificationFailure?: boolean;
  checkRunner?: CheckRunner;
}

export interface FindingRepairInput {
  id: string;
  category?: string;
  severity?: string;
  title: string;
  path: string;
  lineRange?: { start: number; end: number };
  explanation?: string;
  evidence?: string;
}

/**
 * Orchestrates the full repair lifecycle:
 * 1. Sanitized context extraction (scrubbing secrets).
 * 2. AI proposal generation and schema/diff validation.
 * 3. Reviewable terminal diff preview formatting.
 * 4. Explicit interactive human confirmation gate (AGENTS.md Rule 6 invariant).
 * 5. Safe patch application with atomic multi-file rollback on error.
 * 6. Allowlisted subprocess verification check execution.
 * 7. Automatic rollback if verification tests fail.
 * 8. Dynamic evidence-based confidence calibration.
 */
export class RepairOrchestrator {
  private readonly approvalGate: ApprovalGate;
  private readonly patchApplicator: PatchApplicator;
  private readonly checkRunner: CheckRunner;
  private readonly defaultOptions: RepairOrchestratorOptions;

  constructor(defaultOptions: RepairOrchestratorOptions = {}) {
    this.defaultOptions = defaultOptions;
    this.approvalGate = new ApprovalGate(defaultOptions);
    this.patchApplicator = new PatchApplicator(defaultOptions);
    this.checkRunner = defaultOptions.checkRunner ?? new CheckRunner({ cwd: defaultOptions.repoRoot });
  }

  /**
   * Executes the repair pipeline for a single proposal.
   */
  public async orchestrate(
    proposal: RepairProposal,
    options: RepairOrchestratorOptions = {}
  ): Promise<RepairExecutionResult> {
    const opts: RepairOrchestratorOptions = { ...this.defaultOptions, ...options };
    const repoRoot = opts.repoRoot ? resolve(opts.repoRoot) : process.cwd();
    const timestamp = new Date().toISOString();

    // Step 1: Validate patch and guard against path traversal
    const validation = validatePatch(proposal.diff, { repoRoot });
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
    const applicatorOpts: PatchApplicatorOptions = {
      ...opts,
      repoRoot,
      allowedFiles: opts.allowedFiles || [proposal.filePath],
    };

    const applicationResult = await this.patchApplicator.applyPatch(proposal.diff, applicatorOpts);

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

    // Step 5: Post-Apply Verification (Phase 3 Step 4 Integration)
    let verificationResult: VerificationSuiteResult | undefined;
    let rollbackOccurred = false;
    let finalStatus: RepairWorkflowStatus = 'APPLIED';
    let summary = `Repair proposal ${proposal.id} applied successfully to ${proposal.filePath}.`;

    if (opts.runVerification && opts.verificationSuite) {
      const runner = opts.checkRunner ?? this.checkRunner;
      verificationResult = await runner.runVerificationSuite(opts.verificationSuite, { cwd: repoRoot });

      if (verificationResult.overallOutcome !== 'PASSED') {
        if (opts.autoRollbackOnVerificationFailure !== false && applicationResult.rollbackHandle) {
          await applicationResult.rollbackHandle();
          rollbackOccurred = true;
          finalStatus = 'ROLLED_BACK';
          summary = `Verification checks ${verificationResult.overallOutcome} (passed ${verificationResult.passedCount}/${verificationResult.totalChecks}). Patch was automatically rolled back.`;
        } else {
          finalStatus = 'VERIFICATION_FAILED';
          summary = `Verification checks ${verificationResult.overallOutcome} (passed ${verificationResult.passedCount}/${verificationResult.totalChecks}).`;
        }
      } else {
        finalStatus = 'VERIFIED';
        summary = `Repair proposal ${proposal.id} applied and verified successfully (${verificationResult.passedCount}/${verificationResult.totalChecks} checks passed).`;
      }
    }

    // Step 6: Dynamic Evidence-Based Confidence Calibration (Phase 3 Step 5 Integration)
    const confidence = calibrateConfidence({
      finding: {
        id: proposal.findingId,
        title: proposal.title,
        path: proposal.filePath,
      },
      repair: {
        diff: proposal.diff,
        isValidDiff: true,
        isSafePath: true,
      },
      verification: verificationResult || (opts.runVerification === false ? 'SKIPPED' : undefined),
    });

    return {
      proposalId: proposal.id,
      findingId: proposal.findingId,
      filePath: proposal.filePath,
      status: finalStatus,
      approved: true,
      applied: !rollbackOccurred,
      summary,
      approvalReason: approvalDecision.reason,
      applicationResult,
      verificationResult,
      confidence,
      rollbackOccurred,
      preview,
      timestamp,
    };
  }

  /**
   * End-to-end finding repair orchestration:
   * 1. Inspect finding and validate path containment.
   * 2. Build sanitized context (scrubbing secrets).
   * 3. Obtain AI proposal via configured provider (MockAdapter or Gemini).
   * 4. Validate proposal schema, diff syntax, and safe paths.
   * 5. Present diff preview and require human approval.
   * 6. Apply patch with allowlist enforcement.
   * 7. Execute allowlisted verification suite.
   * 8. Trigger rollback if verification fails.
   * 9. Calibrate confidence and return truthful result.
   */
  public async orchestrateFinding(
    finding: FindingRepairInput,
    options: RepairOrchestratorOptions = {}
  ): Promise<RepairExecutionResult> {
    const opts: RepairOrchestratorOptions = { ...this.defaultOptions, ...options };
    const repoRoot = opts.repoRoot ? resolve(opts.repoRoot) : process.cwd();
    const timestamp = new Date().toISOString();

    // 1. Guard against path traversal on finding path
    const pathCheck = validateSafePath(finding.path, repoRoot);
    if (!pathCheck.safe) {
      return {
        proposalId: `REPAIR-${finding.id}`,
        findingId: finding.id,
        filePath: finding.path,
        status: 'REJECTED',
        approved: false,
        applied: false,
        summary: `Path traversal or unsafe target path rejected: ${pathCheck.error || finding.path}`,
        timestamp,
      };
    }

    const normalizedPath = pathCheck.normalizedPath || finding.path;
    const targetAbsPath = resolve(repoRoot, normalizedPath);

    // 2. Build sanitized context
    let promptContext: SanitizedPromptContext;
    if (existsSync(targetAbsPath)) {
      try {
        promptContext = await buildSanitizedContext(
          {
            id: finding.id,
            category: finding.category || 'Security',
            severity: finding.severity || 'HIGH',
            title: finding.title,
            path: normalizedPath,
            lineRange: finding.lineRange,
            explanation: finding.explanation || '',
            evidence: finding.evidence,
          } as StorageFinding,
          repoRoot
        );
      } catch (err: unknown) {
        return {
          proposalId: `REPAIR-${finding.id}`,
          findingId: finding.id,
          filePath: normalizedPath,
          status: 'FAILED',
          approved: false,
          applied: false,
          summary: `Failed to build sanitized context: ${err instanceof Error ? err.message : String(err)}`,
          timestamp,
        };
      }
    } else {
      // Target file not on disk: construct synthetic context
      promptContext = {
        finding: {
          id: finding.id,
          category: finding.category || 'Security',
          severity: finding.severity || 'HIGH',
          title: finding.title,
          path: normalizedPath,
          lineRange: finding.lineRange || { start: 1, end: 1 },
          explanation: finding.explanation || '',
          evidence: finding.evidence,
        },
        codeSlice: {
          filePath: normalizedPath,
          startLine: finding.lineRange?.start || 1,
          endLine: finding.lineRange?.end || 1,
          lines: [],
          rawSnippet: finding.evidence || '',
          totalFileLines: 1,
        },
        formattedPromptContext: `### Security Finding: ${finding.title}\nEvidence: ${finding.evidence || 'N/A'}`,
        hasRedactedSecrets: false,
      };
    }

    // 3. Obtain AI repair proposal
    const provider = opts.provider ?? new MockAdapter();
    let proposalResult: RepairProposalResult;
    try {
      proposalResult = await provider.generateRepair(promptContext);
    } catch (err: unknown) {
      return {
        proposalId: `REPAIR-${finding.id}`,
        findingId: finding.id,
        filePath: normalizedPath,
        status: 'FAILED',
        approved: false,
        applied: false,
        summary: `AI provider "${provider.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp,
      };
    }

    // 4. Validate proposal
    if (!proposalResult.isValidDiff || !proposalResult.isSafePath) {
      return {
        proposalId: `REPAIR-${finding.id}`,
        findingId: finding.id,
        filePath: normalizedPath,
        status: 'REJECTED',
        approved: false,
        applied: false,
        summary: `AI proposal rejected: ${proposalResult.validationErrors?.join('; ') || 'Invalid diff syntax or unsafe target path'}`,
        timestamp,
      };
    }

    // 5. Delegate to orchestrate
    const proposal: RepairProposal = {
      id: `REPAIR-${finding.id}`,
      findingId: finding.id,
      title: finding.title,
      description: proposalResult.description || finding.title,
      rationale: proposalResult.rootCause,
      filePath: normalizedPath,
      diff: proposalResult.diff,
      riskLevel: (finding.severity as RiskLevel) || 'HIGH',
    };

    const executionResult = await this.orchestrate(proposal, {
      ...opts,
      allowedFiles: opts.allowedFiles || [normalizedPath],
    });

    // 6. Recalibrate confidence with complete finding and AI confidence
    executionResult.confidence = calibrateConfidence({
      finding: {
        id: finding.id,
        category: finding.category,
        severity: (finding.severity as StorageFinding['severity']) || 'HIGH',
        title: finding.title,
        path: normalizedPath,
        lineRange: finding.lineRange,
        explanation: finding.explanation,
        evidence: finding.evidence,
      },
      repair: {
        provider: provider.name,
        diff: proposalResult.diff,
        isValidDiff: proposalResult.isValidDiff,
        isSafePath: proposalResult.isSafePath,
        confidence: proposalResult.confidence,
      },
      verification: executionResult.verificationResult || (opts.runVerification === false ? 'SKIPPED' : undefined),
    });

    return executionResult;
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
