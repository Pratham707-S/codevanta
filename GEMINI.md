# RepoGuard — Gemini Workflow Constraints

Workflow instructions for Gemini assistant interactions in RepoGuard:

---

## 1. Scope Discipline
- Work strictly inside the `/Users/pratham/repoguard` workspace.
- Implement the smallest coherent change matching the assigned task.
- Do not invent speculative features or premature microservices.

## 2. Ownership & Authority
- Respect assigned module ownership:
  - **Team Lead:** CLI, domain contracts, application use cases, analysis orchestrator/agents, providers, shared utils.
  - **Pratham:** Repair orchestrator, patch parser/validator, approval gate, verification runner.
  - **Ayan:** Config schema/loading, storage/persistence, reporting, examples. *(Do NOT assign CLI ownership to Ayan).*
  - **Manni:** Repository discovery, file walking, ignore rules, context building, secret redaction.

## 3. Truthful Reporting
- Do not claim a command or module is operational until fully implemented and verified with tests.
- Clearly label future/deferred capabilities as `[Later]` or `TODO`.
