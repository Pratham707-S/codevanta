/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/repair/index.ts
 * Owner: Pratham
 * Purpose: Repair module public exports
 */

// Approval Gate
export {
  ApprovalGate,
  requestApproval,
  type ApprovalStatus,
  type ApprovalDecision,
  type ApprovalGateOptions,
  type PatchCandidate,
  type RiskLevel,
} from './approval-gate.js';

// Patch Parser & Path Validator
export {
  PatchParser,
  parseUnifiedDiff,
  validatePatch,
  validateSafePath,
  isPathSafe,
  stripDiffPath,
  type ParsedPatchFile,
  type DiffHunk,
  type DiffHunkHeader,
  type DiffLine,
  type DiffLineType,
  type PatchValidationResult,
  type PathValidationResult,
  type PatchParseOptions,
} from './patch-parser.js';

// Diff Preview & Generator
export {
  DiffPreviewer,
  renderDiffPreview,
  renderProposalPreview,
  generateUnifiedDiff,
  getDiffStats,
  formatDiffStats,
  type DiffPreviewOptions,
  type GenerateDiffOptions,
  type DiffStats,
  type FileDiffStats,
  type RepairProposalSummary,
} from './diff-preview.js';

// Patch Applicator
export {
  PatchApplicator,
  applyPatch,
  applyHunksToString,
  type PatchApplicationResult,
  type FilePatchResult,
  type PatchApplicatorOptions,
} from './patch-applicator.js';

// Repair Orchestrator
export {
  RepairOrchestrator,
  orchestrateRepair,
  type RepairWorkflowStatus,
  type RepairProposal,
  type RepairExecutionResult,
  type RepairOrchestratorOptions,
} from './repair-orchestrator.js';

