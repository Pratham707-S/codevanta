# RepoGuard Team Tasks & Ownership Matrix 👥

To ensure smooth parallel development, clean module boundaries, and no merge collisions, this document defines exact module ownership, shared contracts, and acceptance criteria for all team members.

---

## 🏛️ Team Roster & Module Ownership

| Member | Focus Area | Owned Code Directory | Primary Responsibilities |
| :--- | :--- | :--- | :--- |
| **Pratham** | Repair Workflow & Verification | `src/infrastructure/repair/`<br>`src/infrastructure/verifier/` | Patch generation, unified diff formatting, path traversal validation, human approval prompt, controlled verification runner with timeouts. |
| **Ayan** | CLI & Presentation | `src/cli/`<br>`src/config/` | CLI command routing, options parsing (`commander`), config loader, terminal styling, JSON output formatter, exit codes. |
| **Manni** | Scanner & Discovery | `src/infrastructure/scanner/` | Repository root detection, `.gitignore` parsing, binary/sensitive file exclusion, file size limits, project metadata extraction. |
| **Lead Architect** | Domain & AI Integration | `src/domain/`<br>`src/infrastructure/ai/`<br>`src/infrastructure/redaction/` | Core Zod schemas (`Finding`, `RepairProposal`), `AIProvider` interface, `MockAIProvider`, secret redaction filters, integration fixtures. |

---

## 📋 Task Specifications by Milestone

### Milestone A — CLI Foundation (Owner: Ayan | Reviewer: Lead Architect)
* **Objective:** Establish the executable CLI structure with subcommands and flag handling.
* **Files Owned:** `src/cli/**`, `src/config/**`
* **Dependencies:** Shared configuration types in `src/domain/config.ts`.
* **Acceptance Criteria:**
  - `repoguard --help` and `repoguard <cmd> --help` display formatted commands.
  - Returns exit code `0` on help/version, `2` on invalid flags or missing configuration.
  - Config loader correctly merges defaults with custom config flags.
* **Required Tests:** CLI integration tests checking flags, arguments, and exit codes.

---

### Milestone B — Safe Repository Scanning (Owner: Manni | Reviewer: Pratham)
* **Objective:** Traverse target repository safely without touching forbidden or sensitive files.
* **Files Owned:** `src/infrastructure/scanner/**`
* **Dependencies:** `Finding` contract in `src/domain/finding.ts`.
* **Acceptance Criteria:**
  - Correctly identifies repo root via `.git`.
  - Excludes `node_modules/`, `.git/`, binary files, and `.env*` files.
  - Skips files exceeding the size threshold (e.g., 1MB).
  - Strictly read-only; leaves all scanned files untouched.
* **Required Tests:** Unit tests against fixtures with nested directories, `.gitignore` files, and dummy binaries.

---

### Milestone C & D — Finding Schema & AI Investigation (Owner: Lead Architect | Reviewer: Ayan)
* **Objective:** Provide rock-solid domain schemas and decoupled AI analysis with mock support.
* **Files Owned:** `src/domain/**`, `src/infrastructure/ai/**`, `src/infrastructure/redaction/**`
* **Dependencies:** None (Domain layer is pure).
* **Acceptance Criteria:**
  - `Finding` schema validated via Zod with code snippet and line number validation.
  - `AIProvider` contract supports `analyzeFinding` and `generateRepair`.
  - `MockAIProvider` enables deterministic, network-free test runs.
  - Redaction filter strips API keys and credentials before prompt assembly.
* **Required Tests:** Redaction unit tests, schema validation tests, and mock provider integration tests.

---

### Milestone E & F — Repair Proposals & Verification (Owner: Pratham | Reviewer: Lead Architect)
* **Objective:** Safely generate patches, preview diffs, require approval, and run verified checks.
* **Files Owned:** `src/infrastructure/repair/**`, `src/infrastructure/verifier/**`
* **Dependencies:** `RepairProposal` and `VerificationResult` contracts in `src/domain/`.
* **Acceptance Criteria:**
  - Unified diff generated with exact line changes.
  - Reject patches attempting to write outside repository root (`../../`).
  - Terminal interactive prompt requires explicit approval (`[y/N]`) before applying patch.
  - Verifier executes only policy-allowed commands (`npm test`, `npm run lint`) within a configured timeout.
  - Status accurately reports `PASSED`, `FAILED`, or `TIMED_OUT`.
* **Required Tests:** Path traversal security tests, timeout tests, patch dry-run tests.

---

## 🤝 Protocol for Cross-Module Collaboration

1. **Shared Contracts First:** Before writing implementation code, all contracts in `src/domain/` must be agreed upon and typechecked.
2. **Mocking Dependencies:** Use interfaces and mock adapters (`MockScanner`, `MockAIProvider`) so team members can build and test in parallel without blocking each other.
3. **No Unilateral Schema Changes:** Any modification to `Finding` or `RepairProposal` requires an agreement review by the team.
