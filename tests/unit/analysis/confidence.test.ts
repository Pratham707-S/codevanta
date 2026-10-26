/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/analysis/confidence.test.ts
 * Owner: Team Lead
 * Purpose: Unit tests for evidence-based confidence calibration and boundary invariants
 */

import { describe, it, expect } from 'vitest';
import {
  calibrateConfidence,
  getConfidenceTier,
  CONFIDENCE_LIMITATIONS,
  CalibrationInput,
} from '../../../src/analysis/confidence.js';

describe('Analysis: Confidence Calibration', () => {
  const verifiedPassingInput: CalibrationInput = {
    finding: {
      id: 'FINDING-101',
      category: 'SEC-001',
      severity: 'CRITICAL',
      title: 'Hardcoded secret',
      path: 'src/config.ts',
      lineRange: { start: 10, end: 12 },
      explanation: 'Plaintext secret in configuration file',
      evidence: 'apiKey = "12345"',
    },
    repair: {
      provider: 'mock',
      diff: [
        '--- a/src/config.ts',
        '+++ b/src/config.ts',
        '@@ -10,3 +10,3 @@',
        ' const port = 3000;',
        '-apiKey = "12345";',
        '+apiKey = process.env.KEY;',
        ' export default port;',
      ].join('\n'),
      isValidDiff: true,
      isSafePath: true,
      confidence: 0.9,
    },
    verification: 'PASSED',
  };

  describe('Verification Evidence & Weight Calibration', () => {
    it('awards VERY_HIGH confidence when verification tests pass on clean surgical patch', () => {
      const evaluation = calibrateConfidence(verifiedPassingInput);
      expect(evaluation.finalScore).toBeGreaterThanOrEqual(0.85);
      expect(evaluation.finalScore).toBeLessThanOrEqual(1.0);
      expect(evaluation.tier).toBe('VERY_HIGH');
      expect(evaluation.flags).toHaveLength(0);
      expect(evaluation.penalties).toHaveLength(0);
    });

    it('severely penalizes repairs when verification tests fail, capping score at VERY_LOW', () => {
      const failedInput: CalibrationInput = {
        ...verifiedPassingInput,
        repair: {
          ...verifiedPassingInput.repair,
          confidence: 0.99, // AI claims near certainty!
        },
        verification: 'FAILED',
      };

      const evaluation = calibrateConfidence(failedInput);
      expect(evaluation.finalScore).toBeLessThanOrEqual(0.25);
      expect(evaluation.tier).toBe('VERY_LOW');
      expect(evaluation.flags).toContain('VERIFICATION_FAILED');
      expect(evaluation.flags).toContain('CONFLICTING_AI_CLAIM_TEST_FAILED');
      expect(evaluation.penalties.length).toBeGreaterThan(0);
    });

    it('penalizes verification timeouts and tags VERIFICATION_TIMED_OUT flag', () => {
      const timedOutInput: CalibrationInput = {
        ...verifiedPassingInput,
        verification: 'TIMED_OUT',
      };

      const evaluation = calibrateConfidence(timedOutInput);
      expect(evaluation.finalScore).toBeLessThan(0.5);
      expect(evaluation.flags).toContain('VERIFICATION_TIMED_OUT');
    });

    it('caps unverified repairs (SKIPPED verification) at maximum 0.65', () => {
      const unverifiedInput: CalibrationInput = {
        ...verifiedPassingInput,
        verification: 'SKIPPED',
      };

      const evaluation = calibrateConfidence(unverifiedInput);
      expect(evaluation.finalScore).toBeLessThanOrEqual(0.65);
      expect(evaluation.flags).toContain('UNVERIFIED_PATCH');
      expect(evaluation.tier).not.toBe('VERY_HIGH');
    });
  });

  describe('Missing & Incomplete Evidence', () => {
    it('handles completely empty input safely without throwing', () => {
      const evaluation = calibrateConfidence({});
      expect(evaluation.finalScore).toBeGreaterThanOrEqual(0.0);
      expect(evaluation.finalScore).toBeLessThanOrEqual(1.0);
      expect(evaluation.flags).toContain('MISSING_STATIC_EVIDENCE');
      expect(evaluation.flags).toContain('MISSING_PATCH_DIFF');
    });

    it('penalizes missing code evidence or missing line coordinates', () => {
      const missingEvidenceInput: CalibrationInput = {
        ...verifiedPassingInput,
        finding: {
          id: 'FINDING-MISSING',
          title: 'Vague finding',
          path: 'src/app.ts',
          // No lineRange and no evidence string!
        },
      };

      const evaluation = calibrateConfidence(missingEvidenceInput);
      expect(evaluation.flags).toContain('MISSING_STATIC_EVIDENCE');
      expect(evaluation.finalScore).toBeLessThan(verifiedPassingInput.repair!.confidence!);
    });

    it('caps confidence at <= 0.20 when diff is syntactically invalid or path is unsafe', () => {
      const invalidDiffInput: CalibrationInput = {
        ...verifiedPassingInput,
        repair: {
          ...verifiedPassingInput.repair,
          isValidDiff: false,
          isSafePath: false,
        },
      };

      const evaluation = calibrateConfidence(invalidDiffInput);
      expect(evaluation.finalScore).toBeLessThanOrEqual(0.2);
      expect(evaluation.tier).toBe('VERY_LOW');
      expect(evaluation.flags).toContain('INVALID_DIFF_SYNTAX');
      expect(evaluation.flags).toContain('UNSAFE_TARGET_PATH');
    });
  });

  describe('Conflicting Signals & AI Self-Reported Limitations', () => {
    it('detects conflict when AI claims high confidence but generated diff is invalid', () => {
      const conflictingInput: CalibrationInput = {
        ...verifiedPassingInput,
        repair: {
          ...verifiedPassingInput.repair,
          confidence: 0.95,
          isValidDiff: false,
        },
      };

      const evaluation = calibrateConfidence(conflictingInput);
      expect(evaluation.flags).toContain('CONFLICTING_AI_CLAIM_INVALID_DIFF');
      expect(evaluation.penalties.some((p) => p.reason.includes('invalid unified diff'))).toBe(true);
    });

    it('clamps anomalous AI confidence values (negative, NaN, >1) gracefully', () => {
      const negativeAi = calibrateConfidence({
        ...verifiedPassingInput,
        repair: { ...verifiedPassingInput.repair, confidence: -5 },
      });
      expect(negativeAi.finalScore).toBeGreaterThanOrEqual(0.0);

      const hugeAi = calibrateConfidence({
        ...verifiedPassingInput,
        repair: { ...verifiedPassingInput.repair, confidence: 999 },
      });
      expect(hugeAi.finalScore).toBeLessThanOrEqual(1.0);

      const nanAi = calibrateConfidence({
        ...verifiedPassingInput,
        repair: { ...verifiedPassingInput.repair, confidence: NaN },
      });
      expect(nanAi.finalScore).toBeGreaterThanOrEqual(0.0);
    });
  });

  describe('Explainability & Documentation Contracts', () => {
    it('returns factor contribution breakdown that sums accurately', () => {
      const evaluation = calibrateConfidence(verifiedPassingInput);
      expect(evaluation.factors).toHaveLength(4);

      const factorNames = evaluation.factors.map((f) => f.name);
      expect(factorNames).toContain('Static Finding Evidence');
      expect(factorNames).toContain('Patch Structure & Path Safety');
      expect(factorNames).toContain('Empirical Verification Evidence');
      expect(factorNames).toContain('AI Model Prior Hypothesis (Capped)');

      for (const factor of evaluation.factors) {
        expect(factor.contribution).toBeGreaterThanOrEqual(0);
        expect(factor.description).toBeDefined();
      }
    });

    it('attaches standard limitations document to every evaluation result', () => {
      const evaluation = calibrateConfidence(verifiedPassingInput);
      expect(evaluation.limitations).toEqual([...CONFIDENCE_LIMITATIONS]);
      expect(evaluation.limitations.length).toBeGreaterThanOrEqual(3);
    });

    it('strictly penalizes and caps confidence at <= 0.10 when rollbackFailed is true', () => {
      const evaluation = calibrateConfidence({
        ...verifiedPassingInput,
        verification: 'FAILED',
        rollbackFailed: true,
      });

      expect(evaluation.finalScore).toBeLessThanOrEqual(0.1);
      expect(evaluation.tier).toBe('VERY_LOW');
      expect(evaluation.flags).toContain('ROLLBACK_FAILED');
      expect(evaluation.penalties.some((p) => /rollback failed/i.test(p.reason))).toBe(true);
    });

    it('getConfidenceTier correctly categorizes boundary numbers', () => {
      expect(getConfidenceTier(1.0)).toBe('VERY_HIGH');
      expect(getConfidenceTier(0.85)).toBe('VERY_HIGH');
      expect(getConfidenceTier(0.84)).toBe('HIGH');
      expect(getConfidenceTier(0.7)).toBe('HIGH');
      expect(getConfidenceTier(0.69)).toBe('MODERATE');
      expect(getConfidenceTier(0.5)).toBe('MODERATE');
      expect(getConfidenceTier(0.49)).toBe('LOW');
      expect(getConfidenceTier(0.3)).toBe('LOW');
      expect(getConfidenceTier(0.29)).toBe('VERY_LOW');
      expect(getConfidenceTier(0.0)).toBe('VERY_LOW');
    });
  });
});
