/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/providers/schemas.ts
 * Owner: Team Lead
 * Purpose: Zod schemas and security validators for structured AI analysis and repair outputs
 */

import { z } from 'zod';
import { validatePatch, validateSafePath } from '../repair/patch-parser.js';

export const AIRepairResponseSchema = z.object({
  explanation: z.string().min(5, 'Explanation must be at least 5 characters'),
  rootCause: z.string().min(5, 'Root cause must be at least 5 characters'),
  suggestedFixDescription: z.string().min(5, 'Fix description must be at least 5 characters'),
  diff: z.string().min(10, 'Diff must contain valid unified diff content'),
  confidence: z.number().min(0).max(1).default(0.8),
});

export type AIRepairResponse = z.infer<typeof AIRepairResponseSchema>;

export const AIInvestigationResponseSchema = z.object({
  explanation: z.string().min(5, 'Explanation must be at least 5 characters'),
  rootCause: z.string().min(5, 'Root cause must be at least 5 characters'),
  suggestedMitigation: z.string().min(5, 'Mitigation must be at least 5 characters'),
  reproductionNotes: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.85),
});

export type AIInvestigationResponse = z.infer<typeof AIInvestigationResponseSchema>;

export interface RepairValidationResult {
  valid: boolean;
  data?: AIRepairResponse;
  errors: string[];
  isSafePath: boolean;
  isValidDiff: boolean;
}

/**
 * Extracts and parses a JSON object from raw LLM output, handling markdown code fences.
 */
export function extractJsonFromText(rawText: string): unknown {
  const trimmed = rawText.trim();

  // 1. Try direct JSON parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to block extraction
  }

  // 2. Extract from ```json ... ``` or ``` ... ``` code fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // Continue to object boundary search
    }
  }

  // 3. Fallback: Find outermost { ... }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // Failed to parse candidate
    }
  }

  throw new Error('Failed to locate or parse valid JSON from AI response');
}

/**
 * Validates untrusted AI repair output against strict Zod schema, unified diff syntax,
 * and repository boundary safety guards.
 */
export function validateAIRepairPayload(
  raw: unknown,
  targetFilePath: string,
  repoRoot?: string
): RepairValidationResult {
  const errors: string[] = [];

  // 1. Schema check
  const parseResult = AIRepairResponseSchema.safeParse(raw);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push(`Schema validation: ${issue.path.join('.') || 'root'}: ${issue.message}`);
    }
    return {
      valid: false,
      errors,
      isSafePath: false,
      isValidDiff: false,
    };
  }

  const data = parseResult.data;

  // 2. Path safety check on the target file
  const pathCheck = validateSafePath(targetFilePath, repoRoot);
  const isSafePath = pathCheck.safe;
  if (!pathCheck.safe) {
    errors.push(`Target path safety violation: ${pathCheck.error || targetFilePath}`);
  }

  // 3. Unified diff validation using RepoGuard's patch validator
  const patchCheck = validatePatch(data.diff, { repoRoot });
  const isValidDiff = patchCheck.valid;
  if (!patchCheck.valid) {
    errors.push(...patchCheck.errors.map((e) => `Diff validation: ${e}`));
  }

  return {
    valid: errors.length === 0,
    data: errors.length === 0 ? data : undefined,
    errors,
    isSafePath,
    isValidDiff,
  };
}
