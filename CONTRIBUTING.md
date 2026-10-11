# Contributing to RepoGuard 🤝

Thank you for contributing to **RepoGuard**. To maintain absolute safety, code quality, and clear architectural boundaries, all team members and contributors must follow these guidelines.

---

## 🔒 Mandatory Safety Rules

1. **No Destructive Operations:** Never run destructive Git commands (`git push --force`, history rewrites, deleting remote branches without confirmation).
2. **Never Commit Secrets:** Under no circumstances should API keys, tokens, `.env` files, credentials, or private configs be committed.
3. **No Arbitrary Command Execution:** Never execute arbitrary shell commands suggested by an AI model. Only strictly allowlisted verification commands may run.
4. **Never Auto-Apply Patches:** Model-generated code changes must require explicit interactive human review before modifying local files.
5. **Inspect Before Committing:** Always inspect `git status` and `git diff` before creating any commit.
6. **No Direct Default Branch Pushing:** All changes must go through a dedicated feature branch and pull request review.

---

## 👥 Team Module Ownership

To avoid merge collisions, modules are owned by specific team leads:

* **Pratham:** Repair workflow, patch validation, verification runner integration (`src/infrastructure/repair/`, `src/infrastructure/verifier/`).
* **Ayan:** CLI commands, configuration parsing, terminal output, and JSON formatting (`src/cli/`, `src/config/`).
* **Manni:** Repository discovery, safe file scanning, metadata extraction (`src/infrastructure/scanner/`).
* **Lead Architect:** AI provider contracts, prompt safety, Finding schema, test fixtures, integration coordination (`src/domain/`, `src/infrastructure/ai/`).

Before modifying files across module boundaries, coordinate with the respective owner and agree on shared TypeScript interfaces in `src/domain/`.

---

## 🌿 Branching & Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/<module-or-milestone-name>
   ```
2. Keep commits atomic, descriptive, and verified:
   ```bash
   git commit -m "feat(scanner): implement ignore rule parser for node_modules and .git"
   ```
3. Run local checks before pushing:
   - Typecheck: `npm run typecheck`
   - Linting: `npm run lint`
   - Test suite: `npm test`
4. Open a Pull Request against `main`. Every PR requires at least one peer approval before merging.

---

## 📐 Coding Standards

* **TypeScript Strictness:** Strict mode is enabled (`noImplicitAny`, `strictNullChecks`, etc.). Do not use `any` unless strictly justified and isolated.
* **Domain Isolation:** Pure domain entities and contracts (`src/domain/`) must have zero external runtime dependencies.
* **Test Coverage:** Every use-case, scanner rule, and validator must include corresponding automated unit/integration tests.
* **Truthful Statuses:** Never mask failures or report an unverified operation as successful.
