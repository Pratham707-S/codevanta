/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/verification/sandbox/resource-limits.ts
 * Owner: Pratham
 * Purpose: Container sandbox: CPU, memory, process, and disk quota controls
 */

export interface SandboxResourceLimits {
  maxMemoryMb: number;
  memorySwapMb?: number;
  maxCpus: number;
  pidsLimit: number;
  tmpfsSizeMb?: number;
  timeoutMs: number;
}

export const DEFAULT_RESOURCE_LIMITS: Readonly<SandboxResourceLimits> = Object.freeze({
  maxMemoryMb: 512,
  memorySwapMb: 512,
  maxCpus: 1.0,
  pidsLimit: 100,
  tmpfsSizeMb: 64,
  timeoutMs: 30_000,
});

/**
 * Resolves user-supplied resource limits against hardened defaults.
 */
export function resolveResourceLimits(
  overrides?: Partial<SandboxResourceLimits>
): SandboxResourceLimits {
  const maxMemoryMb = Math.max(64, overrides?.maxMemoryMb ?? DEFAULT_RESOURCE_LIMITS.maxMemoryMb);
  return {
    maxMemoryMb,
    memorySwapMb:
      overrides?.memorySwapMb !== undefined
        ? Math.max(64, overrides.memorySwapMb)
        : overrides?.maxMemoryMb ?? DEFAULT_RESOURCE_LIMITS.memorySwapMb,
    maxCpus: Math.max(0.1, overrides?.maxCpus ?? DEFAULT_RESOURCE_LIMITS.maxCpus),
    pidsLimit: Math.max(10, overrides?.pidsLimit ?? DEFAULT_RESOURCE_LIMITS.pidsLimit),
    tmpfsSizeMb:
      overrides?.tmpfsSizeMb !== undefined
        ? Math.max(16, overrides.tmpfsSizeMb)
        : DEFAULT_RESOURCE_LIMITS.tmpfsSizeMb,
    timeoutMs: Math.max(1000, overrides?.timeoutMs ?? DEFAULT_RESOURCE_LIMITS.timeoutMs),
  };
}

/**
 * Formats resource limit configuration into safe Docker CLI arguments.
 */
export function formatDockerResourceArgs(limits: SandboxResourceLimits): string[] {
  const args: string[] = [
    `--memory=${limits.maxMemoryMb}m`,
    `--cpus=${limits.maxCpus}`,
    `--pids-limit=${limits.pidsLimit}`,
  ];

  if (limits.memorySwapMb !== undefined) {
    args.push(`--memory-swap=${limits.memorySwapMb}m`);
  }

  if (limits.tmpfsSizeMb !== undefined) {
    args.push(`--tmpfs=/tmp:rw,noexec,nosuid,size=${limits.tmpfsSizeMb}m`);
  }

  return args;
}
