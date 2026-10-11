# RepoGuard 🛡️

> **Fix with evidence. Verify before trust.**
> *A CLI-first AI software reliability assistant engineered to inspect repositories safely, discover vulnerabilities with deterministic code evidence, propose reviewable patches, and verify fixes inside controlled workspaces.*

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square)](LICENSE)
[![Target Repository](https://img.shields.io/badge/Repository-Pratham707--S%2Frepoguard-blue?style=flat-square&logo=github)](https://github.com/Pratham707-S/repoguard)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Architecture](https://img.shields.io/badge/Architecture-Modular%20Monolith-orange?style=flat-square)](#-architecture--module-boundaries)
[![Test Suite](https://img.shields.io/badge/Tests-Vitest-yellow?style=flat-square&logo=vitest)](https://vitest.dev/)
[![Security](https://img.shields.io/badge/Security-Redaction%20%26%20Sandbox-red?style=flat-square)](#-security--safety-guardrails)

---

## 🧭 Overview & Core Vision

Developers today juggle scattered static analysis alerts, AI chat suggestions, test logs, and git diffs. A generated AI patch is **not proof** that code works; in fact, unverified patches frequently introduce subtle regressions.

**RepoGuard connects the entire reliability lifecycle into a single inspectable terminal workflow:**
1. **Discover** repository structure safely (read-only, skipping secrets and binary blobs).
2. **Investigate** bugs, security flaws, and performance bottlenecks backed by concrete line-level evidence.
3. **Propose** reviewable unified diffs without touching working files.
4. **Require** affirmative developer consent at an interactive approval gate.
5. **Verify** candidate patches inside an allowlisted, timed execution sandbox.
6. **Audit** outcomes truthfully (`PASSED`, `FAILED`, `TIMED_OUT`, `SKIPPED`) with zero hallucinations.

---

## ⚡ Workflow Pipeline

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

## 💎 The 15 Core Capabilities

RepoGuard is planned across 15 cohesive capabilities, progressing from a local CLI vertical slice to cross-repository intelligence:

| # | Capability | Phase | Description |
| :-: | :--- | :---: | :--- |
| **01** | **Repository / GitHub Ingestion** | `MVP` | Safe, read-only scanning of local projects; respects `.gitignore`, skips oversized (>1MB) and binary files. Pinned GitHub commit ingestion. |
| **02** | **Multi-Pass Investigation** | `MVP` | Targeted static rules and AI agents analyzing bugs, OWASP security vulnerabilities, and runtime performance bottlenecks. |
| **03** | **RAG & Persistent Memory** | `Next` | Bounded retrieval of historical fixes, architectural conventions, and relevant context snippets without prompt bloating. |
| **04** | **AI Repair Engineer** | `MVP` | Synthesizes precise unified diff patches bound to a specific finding, with changed-path lists and human-readable rationales. |
| **05** | **Sandbox Verification** | `MVP` | Executes allowlisted verification checks (`test`, `lint`, `typecheck`) in disposable workspaces with strict timeouts. Container isolation via Docker. |
| **06** | **Learn from Fix Outcomes** | `Next` | Records verified fixes and failed attempts, creating an empirical dataset of what works and what breaks. |
| **07** | **Authorized GitHub Pull Requests** | `Next` | Publishes tested, human-approved patches to GitHub pull requests using least-privilege GitHub Apps. |
| **08** | **Root-Cause Timeline** | `Next` | Chronologically links scan runs, findings, candidate diffs, verification logs, and commits into an audit trail. |
| **09** | **Regression & Side-Effect Prediction** | `Later` | Evaluates downstream dependency impact and recommends targeted regression test suites for candidate patches. |
| **10** | **Repository Knowledge Graph** | `Later` | AST-level symbol dependency graph mapping imports, calls, and module boundaries to quantify blast radius. |
| **11** | **Evidence-Based Repair Confidence** | `MVP` | Computes explainable confidence metrics from evidence coverage, AST alignment, and test outcomes—not model self-assessment. |
| **12** | **Human Approval Gate** | `Safety` | Non-negotiable confirmation gate. No file is ever modified on disk without explicit developer interactive approval. |
| **13** | **Future Bug Predictor** | `Later` | Statistical hotspot analysis correlating code churn, complexity, and historical defect density. |
| **14** | **Telemetry-Driven Rollback** | `Later` | Correlates operational alerts with recent releases to recommend automated, safe revert PRs. |
| **15** | **Cross-Repo Ripple Immunization** | `Vision` | Identifies vulnerability patterns resolved in Repo A and proactively recommends immunization patches in authorized connected Repos B & C. |

> [!NOTE]
> Capabilities marked `MVP` belong to the active development milestone. Capabilities marked `Next`, `Later`, and `Vision` are formally architected under `src/advanced/` and will be activated in sequence.

---

## 🖥️ CLI Experience & Commands

The developer's primary interface is the `repoguard` CLI:

```bash
# Initialize RepoGuard configuration in your repository
npx repoguard init

# Run safe repository scan and inventory supported files
npx repoguard scan

# Review high-signal findings with line-level evidence
npx repoguard review
npx repoguard findings --severity HIGH

# Generate reviewable patch proposal for a specific finding
npx repoguard fix FINDING-001

# Execute allowlisted checks in a controlled verification sandbox
npx repoguard test REPAIR-001

# Inspect real run records and audit summaries
npx repoguard status SCAN-001
npx repoguard config
```

---

## 🏛️ Architecture & Module Boundaries

RepoGuard is structured as a **Modular Monolith** in TypeScript, isolating core domain logic from terminal interfaces, AI vendors, and external APIs:

```
repoguard/
├── src/
│   ├── index.ts                           # Executable Composition Root (Team Lead)
│   ├── cli/                               # CLI Routing, Options & Terminal Formatter (Team Lead)
│   │   ├── commands/                      # init, scan, review, fix, test, status, config
│   │   ├── formatter.ts                   # Unified terminal colors, tables, and progress spinners
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
│       ├── memory/                        # Cross-repo vector memory & immunization
│       └── telemetry/                     # Audit event stream & rollback policy
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

## 👥 Four-Person Team Ownership

To guarantee velocity and zero merge collisions, all code is partitioned across explicit module boundaries:

| Member | Focus Area | Owned Code Modules | Core Responsibilities |
| :--- | :--- | :--- | :--- |
| **Team Lead** | CLI, Application, Domain & AI Analysis | `src/cli/`<br>`src/application/`<br>`src/domain/`<br>`src/analysis/`<br>`src/providers/`<br>`src/utils/` | CLI command routing (`commander`), shared Zod domain contracts, use-case pipelines, Google Gemini provider integration, static rule engine, and integration testing. |
| **Pratham** | Repair & Verification | `src/repair/`<br>`src/verification/`<br>`src/domain/repair/`<br>`src/domain/verification/` | Unified diff patch generation & validation, path traversal security, interactive developer approval prompt, controlled verification runner with timeouts, Docker container sandbox. |
| **Ayan** | Configuration, Storage & Reporting | `src/config/`<br>`src/storage/`<br>`src/report/`<br>`examples/`<br>`.repoguard/` | Configuration schema (`Zod`) & loader, local JSON state persistence, Markdown/JSON report builders, and example configurations. *(Note: CLI is owned by Team Lead).* |
| **Manni** | Repository Scanning & Context | `src/repository/`<br>`src/context/`<br>`src/domain/repository/` | Repository root detection, safe file walker (`.gitignore`, binary skips, >1MB limit), Git state reader, bounded context selection, and regex/entropy secret redaction. |

---

## 🔒 Security & Safety Guardrails

RepoGuard treats target repositories as **untrusted input**. Safety constraints are enforced at the architecture level:

1. **Zero Secret Leakage:** High-entropy tokens, passwords, private keys (`.pem`, `.key`), and `.env` files are automatically redacted into `[REDACTED_SECRET]` before any payload reaches an AI model provider.
2. **Path Traversal Guards:** All patch file targets are sanitized with [`src/utils/safe-path.ts`](src/utils/safe-path.ts). Relative path escapes (`../../etc/passwd`) and absolute target locations outside the project boundary are strictly blocked.
3. **Mandatory Approval Gate:** No proposed patch is ever applied automatically. Modifying disk requires explicit, interactive developer confirmation.
4. **Controlled Subprocess Execution:** AI models are never allowed to execute arbitrary shell commands. Verification commands are checked against a strict, predefined allowlist (e.g. `npm test`, `npm run lint`) and executed within bounded timeouts.
5. **Read-Only Scans:** The scan and review phases make zero modifications to the target repository.

---

## 🚀 Getting Started & Development Setup

### Prerequisites
- **Node.js:** `>= 22.0.0` (managed via [`.nvmrc`](.nvmrc))
- **npm:** `>= 10.0.0`
- **Git:** `>= 2.40.0`

### 1. Clone the Repository
```bash
git clone https://github.com/Pratham707-S/repoguard.git
cd repoguard
```

### 2. Configure Environment
```bash
# Switch to the supported Node.js version
nvm use 22

# Install dependencies (lockfile strictly synchronized)
npm install

# Copy local environment template
cp .env.example .env
```

### 3. Verify Local Build & Test Suite
```bash
# Type check all source files, tests, and scripts (strict TypeScript)
npm run typecheck

# Run linter
npm run lint

# Run Vitest test suite
npm test

# Build production bundle to dist/
npm run build
```

### 4. Working on an Assigned Module
All modules export clean public APIs through `index.ts` files, accessible via TypeScript path aliases:
```typescript
import { Finding, FindingSeverity } from '@repoguard/domain';
import { readSourceFile } from '@repoguard/repository';
import { redactSecrets } from '@repoguard/context';
import { GeminiAdapter } from '@repoguard/providers';
import { VerificationOrchestrator } from '@repoguard/verification';
```

---

## 📚 Documentation & Reference Guides

- 📐 **Architecture:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- 📖 **Interactive Master Guide:** [`docs/PROJECT_GUIDE.html`](docs/PROJECT_GUIDE.html)
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

## ⚖️ License & Governance

RepoGuard is released under the [Apache 2.0 License](LICENSE).
Contributions must adhere to the [Contributor Code of Conduct](CODE_OF_CONDUCT.md) and [Contributing Guidelines](CONTRIBUTING.md).
