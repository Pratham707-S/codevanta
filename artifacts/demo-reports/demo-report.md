# 🛡️ RepoGuard Audit Report: repoguard

- **Scan Timestamp:** `2026-10-19T15:26:19.886Z`
- **Repository Root:** `C:\Users\Ayan Kundu\OneDrive\Desktop\Sheriyans AI school\Repogaurd\repoguard\fixtures\demo`
- **Files Scanned:** 2
- **Duration:** 49ms
- **Total Findings:** 4

## 📊 Executive Summary

| Severity | Count | Status |
| :--- | :--- | :--- |
| **CRITICAL** | 2 | 🚨 Immediate Action Required |
| **HIGH** | 1 | ⚠️ High Priority |
| **MEDIUM** | 1 | ⚡ Review Recommended |
| **LOW** | 0 | ✅ Clear |
| **INFO** | 0 | ✅ Clear |

## 🔍 Findings & Evidence Details

### 1. [CRITICAL] Hardcoded AWS Access Key ID

- **ID:** `SEC-001-patterns.example.txt-L2`
- **Category:** `Security / Hardcoded Secrets`
- **Location:** `patterns.example.txt` (L2-2)
- **Confidence Score:** `98%`

> **Analysis:** Recognizable AWS Access Key ID committed to source. Committed credentials allow persistent unauthorized cloud resource access. Move credentials to environment variables.

**Evidence:**
```
  1 | // SEC-001: Synthetic AWS-shaped value; this is not a credential.
> 2 | const awsAccessKey = "AKIA****************";
  3 | 
  4 | // SEC-002: Illustrates unsafe SQL construction; do not execute this sample.
```

### 2. [CRITICAL] Command Injection via Dynamic Shell Execution

- **ID:** `SEC-003-patterns.example.txt-L8`
- **Category:** `Security / Command Injection`
- **Location:** `patterns.example.txt` (L8-8)
- **Confidence Score:** `95%`

> **Analysis:** Shell command constructed with dynamic variables passed to exec(). An attacker can append shell operators (; | &&) to execute arbitrary commands. Use execFile() or spawn() with explicit argument arrays.

**Evidence:**
```
  6 | 
  7 | // SEC-003: Harmless fixed command text, included only as inert scanner input.
> 8 | exec(`echo ${userInput}`);
  9 | 
  10 | // SEC-004: Empty catch example, included only as inert scanner input.
```

### 3. [HIGH] Potential SQL Injection (Dynamic Query Concatenation)

- **ID:** `SEC-002-patterns.example.txt-L5`
- **Category:** `Security / SQL Injection`
- **Location:** `patterns.example.txt` (L5-5)
- **Confidence Score:** `92%`

> **Analysis:** Raw SQL query constructed via dynamic string concatenation or template literal. This pattern can allow attackers to manipulate query logic or extract data. Use parameterized queries ($1, ? or prepared statements).

**Evidence:**
```
  3 | 
  4 | // SEC-002: Illustrates unsafe SQL construction; do not execute this sample.
> 5 | const query = "SELECT * FROM users WHERE id = " + userId;
  6 | 
  7 | // SEC-003: Harmless fixed command text, included only as inert scanner input.
```

### 4. [MEDIUM] Empty Catch Block (Suppressed Exceptions)

- **ID:** `SEC-004-patterns.example.txt-L11`
- **Category:** `Reliability / Error Handling`
- **Location:** `patterns.example.txt` (L11-11)
- **Confidence Score:** `88%`

> **Analysis:** An empty catch block silently swallows runtime errors, concealing underlying bugs, failed I/O, or broken security assumptions. Log the exception or handle it explicitly.

**Evidence:**
```
  9 | 
  10 | // SEC-004: Empty catch example, included only as inert scanner input.
> 11 | try { operation(); } catch (error) {}
```

---
*Report generated autonomously by RepoGuard Software Reliability & Security Platform.*