/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/domain/repair.ts
 * Owner: Pratham
 * Purpose: Domain models: RepairProposal, UnifiedDiffPatch, RepairStatus
 */

import { VerificationSuiteResult } from './verification.js';

export type RepairRiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE';

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

export interface UnifiedDiffPatch {
  rawDiff: string;
  targetFiles: string[];
  isValid: boolean;
  errors?: string[];
}

export interface RepairProposal {
  id: string;
  findingId?: string;
  title?: string;
  description?: string;
  filePath: string;
  diff: string;
  rationale?: string;
  riskLevel?: RepairRiskLevel;
}

export interface FindingRepairInput {
  id: string;
  category: string;
  severity: string;
  title: string;
  path: string;
  lineRange?: { start: number; end: number };
  explanation?: string;
  evidence?: string;
  recommendation?: string;
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
  applicationResult?: {
    success: boolean;
    appliedFiles: string[];
    errors: string[];
    rollbackPerformed?: boolean;
  };
  verificationResult?: VerificationSuiteResult;
  confidence?: {
    calibratedScore: number;
    baselineScore: number;
    verificationModifier: number;
    astModifier: number;
    rationale: string[];
  };
  rollbackOccurred?: boolean;
  timestamp: string;
}
