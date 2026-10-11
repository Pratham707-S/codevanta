# RepoGuard Roadmap 🗺️

This document outlines the phased development plan for **RepoGuard**, starting with the core MVP milestones (A through F) and progressing toward long-term autonomous reliability capabilities.

---

## 🎯 Phase 1: MVP Milestones

The MVP prioritizes **safety, explainability, and a working end-to-end workflow** over implementing every speculative capability.

### Milestone A — CLI Foundation
- **Goal:** Robust, user-friendly command-line interface framework.
- **Deliverables:**
  - CLI entry point (`repoguard`) built with `commander`.
  - Comprehensive `--help` output with subcommands (`scan`, `investigate`, `repair`, `verify`).
  - Consistent error handling and UNIX-compliant exit codes (`0`, `1`, `2`).
  - Configuration loader and validator (e.g., `repoguard.config.json` or CLI flags).

### Milestone B — Safe Repository Scanning
- **Goal:** Safe, non-intrusive repository exploration.
- **Deliverables:**
  - Automatic repository root detection (via `.git` marker).
  - Respect for `.gitignore` and default exclusions (`node_modules/`, `.git/`, `dist/`).
  - Exclusion of binary files, sensitive paths (`.env`, `.pem`), and oversized files (>1MB).
  - Project metadata detection (package manager, language versions, test runner).
  - **Invariant:** Scan operations are strictly read-only.

### Milestone C — Evidence-Backed Findings
- **Goal:** High-signal diagnostic results with verifiable evidence.
- **Deliverables:**
  - Strict, validated `Finding` domain type (Zod schema).
  - Exact file location tracking (line numbers, code snippets, context blocks).
  - Rich terminal output (colored tables, badges) and machine-readable JSON output (`--format json`).
  - Strict rejection of malformed or unverified findings.

### Milestone D — AI Analysis & Investigation
- **Goal:** Decoupled AI provider integration with secret protection.
- **Deliverables:**
  - Clean `AIProvider` contract (`analyzeFinding`, `generateRepair`).
  - Fully functional `MockAIProvider` for reproducible unit and integration tests.
  - Secret redaction filter applied to all prompts and context windows.
  - Strict parsing and Zod validation of structured model responses.

### Milestone E — Repair Proposals & Approval
- **Goal:** Safe, human-in-the-loop remediation.
- **Deliverables:**
  - Unified diff patch generation for identified findings.
  - Path traversal validation (guarantee paths remain inside repo root).
  - Interactive terminal diff preview.
  - Mandatory confirmation prompt (`[y/N]`) before applying any changes to disk.

### Milestone F — Controlled Verification & Reporting
- **Goal:** Truthful, safe execution of test and verification suites.
- **Deliverables:**
  - Policy-approved check execution (`test`, `typecheck`, `lint`, `build`).
  - Process execution with wall-clock timeouts and signal termination (`SIGTERM`/`SIGKILL`).
  - Accurate status reporting: `PASSED`, `FAILED`, `TIMED_OUT`, `SKIPPED`, `NOT_RUN`.
  - Complete verification summary output with zero false claims.

---

## 🚀 Phase 2: Long-Term Capabilities (Post-MVP)

These features remain planned and will not be implemented until MVP milestones pass all acceptance tests:

1. **Docker Sandbox Verification:** Isolated containerized test execution preventing any host system side effects.
2. **Persistent AI Memory & Feedback Loop:** Recording verified successful vs. rejected repair patterns to continuously improve proposal accuracy.
3. **Authorized GitHub PR Automation:** Generating reviewable Pull Requests with complete investigation context via GitHub App tokens.
4. **Root-Cause Timelines:** Correlating Git blame and commit history to reconstruct when an issue was introduced.
5. **Cross-Repository Ripple Memory:** Identifying systemic issues across multiple micro-repos and recommending preventative patches.
6. **Repository Knowledge Graph:** Mapping dependencies, AST relationships, and call trees to predict side effects before applying code repairs.
