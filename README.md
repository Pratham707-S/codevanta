# RepoGuard

> **Fix with evidence. Verify before trust.**
> A CLI-first software reliability assistant that inspects repositories safely, discovers vulnerabilities with deterministic code evidence, proposes reviewable patches, and verifies fixes inside controlled sandboxes.

[![Hackathon](https://img.shields.io/badge/Hackathon-CodeNexus_India_2026-blueviolet?style=flat-square)](https://unstop.com/hackathons/codenexus-india-2026-national-hackathon-wecodecoders-1764747)
[![Platform](https://img.shields.io/badge/Platform-Unstop-blue?style=flat-square)](https://unstop.com/hackathons/codenexus-india-2026-national-hackathon-wecodecoders-1764747)
[![Track](https://img.shields.io/badge/Theme-AI_Developer_Reliability_%26_Security-success?style=flat-square)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Architecture](https://img.shields.io/badge/Architecture-Modular%20Monolith-orange?style=flat-square)](#architecture--directory-structure)
[![Test Suite](https://img.shields.io/badge/Tests-Vitest-yellow?style=flat-square&logo=vitest)](https://vitest.dev/)
[![Security](https://img.shields.io/badge/Security-Redaction%20%26%20Sandbox-red?style=flat-square)](#security--safety-guardrails)
[![License](https://img.shields.io/badge/License-Apache_2.0-lightgrey.svg?style=flat-square)](LICENSE)

---

**Project Context:** Built for the **CodeNexus India 2026 National Hackathon (WeCodeCoders)** on [Unstop](https://unstop.com/hackathons/codenexus-india-2026-national-hackathon-wecodecoders-1764747).
**Team:** Pratham, Team Lead, Ayan, Manni.

---

## Problem & Approach

### The Problem
Most AI coding assistants propose plausible-looking code suggestions without any empirical proof that the patch actually works:
1. **Unverified Patches Break Code:** Large language models routinely hallucinate fixes that pass casual visual review but fail edge cases or introduce regression bugs.
2. **Untrusted Command Execution:** Directly auto-executing model-generated commands on developer machines creates severe security risks (accidental deletions, untrusted network access, credential exposure).
3. **Fragmented Evidence:** Developers are forced to manually correlate compiler outputs, test logs, AI suggestions, and git diffs across multiple tools.

### The RepoGuard Approach
RepoGuard turns code analysis, patch synthesis, and sandboxed test execution into a continuous, verifiable workflow directly in the terminal:
- **Discovers** codebase structure using safe, read-only file traversal while filtering out secrets and binary files.
- **Investigates** bugs, security vulnerabilities, and performance bottlenecks backed by concrete line-level evidence.
- **Synthesizes** targeted unified diff patches without modifying the working tree.
- **Requires** explicit developer approval at an interactive confirmation gate before touching disk.
- **Verifies** candidate patches in an isolated execution sandbox using allowlisted checks with bounded timeouts.
- **Reports** truthful, empirical outcomes (`PASSED`, `FAILED`, `TIMED_OUT`) with zero fabricated assurances.

---

## Architecture Pipeline

```mermaid
flowchart LR
    subgraph Discovery ["1. Safe Ingestion"]
        A[Local Repository] -->|Walk & Filter| B[Scanner Engine]
        B -->|Redact Secrets| C[Bounded Context]
    end

    subgraph Intelligence ["2. AI & Static Analysis"]
        C --> D[Analysis Orchestrator]
        D -->|Model Adapter| E[Structured Findings]
    end

    subgraph Repair ["3. Human-in-the-Loop Repair"]
        E --> F[Patch Generator]
        F --> G[Unified Diff Preview]
        G --> H{Developer Approval}
    end

    subgraph Verification ["4. Controlled Verification"]
        H -- Approved --> I[Sandbox Runner]
        H -- Rejected --> J[Abort / Adjust]
        I -->|Allowlisted Checks| K[Truthful Report]
    end

    classDef stage fill:#121b2e,stroke:#2b3a56,stroke-width:1px,color:#eef3ff;
    class A,B,C,D,E,F,G,H,I,J,K stage;
```

---

## Quickstart & Evaluation Walkthrough

For hackathon evaluators testing the CLI workflow:

```bash
# 1. Launch Interactive Mode with animated ASCII branding and guided menu
npx repoguard

# 2. Run safe repository scan, secret redaction, and multi-pass analysis
npx repoguard scan

# 3. View previous scan summary, active findings, and empirical statistics
npx repoguard status

# 4. Generate structured HTML and Markdown audit reports
npx repoguard report --format html

# 5. Initialize a custom repoguard.config.json configuration
npx repoguard init
```

---

## 11 Core Capabilities & Implementation Status

The architecture is focused on **11 high-value capabilities**, prioritizing a dependable, evidence-backed vertical slice with verifiable code repairs:

| # | Capability | Status | Phase / Sprint | Primary Owner | Implementation Scope |
| :-: | :--- | :---: | :---: | :--- | :--- |
| **01** | **Repository / GitHub Ingestion** | `Implemented (Local)`<br>`Partial (Remote)` | MVP (Sprint 3) | Manni (Maan) | Safe, read-only scanning of local codebases; respects `.gitignore`, skips oversized (>1MB) and binary files (`src/repository/`). Remote GitHub diff ingestion staged. |
| **02** | **Multi-Pass Investigation** | `Implemented (Static)`<br>`Partial (Agents)` | MVP (Sprint 2) | Team Lead | Deterministic static AST security rules (SEC-001 - SEC-004) live (`src/analysis/rules/`). Multi-pass AI investigation agents staged. |
| **03** | **RAG & Persistent Memory** | `Planned` | Sprint 3 | Ayan + Lead | Bounded retrieval of historical fixes, conventions, and context snippets without prompt bloating (`src/advanced/memory/`). |
| **04** | **AI Repair Engineer** | `Partial (Engine Ready)` | MVP (Sprint 1) | Pratham + Lead | Unified diff parser, path traversal guard, and patch applicator live (`src/repair/`). Gemini patch synthesis prompt integration in progress. |
| **05** | **Sandbox Verification** | `Implemented (Subprocess)`<br>`Partial (Docker)` | MVP (Sprint 1) | Pratham | Executes allowlisted verification checks (`test`, `lint`, `typecheck`) in disposable subprocesses with strict timeouts live (`src/verification/`). Docker sandbox runner staged. |
| **06** | **Learn from Fix Outcomes** | `Planned` | Sprint 2 | Ayan + Pratham | Records verified fixes and failed attempts, creating an empirical dataset of what works and what breaks (`src/advanced/memory/success-failure-feedback.ts`). |
| **07** | **Authorized GitHub Pull Requests** | `Planned` | Sprint 3 | Team Lead + Pratham | Publishes tested, human-approved patches to GitHub pull requests using least-privilege GitHub Apps (`src/advanced/github/`). |
| **08** | **Root-Cause Timeline** | `Implemented (Basic)`<br>`Partial (Blame)` | Sprint 2 | Ayan + Manni | Chronologically links scan runs, findings, candidate diffs, and verification logs in reports (`src/report/evidence-timeline.ts`). Git blame lineage finishing. |
| **09** | **Evidence-Based Repair Confidence** | `Implemented (Static)`<br>`Partial (Dynamic)` | MVP (Sprint 1) | Team Lead + Pratham | Computes explainable confidence metrics from evidence coverage and rule certainty (`src/analysis/confidence.ts`). Dynamic verification weighting in progress. |
| **10** | **Human Approval Gate** | `Implemented` | Safety (Phase 2) | Pratham | Non-negotiable confirmation gate. No file is ever modified on disk without explicit developer interactive approval and diff preview (`src/repair/approval-gate.ts`). |
| **11** | **Cross-Repo Ripple Immunization** | `Planned` | Sprint 3 | Manni + Lead | Identifies vulnerability patterns resolved in Repo A and proactively recommends immunization patches in connected Repos B & C (`src/advanced/memory/`). |

### 🔮 Deferred Future Capabilities Roadmap

The following four capabilities were originally evaluated but are **strictly deferred from the active implementation scope** to ensure focus on shipping our rock-solid 11-feature core:
* **Regression & Side-Effect Prediction:** Downstream blast-radius evaluation across dependency trees.
* **Repository Knowledge Graph:** Full codebase symbol call/import graph representation.
* **Future Bug Predictor:** Statistical hotspot defect prediction correlating code churn and complexity.
* **Telemetry-Driven Rollback:** Production telemetry ingestion and automated revert PR creation.

> [!NOTE]
> Active advanced capabilities (`memory/`, `github/`, `background-jobs/`) are staged under [`src/advanced/`](src/advanced/).

---

## Team & Module Ownership

The project enforces strict modular monolith boundaries to ensure clean parallel development:

| Team Member | Role | Owned Modules | Core Responsibilities |
| :--- | :--- | :--- | :--- |
| **Team Lead** *(me)* | Architecture, CLI, Domain, AI Analysis & GitHub Integration | `src/cli/`<br>`src/application/`<br>`src/domain/`<br>`src/analysis/`<br>`src/providers/`<br>`src/advanced/github/`<br>`src/utils/` | System architecture, CLI command routing & terminal options (`commander`), shared domain contracts (`Zod`), multi-pass analysis agents & rule runner, Google Gemini model adapter, confidence calibration, authorized GitHub PR publisher, composition root. |
| **Pratham** | Repair Engine & Sandbox Verification | `src/repair/`<br>`src/verification/`<br>`src/domain/repair.ts`<br>`src/domain/verification.ts` | Unified diff generation, parsing, & application, path traversal security, interactive developer approval gate, allowlisted check runner with timeouts, and Docker sandbox adapter. |
| **Ayan** | Configuration, Storage, Reporting & Memory | `src/config/`<br>`src/storage/`<br>`src/report/`<br>`src/advanced/memory/`<br>`examples/`<br>`.repoguard/` | Configuration schema & loading (`repoguard.config.json`), local state & run persistence (`.repoguard/state`), Markdown, HTML & JSON audit report builders, evidence timeline visualization, and fix outcome feedback memory store. |
| **Manni (Maan)** | Repository Scanning, Context & Cross-Repo | `src/repository/`<br>`src/context/`<br>`src/domain/repository.ts` | Repository root detection, safe file traversal (`.gitignore`, binary skips, >1MB limit), Git state & blame reader, bounded context builder, regex/entropy secret redaction, and cross-repo discovery. |

---

## Security & Safety Guardrails

RepoGuard treats target codebases as untrusted input:

1. **Zero Secret Leakage:** High-entropy tokens, passwords, private keys (`.pem`, `.key`), and `.env` files are automatically redacted into `[REDACTED_SECRET]` before any payload reaches an AI model provider.
2. **Path Traversal Guards:** All patch file targets are sanitized with [`src/utils/safe-path.ts`](src/utils/safe-path.ts). Relative path escapes (`../../etc/passwd`) and absolute target locations outside the project boundary are strictly blocked.
3. **Mandatory Approval Gate:** No proposed patch is ever applied automatically. Modifying disk requires explicit, interactive developer confirmation.
4. **Controlled Subprocess Execution:** AI models are never allowed to execute arbitrary shell commands. Verification commands are checked against a strict, predefined allowlist (e.g. `npm test`, `npm run lint`) and executed within bounded timeouts.
5. **Read-Only Scans:** The scan and review phases make zero modifications to the target repository.

---

## Architecture & Directory Structure

```
repoguard/
├── src/
│   ├── index.ts                           # Executable Composition Root (Team Lead)
│   ├── cli/                               # CLI Routing, Options & Terminal Formatter (Team Lead)
│   │   ├── commands/                      # init, scan, review, fix, test, status, config
│   │   ├── formatter.ts                   # Unified terminal styling, tables, and progress spinners
│   │   └── options.ts                     # Command argument parsing & help formatting
│   ├── application/                       # Use Case Orchestration & Ports (Team Lead)
│   │   ├── use-cases/                     # ScanRepository, ReviewFindings, ProposeRepair, VerifyRepair
│   │   └── ports/                         # Scanner, AIProvider, PatchWriter, TestRunner interfaces
│   ├── domain/                            # Pure Domain Entities & Contracts (Shared / Team Lead)
│   │   ├── finding.ts                     # Finding entity, severity, status, evidence
│   │   ├── repair.ts                      # Repair proposal & unified diff models (Pratham)
│   │   ├── verification.ts                # Verification outcome classification (Pratham)
│   │   ├── repository.ts                  # Source file & repo metadata entities (Manni)
│   │   └── shared.ts                      # Result<T, E>, DomainError, Branded IDs
│   ├── repository/                        # Safe Repository Discovery & Traversal (Manni)
│   │   ├── discovery.ts                   # Root detection, language & build tools
│   │   ├── file-walker.ts                 # Safe walk respecting .gitignore & file size limits
│   │   ├── git-reader.ts                  # Git status, commit SHA & diff reader
│   │   └── metadata.ts                    # Manifest & lockfile parser
│   ├── context/                           # Context Assembly & Secret Redaction (Manni)
│   │   ├── context-builder.ts             # Token budgeting & relevance ranking
│   │   └── secret-redactor.ts             # Regex + entropy credential scrubber
│   ├── analysis/                          # Static & AI Analysis Engine (Team Lead)
│   │   ├── orchestrator.ts                # Request validation & normalizer
│   │   ├── agents/                        # Bug, security, and performance investigation agents
│   │   └── rules/                         # Deterministic static rule definitions & runner
│   ├── providers/                         # AI Model Provider Adapters (Team Lead)
│   │   ├── provider.contract.ts           # Unified provider interface & error taxonomy
│   │   ├── schemas.ts                     # Zod schemas for structured completion outputs
│   │   ├── gemini-adapter.ts              # Google Gemini API integration
│   │   └── mock-adapter.ts                # Deterministic test fixture adapter
│   ├── repair/                            # Safe Patch Proposal & Validation (Pratham)
│   │   ├── repair-orchestrator.ts         # Proposal coordination
│   │   ├── patch-parser.ts                # Unified diff parser & path traversal guard
│   │   ├── approval-gate.ts               # Interactive affirmative confirmation prompt
│   │   └── patch-applicator.ts            # Controlled diff application
│   ├── verification/                      # Controlled Process & Sandbox Runner (Pratham)
│   │   ├── verification-orchestrator.ts   # Check runner coordination
│   │   ├── check-runner.ts                # Subprocess runner with command allowlists & timeouts
│   │   ├── result-classifier.ts           # Truthful outcome taxonomy (PASSED/FAILED/TIMED_OUT)
│   │   └── sandbox/                       # Docker container sandbox runner & policy
│   ├── config/                            # Configuration Schema & Loading (Ayan)
│   │   ├── schema.ts                      # Zod schema for repoguard.config.json
│   │   └── loader.ts                      # Config loader with CLI & environment overrides
│   ├── storage/                           # Local Run & Finding Persistence (Ayan)
│   │   ├── state-store.ts                 # Local state manager (.repoguard/state)
│   │   └── run-store.ts                   # Scan run & finding records
│   ├── report/                            # Report Builders & Formatters (Ayan)
│   │   ├── report-builder.ts              # Markdown & JSON summary coordinator
│   │   └── markdown-report.ts             # Human-readable audit report generator
│   ├── utils/                             # Shared Core Utilities (Team Lead)
│   │   ├── logger.ts                      # Structured leveled logging
│   │   └── safe-path.ts                   # Path normalization & directory escape guards
│   └── advanced/                          # Staged Advanced Capabilities (Preserved)
│       ├── background-jobs/               # Redis & BullMQ asynchronous worker queues
│       ├── github/                        # Authorized GitHub App & PR publisher
│       └── memory/                        # Cross-repo vector memory & immunization
│
├── tests/
│   ├── unit/                              # Unit tests mapped 1:1 to module owners
│   ├── integration/                       # Scan pipeline, provider contract, repair verification
│   ├── security/                          # Secret redaction, path traversal, command blocking
│   ├── fixtures/                          # Clean, buggy, and vulnerable sample repos
│   └── helpers/                           # Mock providers, temporary repo factories, assertions
│
├── examples/                              # Annotated sample config, findings, and repair reports
└── .repoguard/                            # Runtime workspace cache and local state
```

---

## Getting Started

### Prerequisites
- **Node.js:** `>= 22.0.0` (see [`.nvmrc`](.nvmrc))
- **npm:** `>= 10.0.0`
- **Git:** `>= 2.40.0`

### Setup Commands
```bash
# 1. Clone repository
git clone https://github.com/Pratham707-S/repoguard.git
cd repoguard

# 2. Switch to Node 22 & install dependencies
nvm use 22
npm install

# 3. Setup local environment
cp .env.example .env

# 4. Run verification checks
npm run typecheck   # Typecheck TypeScript (strict mode)
npm run lint        # ESLint flat configuration
npm test            # Vitest suite
npm run build       # Build dist/ bundle
```

---

## Documentation Index

- 📖 **Interactive Master Guide:** [`docs/PROJECT_GUIDE.html`](docs/PROJECT_GUIDE.html)
- 📐 **Architecture Specification:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- 🗺️ **Roadmap & Milestones:** [`docs/ROADMAP.md`](docs/ROADMAP.md)
- 📋 **Team Tasks & Contracts:** [`docs/TEAM_TASKS.md`](docs/TEAM_TASKS.md)
- 🛡️ **Threat Model:** [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md)
- ⚙️ **Configuration Reference:** [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md)
- 💻 **CLI Reference:** [`docs/CLI_REFERENCE.md`](docs/CLI_REFERENCE.md)
- 🧪 **Testing Strategy:** [`docs/TESTING_STRATEGY.md`](docs/TESTING_STRATEGY.md)
- 🏛️ **ADR 0001 — Modular Monolith:** [`docs/ADR/0001-modular-monolith.md`](docs/ADR/0001-modular-monolith.md)
- 🏛️ **ADR 0002 — Provider Abstraction:** [`docs/ADR/0002-provider-abstraction.md`](docs/ADR/0002-provider-abstraction.md)
- 🏛️ **ADR 0003 — Safe Repair Workflow:** [`docs/ADR/0003-safe-repair-workflow.md`](docs/ADR/0003-safe-repair-workflow.md)
- 📘 **Runbook — Local Development:** [`docs/runbooks/local-development.md`](docs/runbooks/local-development.md)

---

## Hackathon Submission Details

- **Hackathon:** [CodeNexus India 2026 National Hackathon (WeCodeCoders)](https://unstop.com/hackathons/codenexus-india-2026-national-hackathon-wecodecoders-1764747)
- **Host Platform:** Unstop
- **Project:** RepoGuard
- **License:** [Apache 2.0](LICENSE)
