/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/providers/gemini-adapter.ts
 * Owner: Team Lead
 * Purpose: Google Gemini LLM provider adapter with strict schema enforcement
 */

import {
  IAIProvider,
  InvestigationResult,
  RepairProposalResult,
  ProviderConfigurationError,
  ProviderExecutionError,
  ProviderValidationError,
} from './provider.contract.js';
import { SanitizedPromptContext } from '../context/context-builder.js';
import {
  extractJsonFromText,
  validateAIRepairPayload,
  AIInvestigationResponseSchema,
} from './schemas.js';

export interface GeminiAdapterOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  repoRoot?: string;
  baseUrl?: string;
}

export class GeminiAdapter implements IAIProvider {
  public readonly name = 'gemini';
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly repoRoot?: string;
  private readonly baseUrl: string;

  constructor(options: GeminiAdapterOptions = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    this.model = options.model || 'gemini-1.5-flash';
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.repoRoot = options.repoRoot;
    this.baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  }

  private getEffectiveApiKey(): string {
    const key = this.apiKey || process.env.GEMINI_API_KEY;
    if (!key || key.trim() === '') {
      throw new ProviderConfigurationError(
        'GEMINI_API_KEY is not configured in environment or options. Cannot communicate with Gemini provider.',
        this.name
      );
    }
    return key.trim();
  }

  public async isAvailable(): Promise<boolean> {
    const key = this.apiKey || process.env.GEMINI_API_KEY;
    return Boolean(key && key.trim().length > 0);
  }

  /**
   * Dispatches a prompt to the Google Gemini API with timeout and error handling.
   */
  private async callGeminiApi(prompt: string, systemInstruction?: string): Promise<string> {
    const key = this.getEffectiveApiKey();
    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(key)}`;

    const bodyPayload: Record<string, unknown> = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    };

    if (systemInstruction) {
      bodyPayload.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'RepoGuard-Agent/0.1.3',
        },
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ProviderExecutionError(
        `Gemini API network request failed: ${message}`,
        this.name
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      if (response.status === 401 || response.status === 403) {
        throw new ProviderConfigurationError(
          `Gemini API authorization failed (${response.status}): Invalid API key or insufficient permissions.`,
          this.name
        );
      }
      throw new ProviderExecutionError(
        `Gemini API returned error status ${response.status}: ${errorText}`,
        this.name,
        response.status,
        errorText
      );
    }

    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const textPart = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textPart) {
      throw new ProviderExecutionError(
        'Gemini API returned an empty or malformed candidate response.',
        this.name,
        response.status
      );
    }

    return textPart;
  }

  public async generateInvestigation(context: SanitizedPromptContext): Promise<InvestigationResult> {
    const finding = context.finding;
    const prompt = [
      `Analyze the following vulnerability finding in repository code and explain its root cause:`,
      context.formattedPromptContext,
      '',
      `Respond ONLY in valid JSON matching this exact structure:`,
      `{`,
      `  "explanation": "Detailed explanation of the flaw",`,
      `  "rootCause": "Direct root cause mechanism",`,
      `  "suggestedMitigation": "Specific steps or pattern to remediate safely",`,
      `  "reproductionNotes": "How to verify reproduction",`,
      `  "confidence": 0.85`,
      `}`,
    ].join('\n');

    const rawResponse = await this.callGeminiApi(
      prompt,
      'You are RepoGuard AI Security Analyst. Analyze findings objectively without hallucinating.'
    );

    let parsedJson: unknown;
    try {
      parsedJson = extractJsonFromText(rawResponse);
    } catch {
      throw new ProviderValidationError(
        'Gemini investigation response did not contain parseable JSON.',
        this.name
      );
    }

    const validation = AIInvestigationResponseSchema.safeParse(parsedJson);
    if (!validation.success) {
      const errors = validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      throw new ProviderValidationError(
        'Gemini investigation response failed schema validation.',
        this.name,
        errors
      );
    }

    const data = validation.data;
    return {
      provider: this.name,
      model: this.model,
      findingId: finding.id,
      explanation: data.explanation,
      rootCause: data.rootCause,
      reproductionNotes: data.reproductionNotes,
      suggestedMitigation: data.suggestedMitigation,
      confidence: data.confidence,
      timestamp: new Date().toISOString(),
    };
  }

  public async generateRepair(context: SanitizedPromptContext): Promise<RepairProposalResult> {
    const finding = context.finding;
    const targetFile = finding.path;

    const prompt = [
      `Synthesize an exact, safe remediation patch for the following vulnerability finding:`,
      context.formattedPromptContext,
      '',
      `CRITICAL REQUIREMENTS:`,
      `1. You must provide a valid unified diff with standard headers:`,
      `   --- a/${targetFile}`,
      `   +++ b/${targetFile}`,
      `   @@ -start,lines +start,lines @@`,
      `2. Include 1-2 lines of unchanged surrounding context.`,
      `3. Do NOT invent new file paths or escape the directory.`,
      `4. Respond ONLY with valid JSON with these keys:`,
      `{`,
      `  "explanation": "Why this change is needed",`,
      `  "rootCause": "Underlying defect",`,
      `  "suggestedFixDescription": "Summary of proposed fix",`,
      `  "diff": "--- a/${targetFile}\\n+++ b/${targetFile}\\n@@ ... @@\\n...",`,
      `  "confidence": 0.85`,
      `}`,
    ].join('\n');

    const rawResponse = await this.callGeminiApi(
      prompt,
      'You are RepoGuard AI Repair Engineer. Produce minimal, correct, syntax-valid unified diffs.'
    );

    let parsedJson: unknown;
    try {
      parsedJson = extractJsonFromText(rawResponse);
    } catch {
      throw new ProviderValidationError(
        'Gemini repair response did not contain parseable JSON.',
        this.name
      );
    }

    const validation = validateAIRepairPayload(parsedJson, targetFile, this.repoRoot);
    if (!validation.valid || !validation.data) {
      throw new ProviderValidationError(
        'Gemini repair proposal failed schema or unified diff validation.',
        this.name,
        validation.errors
      );
    }

    const data = validation.data;
    return {
      provider: this.name,
      model: this.model,
      findingId: finding.id,
      targetFilePath: targetFile,
      description: data.suggestedFixDescription,
      rootCause: data.rootCause,
      diff: data.diff,
      confidence: data.confidence,
      isValidDiff: validation.isValidDiff,
      isSafePath: validation.isSafePath,
      validationErrors: validation.errors.length > 0 ? validation.errors : undefined,
      timestamp: new Date().toISOString(),
    };
  }
}
