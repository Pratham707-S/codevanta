# RepoGuard Team Tasks & Skills Matrix 👥

To ensure smooth parallel development, clean module boundaries, and no merge collisions, this document defines exact module ownership, skills matrix, shared contracts, and acceptance criteria for all team members.

---

## 🏛️ Team Roster & Module Ownership

| Member | Focus Area | Owned Code Directory | Primary Responsibilities |
| :--- | :--- | :--- | :--- |
| **Team Lead** | Domain, Application, AI & Redaction | `src/domain/`<br>`src/application/`<br>`src/infrastructure/ai/`<br>`src/infrastructure/redaction/` | Core Zod schemas (`Finding`, `RepairProposal`), application orchestration use cases, `AIProvider` contract, `MockAIProvider`, secret redaction filters, integration coordination. |
| **Ayan** | CLI, Configuration & Output | `src/cli/`<br>`src/config/`<br>`src/output/` | CLI command routing, options parsing (`commander`), config loader, terminal styling, JSON output formatter, UNIX exit codes. |
| **Manni** | Scanner & Discovery | `src/infrastructure/scanner/` | Repository root detection, `.gitignore` parsing, binary/sensitive file exclusion, file size limits (>1MB), project metadata extraction. |
| **Pratham** | Repair Workflow & Verification | `src/infrastructure/repair/`<br>`src/infrastructure/verifier/` | Unified diff patch generation, path traversal validation, human approval prompt gate, controlled verification runner with timeouts. |

*(Note: `src/index.ts` is the composition root, jointly coordinated between the Team Lead and Ayan).*

---

## 🧠 Team Skills & Responsibilities Matrix

Skills are classified into three practical tiers:
* 🟢 **Must Know:** Essential prerequisites required before starting assigned tasks.
* 🟡 **Learn During Project:** Practical skills developed while building the MVP modules.
* 🔵 **Later / Advanced:** High-complexity capabilities strictly deferred until post-MVP phases.

---

### 1. Team Lead
* **Primary Role:** System Architect, Domain Custodian & Integration Coordinator
* **Owned Directories:** `src/domain/`, `src/application/`, `src/infrastructure/ai/`, `src/infrastructure/redaction/` *(and joint coordination of `src/index.ts`)*

#### Skills Breakdown
* 🟢 **Must Know:**
  * Advanced TypeScript: generics, mapped types, discriminated unions, and strict compiler enforcement (`strict: true`).
  * Zod schema definition, parsing, validation, and type inference (`z.infer<T>`).
  * Clean Architecture & Ports/Adapters: dependency injection, interface segregation, isolating domain from external I/O.
  * Git governance: branch protection, PR review standards, and merge conflict resolution.
* 🟡 **Learn During Project:**
  * Structured prompt construction and deterministic JSON schema enforcement for LLM providers.
  * Secret detection algorithms: high-entropy token analysis and regex matching for private credentials.
  * Mock adapter design in Vitest (`vi.fn()`, deterministic test fixtures).
  * Use-case pipeline orchestration connecting decoupled infrastructure adapters.
* 🔵 **Later / Advanced:**
  * Vector database integration and persistent retrieval-augmented generation (RAG).
  * Abstract Syntax Tree (AST) repository knowledge graph construction.
  * Multi-turn autonomous agent negotiation and self-reflection loops.

#### Expected Deliverables & Tests
* `src/domain/**`: Canonical types and Zod schemas (`Finding`, `RepairProposal`, `VerificationResult`, `IScanner`, `IAIProvider`, `IRedactor`, `IVerifier`).
* `src/application/**`: 4 orchestration use cases (`ScanRepositoryUseCase`, `InvestigateFindingUseCase`, `ProposeRepairUseCase`, `VerifyRepairUseCase`).
* `src/infrastructure/ai/**`: `MockAIProvider`, prompt builders, response validators.
* `src/infrastructure/redaction/**`: Regex and entropy secret sanitization adapter.
* **Tests Owned:** `tests/unit/domain/**`, `tests/unit/application/**`, `tests/unit/ai/**`, `tests/unit/redaction/**`, `tests/security/secret-leakage.test.ts`.

#### Dependencies on Others
* **Ayan:** For CLI command wiring and config options in `src/index.ts`.
* **Manni:** For file scanner adapter contract adherence (`IScanner`).
* **Pratham:** For repair and verification runner contract adherence (`IVerifier`, `IRepairEngine`).

#### Readiness Checklist
- [ ] TypeScript strict mode compiler options and Zod installed.
- [ ] Domain contracts published and typechecked without errors.
- [ ] `MockAIProvider` emits deterministic test fixtures offline.
- [ ] Secret redaction engine successfully replaces sample test keys with `[REDACTED_SECRET]`.

---

### 2. Ayan
* **Primary Role:** CLI, Configuration & Presentation Engineer
* **Owned Directories:** `src/cli/`, `src/config/`, `src/output/` *(and joint coordination of `src/index.ts`)*

#### Skills Breakdown
* 🟢 **Must Know:**
  * Node.js CLI runtime basics: `process.argv`, standard streams (`stdout`, `stderr`), and process exit codes.
  * CLI option and argument parsing using `commander`.
  * JSON serialization, deserialization, and safe error trapping in TypeScript.
  * Basic Git workflow: feature branches, atomic commits, pull requests.
* 🟡 **Learn During Project:**
  * Terminal UI styling and syntax highlighting using `picocolors` or `chalk`.
  * Configuration resolution: searching working directories, merging CLI flags with config files, and validating via Zod.
  * POSIX signal handling (`SIGINT`, `SIGTERM`) and standard UNIX exit code conventions (`0` success, `1` finding/failure, `2` configuration error).
  * Writing CLI unit tests in Vitest by mocking process streams and testing flag combinations.
* 🔵 **Later / Advanced:**
  * Rich terminal UI frameworks (e.g., Ink / terminal canvas components).
  * Shell autocompletion script generation (Bash, Zsh, Fish).
  * Real-time streaming spinners and multi-progress bars for concurrent background tasks.

#### Expected Deliverables & Tests
* `src/cli/**`: Command routing (`scan`, `investigate`, `repair`, `verify`), argument validation, `--help` formatting.
* `src/config/**`: `config.schema.ts`, `config.loader.ts`, fallback defaults.
* `src/output/**`: `terminal.formatter.ts` (tables, diff coloring, badges), `json.formatter.ts` (strict JSON output).
* **Tests Owned:** `tests/unit/cli/**`, `tests/unit/config/**`, `tests/unit/output/**`.

#### Dependencies on Others
* **Team Lead:** For domain result types (`Finding`, `RepairProposal`, `VerificationResult`) and application use-case instances to trigger.

#### Readiness Checklist
- [ ] `commander` boots cleanly and outputs formatted `--help` for all subcommands.
- [ ] Configuration loader handles missing files by falling back to safe defaults.
- [ ] Output formatter renders sample mock findings both in styled terminal colors and valid JSON.
- [ ] CLI exits with correct UNIX exit codes under both successful and erroneous invocations.

---

### 3. Manni
* **Primary Role:** Repository Discovery & Scanner Engineer
* **Owned Directories:** `src/infrastructure/scanner/`, `tests/fixtures/sample-repos/`

#### Skills Breakdown
* 🟢 **Must Know:**
  * Node.js `fs/promises` and `path` APIs (`readdir`, `stat`, `join`, `relative`, path normalization).
  * Recursive directory traversal and basic file filtering.
  * TypeScript fundamentals: interfaces, async/await, error handling.
  * Basic Git operations.
* 🟡 **Learn During Project:**
  * Parsing and evaluating `.gitignore` rules using standard packages (e.g., `ignore`).
  * Binary file detection (inspecting buffer byte sequences / null-byte checks) to prevent reading non-text files.
  * File size threshold guards (skipping files > 1MB) and memory-efficient streaming.
  * Extracting repository metadata (`package.json`, lockfiles, language configurations).
  * Setting up isolated test fixtures containing dummy git repositories.
* 🔵 **Later / Advanced:**
  * AST (Abstract Syntax Tree) parsing (using Babel parser or `ts-morph`) for semantic code inspection.
  * Git blame extraction and historical commit diff traversal for root-cause analysis.
  * Incremental scanning using filesystem file-watchers (`chokidar`).

#### Expected Deliverables & Tests
* `src/infrastructure/scanner/file-walker.ts`: Safe recursive traversal with size and binary guards.
* `src/infrastructure/scanner/ignore-rules.ts`: `.gitignore` and default folder exclusion engine.
* `src/infrastructure/scanner/metadata-detector.ts`: Project toolchain and metadata identification.
* `src/infrastructure/scanner/safe-scanner.adapter.ts`: Concrete implementation of `IScanner`.
* **Tests Owned:** `tests/unit/scanner/**` testing empty directories, nested ignore files, binary files, and oversized files.

#### Dependencies on Others
* **Team Lead:** For the `IScanner` port interface and `Finding` schema in `src/domain/`.

#### Readiness Checklist
- [ ] File walker traverses a directory fixture and produces normalized relative paths.
- [ ] `.git/`, `node_modules/`, and `.env*` files are strictly excluded from scan results.
- [ ] Binary files and files exceeding 1MB are safely skipped without process crashes.
- [ ] Verified invariant: file walker operates in 100% read-only mode with zero file writes.

---

### 4. Pratham
* **Primary Role:** Repair Workflow & Verification Engineer
* **Owned Directories:** `src/infrastructure/repair/`, `src/infrastructure/verifier/`

#### Skills Breakdown
* 🟢 **Must Know:**
  * Node.js `child_process` execution (`spawn`, `execFile`) and child process lifecycle management.
  * Unified diff formatting conventions (`---`, `+++`, `@@ -l,s +l,s @@`).
  * Path manipulation and directory traversal risks (`path.resolve`, `../` escaping attacks).
  * TypeScript asynchronous programming and exception handling.
* 🟡 **Learn During Project:**
  * Programmatic diff generation and patch validation using standard diff libraries (e.g., `diff`).
  * Path traversal security guards ensuring proposed patches cannot write outside the repository root.
  * Interactive CLI confirmation prompts (`[y/N]`) using Node.js `readline` / `@clack/prompts`.
  * Child process execution with strict wall-clock timers and signal termination (`SIGTERM` / `SIGKILL`).
  * Accurate exit-code status classification: mapping outcomes to `PASSED`, `FAILED`, `TIMED_OUT`, `SKIPPED`.
* 🔵 **Later / Advanced:**
  * Docker containerization and sandbox execution for isolating untrusted verification commands.
  * Multi-file atomic patch transactions with automatic rollback on partial application failure.
  * Git worktree isolation for testing patches in isolated temporary working trees.

#### Expected Deliverables & Tests
* `src/infrastructure/repair/diff-generator.ts`: Unified diff formatter.
* `src/infrastructure/repair/path-validator.ts`: Path sanitizer blocking directory traversal attempts.
* `src/infrastructure/repair/approval-gate.ts`: Interactive human confirmation gate.
* `src/infrastructure/verifier/process-runner.ts`: Controlled child process executor with timeouts.
* `src/infrastructure/verifier/policy-evaluator.ts`: Allowlist check validator (`test`, `lint`, `typecheck`).
* `src/infrastructure/verifier/status-classifier.ts`: Truthful result classifier.
* **Tests Owned:** `tests/unit/repair/**`, `tests/unit/verifier/**`, `tests/security/path-traversal.test.ts`, `tests/security/command-injection.test.ts`.

#### Dependencies on Others
* **Team Lead:** For `RepairProposal`, `Patch`, `VerificationResult`, `IVerifierRunner` interfaces in `src/domain/`.
* **Ayan:** For formatting diff previews in terminal output prior to the approval gate prompt.

#### Readiness Checklist
- [ ] Path validator strictly rejects patches attempting to write to `../../` or absolute system paths.
- [ ] Interactive approval prompt halts execution until explicit affirmative user consent is given.
- [ ] Process runner executes allowed commands and terminates cleanly when exceeding configured timeouts.
- [ ] Status classifier accurately maps exit codes to `PASSED`, `FAILED`, `TIMED_OUT` with zero false passes.

---

## 🤝 Protocol for Cross-Module Collaboration

1. **Shared Contracts First:** Before writing implementation code, all contracts in `src/domain/` must be agreed upon and typechecked.
2. **Mocking Dependencies:** Use interfaces and mock adapters (`MockScanner`, `MockAIProvider`) so team members can build and test in parallel without blocking each other.
3. **No Unilateral Schema Changes:** Any modification to `Finding` or `RepairProposal` requires an agreement review by the team.
4. **No Direct Default Branch Pushing:** Feature branches and peer-reviewed pull requests are strictly required.
