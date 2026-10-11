# Security Policy 🛡️

RepoGuard treats code security and developer trust as first-class architectural constraints. As a security and reliability analysis tool, RepoGuard itself must adhere to the highest standard of defensive engineering.

---

## 🚨 Reporting a Vulnerability

If you discover a security vulnerability in RepoGuard:
* **Do NOT create a public GitHub issue.**
* Please report it privately by contacting the core team or creating a private GitHub Security Advisory at [Pratham707-S/repoguard](https://github.com/Pratham707-S/repoguard/security/advisories).
* Provide detailed reproduction steps, potential impact, and system configuration.
* We commit to acknowledging receipt within 48 hours and providing a coordinated disclosure timeline.

---

## 🧱 Defensive Architecture Principles

RepoGuard is designed with defense-in-depth:

### 1. Secret Redaction Before AI Context Dispatch
Before any code context, AST snippet, or file slice is sent to an external AI model:
* Common secret patterns (API keys, private tokens, passwords, JWTs, connection URIs) are detected and replaced with redaction placeholders (`[REDACTED_SECRET]`).
* `.env` files, certificate files (`.pem`, `.key`), and credential stores are blocked at the scanner level.

### 2. Path Traversal & Disk Modification Protection
When generating or previewing repair proposals:
* File paths in proposed patches are sanitized to guarantee they resolve strictly within the repository root.
* Directory traversal (`../`) and absolute paths targeting system locations (`/etc/`, `/tmp`, user home) are strictly rejected.
* No file on disk is written or updated until the developer provides affirmative approval in the interactive prompt.

### 3. Verification Command Sandboxing & Timeouts
During the automated verification step (Milestone F):
* Only policy-approved, predefined checks (e.g., repository `test`, `typecheck`, or `build` scripts) are permitted.
* Arbitrary shell commands supplied by models or external input are rejected.
* Commands are executed with bounded timeouts to prevent infinite loops, deadlocks, or resource exhaustion.

### 4. Zero Remote Telemetry by Default
RepoGuard performs local operations without sending telemetry, repository statistics, or proprietary code to any third-party server without explicit user configuration and consent.
