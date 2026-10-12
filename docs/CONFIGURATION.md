# RepoGuard Configuration Reference ⚙️

> **Owner:** Ayan (Configuration, Storage & Reporting)  
> **Status:** Production-Ready (Milestone A)  
> **Schema Definition:** [`src/config/schema.ts`](../src/config/schema.ts)

RepoGuard uses a cascading configuration system that combines file-based settings, environment variables, CLI flag overrides, and built-in safe defaults.

---

## 🏛️ Configuration Precedence Order

Settings are resolved in the following order of precedence (highest priority wins):

```
1. CLI Flag Overrides          (e.g., --timeout 45000, --provider mock)
       ▲
2. Environment Variables       (e.g., REPOGUARD_TIMEOUT_MS=45000)
       ▲
3. Local Configuration File    (e.g., repoguard.config.json or .repoguard/config.json)
       ▲
4. Safe Defaults               (DEFAULT_CONFIG defined in src/config/schema.ts)
```

---

## 📁 Configuration File Discovery

When `loadConfig()` is invoked without an explicit file path, RepoGuard searches upward from the target working directory for the first matching configuration file:

1. `repoguard.config.json`
2. `.repoguard/config.json`
3. `.repoguardrc.json`
4. `.repoguardrc`

Alternatively, you can pass an explicit configuration file via the `--config <path>` CLI option or the `REPOGUARD_CONFIG_PATH` environment variable.

---

## 📋 Configuration File Schema

Below is an annotated example of a complete `repoguard.config.json` file:

```json
{
  "$schema": "./node_modules/repoguard/dist/config/config.schema.json",
  "version": "1.0.0",

  "project": {
    "name": "my-service",
    "root": ".",
    "exclude": [
      "node_modules/**",
      "dist/**",
      ".git/**",
      "coverage/**",
      "**/*.min.js"
    ]
  },

  "scan": {
    "maxFileSize": 1048576,
    "redactSecrets": true,
    "includePatterns": []
  },

  "verification": {
    "timeoutMs": 30000,
    "allowedCommands": [
      "npm test",
      "npm run lint",
      "npm run typecheck"
    ]
  },

  "storage": {
    "stateDir": ".repoguard/state",
    "reportsDir": ".repoguard/reports",
    "cacheDir": ".repoguard/cache"
  },

  "ai": {
    "provider": "gemini",
    "model": "gemini-2.5-pro"
  }
}
```

---

## ⚙️ Schema Keys & Field Details

### `project`
| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `name` | `string` | `"repoguard-project"` | Human-readable identifier for the target codebase. |
| `root` | `string` | `process.cwd()` | Target directory root. Relative paths are normalized against working directory. |
| `exclude` | `string[]` | Standard excludes | Glob patterns to ignore during file discovery in addition to `.gitignore`. |

### `scan`
| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `maxFileSize` | `number` | `1048576` (1MB) | Maximum file size in bytes to inspect. Files exceeding this are skipped safely. |
| `redactSecrets`| `boolean` | `true` | Scans and scrubs high-entropy tokens, passwords, and private keys before AI processing. |
| `includePatterns` | `string[]` | `[]` | Optional whitelist patterns to restrict scans to specific subtrees or extensions. |

### `verification`
| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `timeoutMs` | `number` | `30000` (30s) | Hard wall-clock timeout for each verification command subprocess. |
| `allowedCommands` | `string[]` | `["npm test", "npm run lint", "npm run typecheck"]` | Strict allowlist of commands permitted to run in the verification sandbox. |

### `storage`
| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `stateDir` | `string` | `".repoguard/state"` | Directory storing local run state and scan sessions. |
| `reportsDir` | `string` | `".repoguard/reports"` | Directory where audit Markdown and JSON reports are saved. |
| `cacheDir` | `string` | `".repoguard/cache"` | Cache directory for intermediary analysis artifacts. |

### `ai`
| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `provider` | `'gemini' \| 'mock'` | `"gemini"` | AI provider implementation adapter. |
| `model` | `string` | `"gemini-2.5-pro"` | Target model identifier. |
| `apiKey` | `string` | `undefined` | Optional API key (prefer injecting via `GEMINI_API_KEY` environment variable). |

---

## 🔐 Environment Variables

| Variable | Description |
| :--- | :--- |
| `REPOGUARD_CONFIG_PATH` | Explicit path to a `repoguard.config.json` file. |
| `REPOGUARD_TIMEOUT_MS` | Overrides `verification.timeoutMs` (integer in milliseconds). |
| `REPOGUARD_MAX_FILE_SIZE` | Overrides `scan.maxFileSize` (integer in bytes). |
| `REPOGUARD_REDACT_SECRETS` | Set to `"false"` to disable secret redaction (not recommended). |
| `REPOGUARD_AI_PROVIDER` | Overrides `ai.provider` (`gemini` or `mock`). |
| `REPOGUARD_AI_MODEL` | Overrides `ai.model`. |
| `GEMINI_API_KEY` | Google Gemini API credentials. |

---

## 💻 Programmatic Usage

```typescript
import { loadConfig, validateConfig, DEFAULT_CONFIG } from './config/index.js';

// 1. Load configuration with cascading discovery and CLI overrides
const config = await loadConfig({
  cwd: process.cwd(),
  cliOverrides: {
    timeout: 45000,
    provider: 'gemini',
  },
});

console.log(`Loaded configuration for: ${config.project.name}`);
console.log(`Verification timeout: ${config.verification.timeoutMs}ms`);
```
