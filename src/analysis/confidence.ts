/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/analysis/confidence.ts
 * Owner: Team Lead
 * Purpose: Confidence calibration: compute explainable, evidence-based confidence scores
 */

import { StorageFinding } from '../storage/run-store.js';
import { RepairProposalResult } from '../providers/provider.contract.js';
import { VerificationSuiteResult, CheckOutcome } from '../domain/verification.js';

export type ConfidenceTier = 'VERY_HIGH' | 'HIGH' | 'MODERATE' | 'LOW' | 'VERY_LOW';

export interface ConfidenceFactorBreakdown {
  name: string;
  weight: number;
  score: number;
  contribution: number;
  description: string;
}

export interface ConfidencePenalty {
  reason: string;
  deduction: number;
}

export interface ConfidenceEvaluation {
  /** Calibrated confidence score strictly clamped between 0.00 and 1.00 */
  finalScore: number;
  /** Categorical confidence tier */
  tier: ConfidenceTier;
  /** Detailed component factors and their mathematical contributions */
  factors: ConfidenceFactorBreakdown[];
  /** Applied deductions due to conflicting or missing signals */
  penalties: ConfidencePenalty[];
  /** Semantic warning flags */
  flags: string[];
  /** Human-readable explanation of why this score was awarded */
  explanation: string;
  /** Known limitations of the confidence metric */
  limitations: string[];
}

export interface CalibrationInput {
  finding?: Partial<StorageFinding>;
  repair?: Partial<RepairProposalResult>;
  verification?: Partial<VerificationSuiteResult> | CheckOutcome;
  rollbackFailed?: boolean;
}

/**
 * Standard limitations document for RepoGuard's evidence-based confidence score.
 */
export const CONFIDENCE_LIMITATIONS: readonly string[] = [
  'A passing test suite proves that existing regression tests passed, but does not guarantee absence of subtle edge-case bugs.',
  'AI self-reported confidence is untrusted and capped at a maximum 10% contribution.',
  'Unverified repairs (where tests were skipped or not run) are strictly capped below the VERY_HIGH threshold (max 0.65).',
  'Repairs with failed test runs or path validation errors receive severe penalties regardless of model claims.',
] as const;

/**
 * Safely clamps any numeric value to the interval [min, max].
 */
function clamp(val: number, min = 0, max = 1): number {
  if (Number.isNaN(val) || !Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

/**
 * Maps a numeric confidence score to its qualitative tier.
 */
export function getConfidenceTier(score: number): ConfidenceTier {
  if (score >= 0.85) return 'VERY_HIGH';
  if (score >= 0.7) return 'HIGH';
  if (score >= 0.5) return 'MODERATE';
  if (score >= 0.3) return 'LOW';
  return 'VERY_LOW';
}

/**
 * Calibrates an empirical, multi-factor confidence score for a finding and proposed repair.
 *
 * Weight Distribution:
 * - 40% Empirical Verification Outcome (test pass / fail / timeout)
 * - 30% Patch Structure & Path Safety (diff validity, containment, hunk focus)
 * - 20% Static Rule & Finding Evidence (presence of line numbers, evidence string)
 * - 10% AI Explanation Rationality (capped prior hypothesis)
 */
export function calibrateConfidence(input: CalibrationInput): ConfidenceEvaluation {
  const factors: ConfidenceFactorBreakdown[] = [];
  const penalties: ConfidencePenalty[] = [];
  const flags: string[] = [];

  const finding = input.finding ?? {};
  const repair = input.repair ?? {};

  // Normalize verification outcome
  let verificationOutcome: CheckOutcome = 'SKIPPED';
  if (typeof input.verification === 'string') {
    verificationOutcome = input.verification as CheckOutcome;
  } else if (input.verification?.overallOutcome) {
    verificationOutcome = input.verification.overallOutcome;
  } else if (input.verification?.passed !== undefined) {
    verificationOutcome = input.verification.passed ? 'PASSED' : 'FAILED';
  }

  // ==========================================
  // Factor 1: Static Finding Evidence (Weight: 0.20)
  // ==========================================
  let staticScore = 0.5; // Default baseline
  const hasLineRange = Boolean(finding.lineRange && finding.lineRange.start > 0);
  const hasEvidenceStr = Boolean(finding.evidence && finding.evidence.trim().length > 0);
  const hasExplanation = Boolean(finding.explanation && finding.explanation.trim().length > 5);

  if (hasLineRange && hasEvidenceStr) {
    staticScore = 1.0;
  } else if (hasLineRange || hasEvidenceStr) {
    staticScore = 0.75;
  } else {
    staticScore = 0.3;
    flags.push('MISSING_STATIC_EVIDENCE');
  }

  const staticWeight = 0.2;
  factors.push({
    name: 'Static Finding Evidence',
    weight: staticWeight,
    score: staticScore,
    contribution: Number((staticWeight * staticScore).toFixed(4)),
    description: hasLineRange && hasEvidenceStr
      ? 'Pinpointed line range and matching code evidence provided.'
      : 'Incomplete line coordinates or missing code evidence.',
  });

  // ==========================================
  // Factor 2: Patch Structure & Path Safety (Weight: 0.30)
  // ==========================================
  let patchScore = 0.0;
  const isDiffProvided = Boolean(repair.diff && repair.diff.trim().length > 10);
  const isValidDiff = repair.isValidDiff === true;
  const isSafePath = repair.isSafePath === true;

  if (isDiffProvided && isValidDiff && isSafePath) {
    // Reward minimal, focused hunks
    const hunkCount = (repair.diff?.match(/@@ -\d+/g) || []).length;
    if (hunkCount >= 1 && hunkCount <= 2) {
      patchScore = 1.0; // Clean, minimal surgical patch
    } else if (hunkCount > 2) {
      patchScore = 0.8; // Larger patch carries slightly more regression risk
    } else {
      patchScore = 0.9;
    }
  } else if (!isDiffProvided) {
    patchScore = 0.0;
    flags.push('MISSING_PATCH_DIFF');
  } else {
    patchScore = 0.2;
    if (!isValidDiff) flags.push('INVALID_DIFF_SYNTAX');
    if (!isSafePath) flags.push('UNSAFE_TARGET_PATH');
  }

  const patchWeight = 0.3;
  factors.push({
    name: 'Patch Structure & Path Safety',
    weight: patchWeight,
    score: patchScore,
    contribution: Number((patchWeight * patchScore).toFixed(4)),
    description: isDiffProvided && isValidDiff && isSafePath
      ? 'Unified diff is syntactically valid and safely contained in workspace.'
      : 'Diff is missing, invalid, or violates path safety boundaries.',
  });

  // ==========================================
  // Factor 3: Verification Outcome (Weight: 0.40 - Dominant)
  // ==========================================
  let verificationScore = 0.0;
  let verificationDesc = '';

  switch (verificationOutcome) {
    case 'PASSED':
      verificationScore = 1.0;
      verificationDesc = 'Automated verification check suite executed and PASSED cleanly (exit code 0).';
      break;
    case 'SKIPPED':
      verificationScore = 0.25; // Neutral baseline without penalty
      verificationDesc = 'Verification checks were not executed or skipped.';
      flags.push('UNVERIFIED_PATCH');
      break;
    case 'TIMED_OUT':
      verificationScore = 0.0;
      verificationDesc = 'Verification command timed out before completion.';
      penalties.push({ reason: 'Verification suite timed out', deduction: 0.3 });
      flags.push('VERIFICATION_TIMED_OUT');
      break;
    case 'ERROR':
      verificationScore = 0.0;
      verificationDesc = 'Verification check encountered process or configuration error.';
      penalties.push({ reason: 'Verification execution error', deduction: 0.25 });
      flags.push('VERIFICATION_ERROR');
      break;
    case 'FAILED':
    default:
      verificationScore = 0.0;
      verificationDesc = 'Verification check suite FAILED with non-zero exit code.';
      penalties.push({ reason: 'Verification test failure on modified code', deduction: 0.45 });
      flags.push('VERIFICATION_FAILED');
      break;
  }

  const verificationWeight = 0.4;
  factors.push({
    name: 'Empirical Verification Evidence',
    weight: verificationWeight,
    score: verificationScore,
    contribution: Number((verificationWeight * verificationScore).toFixed(4)),
    description: verificationDesc,
  });

  // ==========================================
  // Factor 4: AI Prior Hypothesis (Weight: 0.10 - Strictly Capped)
  // ==========================================
  const rawAiConf = repair.confidence ?? 0.5;
  const clampedAiConf = clamp(rawAiConf, 0, 1);
  const aiScore = hasExplanation ? clampedAiConf : clampedAiConf * 0.5;

  const aiWeight = 0.1;
  factors.push({
    name: 'AI Model Prior Hypothesis (Capped)',
    weight: aiWeight,
    score: aiScore,
    contribution: Number((aiWeight * aiScore).toFixed(4)),
    description: `AI model self-reported confidence of ${Math.round(clampedAiConf * 100)}% (strictly capped at 10% weight).`,
  });

  // ==========================================
  // Conflicting Evidence Detection
  // ==========================================
  if (clampedAiConf >= 0.8 && verificationOutcome === 'FAILED') {
    flags.push('CONFLICTING_AI_CLAIM_TEST_FAILED');
    penalties.push({
      reason: 'AI claimed high confidence but verification tests failed',
      deduction: 0.2,
    });
  }

  if (clampedAiConf >= 0.8 && !isValidDiff) {
    flags.push('CONFLICTING_AI_CLAIM_INVALID_DIFF');
    penalties.push({
      reason: 'AI claimed high confidence but generated an invalid unified diff',
      deduction: 0.2,
    });
  }

  // ==========================================
  // Final Score Aggregation & Invariants
  // ==========================================
  let rawTotal = factors.reduce((acc, f) => acc + f.contribution, 0);

  // Apply penalties
  const totalDeductions = penalties.reduce((acc, p) => acc + p.deduction, 0);
  rawTotal -= totalDeductions;

  // Invariant 1: If verification failed, confidence can never exceed 0.25 (VERY_LOW)
  if (verificationOutcome === 'FAILED') {
    rawTotal = Math.min(rawTotal, 0.25);
  }

  // Invariant 2: If patch is unverified (SKIPPED), confidence is capped at 0.65 (MODERATE max)
  if (verificationOutcome === 'SKIPPED') {
    rawTotal = Math.min(rawTotal, 0.65);
  }

  // Invariant 3: If diff is invalid or path unsafe, confidence is capped at 0.20
  if (!isValidDiff || !isSafePath) {
    rawTotal = Math.min(rawTotal, 0.2);
  }

  // Invariant 4: If rollback failed, workspace is in dirty/inconsistent state; cap confidence at 0.10
  if (input.rollbackFailed) {
    flags.push('ROLLBACK_FAILED');
    penalties.push({
      reason: 'Automatic rollback failed leaving workspace in unverified/inconsistent state',
      deduction: 0.5,
    });
    rawTotal = Math.min(rawTotal, 0.1);
  }

  const finalScore = Number(clamp(rawTotal, 0, 1).toFixed(2));
  const tier = getConfidenceTier(finalScore);

  const explanation = `Confidence calibrated at ${Math.round(finalScore * 100)}% (${tier}). ` +
    `Verification outcome: ${verificationOutcome}. ` +
    (penalties.length > 0 ? `Applied ${penalties.length} empirical penalty deductions. ` : 'No penalties incurred. ') +
    `AI self-reported prior: ${Math.round(clampedAiConf * 100)}%.`;

  return {
    finalScore,
    tier,
    factors,
    penalties,
    flags,
    explanation,
    limitations: [...CONFIDENCE_LIMITATIONS],
  };
}
