/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/verification/sandbox/sandbox-policy.ts
 * Owner: Pratham
 * Purpose: Container sandbox: network and filesystem sandbox policy
 */

import { resolve } from 'node:path';

export type NetworkMode = 'none' | 'bridge' | 'host';

export interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readOnly: boolean;
}

export interface SandboxSecurityPolicy {
  networkMode: NetworkMode;
  dropCapabilities: string[];
  noNewPrivileges: boolean;
  readOnlyRootFilesystem: boolean;
  user?: string;
  volumes: VolumeMount[];
  environment: Record<string, string>;
}

export const DEFAULT_SANDBOX_POLICY: Readonly<
  Omit<SandboxSecurityPolicy, 'volumes' | 'environment'>
> = Object.freeze({
  networkMode: 'none',
  dropCapabilities: ['ALL'],
  noNewPrivileges: true,
  readOnlyRootFilesystem: false,
  user: 'node',
});

/**
 * Patterns identifying dangerous mounts like Docker sockets, named pipes, and sensitive credential paths.
 */
const DANGEROUS_PATH_PATTERNS: readonly RegExp[] = [
  /docker\.sock/i,
  /docker_engine/i,
  /containerd\.sock/i,
  /dockershim\.sock/i,
  /\.ssh($|[\\/])/i,
  /\.aws($|[\\/])/i,
  /\.docker($|[\\/])/i,
  /\.gnupg($|[\\/])/i,
  /\.kube($|[\\/])/i,
];

const FORBIDDEN_EXACT_SYSTEM_DIRS: readonly string[] = [
  '/',
  '/bin',
  '/boot',
  '/dev',
  '/etc',
  '/lib',
  '/lib64',
  '/proc',
  '/root',
  '/sbin',
  '/sys',
  '/usr',
];

/**
 * Validates that a host mount path does not expose Docker sockets, system roots,
 * or sensitive credential directories, while preserving legitimate repository paths.
 */
export function validateMountPath(hostPath: string): { safe: boolean; reason?: string } {
  if (!hostPath || typeof hostPath !== 'string' || hostPath.trim() === '') {
    return { safe: false, reason: 'Mount path must be a non-empty string.' };
  }

  const raw = hostPath.trim();
  const rawClean = raw.replace(/\\/g, '/');
  const lowerRaw = rawClean.toLowerCase();
  const normalized = resolve(raw).replace(/\\/g, '/');
  const lowerNormalized = normalized.toLowerCase();
  const posixStripped = lowerNormalized.replace(/^[a-z]:/i, '');

  // 1. Docker sockets and named pipes
  for (const pattern of DANGEROUS_PATH_PATTERNS) {
    if (pattern.test(lowerNormalized) || pattern.test(lowerRaw) || pattern.test(posixStripped)) {
      return {
        safe: false,
        reason: `Exposing Docker socket or sensitive credential directory is prohibited: ${hostPath}`,
      };
    }
  }

  // 2. POSIX root and core system directories
  if (lowerNormalized === '/' || lowerRaw === '/' || posixStripped === '/') {
    return {
      safe: false,
      reason: `Mounting filesystem root is prohibited: ${hostPath}`,
    };
  }

  for (const sysDir of FORBIDDEN_EXACT_SYSTEM_DIRS) {
    if (
      sysDir !== '/' &&
      (lowerNormalized === sysDir ||
        lowerNormalized.startsWith(sysDir + '/') ||
        lowerRaw === sysDir ||
        lowerRaw.startsWith(sysDir + '/') ||
        posixStripped === sysDir ||
        posixStripped.startsWith(sysDir + '/'))
    ) {
      return {
        safe: false,
        reason: `Mounting core system directory is prohibited: ${hostPath}`,
      };
    }
  }

  // 3. Windows drive roots (e.g. C:/ or C:\)
  if (
    /^[a-z]:\/?$/i.test(lowerNormalized) ||
    /^[a-z]:\/?$/i.test(lowerRaw) ||
    /^[a-z]:\\?$/i.test(raw)
  ) {
    return {
      safe: false,
      reason: `Mounting filesystem drive root is prohibited: ${hostPath}`,
    };
  }

  // 4. Windows system directories (Windows, System32, Program Files)
  if (
    /^[a-z]:\/(windows|system32|program files|program files \(x86\)|programdata)($|\/)/i.test(
      lowerNormalized
    ) ||
    /^[a-z]:\/(windows|system32|program files|program files \(x86\)|programdata)($|\/)/i.test(
      lowerRaw
    )
  ) {
    return {
      safe: false,
      reason: `Mounting Windows system directory is prohibited: ${hostPath}`,
    };
  }

  return { safe: true };
}

/**
 * Resolves user-supplied security policy against hardened sandbox defaults.
 */
export function resolveSecurityPolicy(
  overrides?: Partial<SandboxSecurityPolicy>
): SandboxSecurityPolicy {
  return {
    networkMode: overrides?.networkMode ?? DEFAULT_SANDBOX_POLICY.networkMode,
    dropCapabilities: overrides?.dropCapabilities ?? [...DEFAULT_SANDBOX_POLICY.dropCapabilities],
    noNewPrivileges: overrides?.noNewPrivileges ?? DEFAULT_SANDBOX_POLICY.noNewPrivileges,
    readOnlyRootFilesystem:
      overrides?.readOnlyRootFilesystem ?? DEFAULT_SANDBOX_POLICY.readOnlyRootFilesystem,
    user: overrides?.user ?? DEFAULT_SANDBOX_POLICY.user,
    volumes: overrides?.volumes ? [...overrides.volumes] : [],
    environment: overrides?.environment ? { ...overrides.environment } : {},
  };
}

/**
 * Formats sandbox security policies into safe Docker CLI arguments.
 */
export function formatDockerSecurityArgs(policy: SandboxSecurityPolicy): string[] {
  const args: string[] = [
    `--network=${policy.networkMode}`,
  ];

  for (const cap of policy.dropCapabilities) {
    args.push(`--cap-drop=${cap}`);
  }

  if (policy.noNewPrivileges) {
    args.push('--security-opt=no-new-privileges:true');
  }

  if (policy.readOnlyRootFilesystem) {
    args.push('--read-only');
  }

  if (policy.user) {
    args.push(`--user=${policy.user}`);
  }

  for (const vol of policy.volumes) {
    const validation = validateMountPath(vol.hostPath);
    if (!validation.safe) {
      throw new Error(`Insecure mount rejected: ${validation.reason}`);
    }
    const mode = vol.readOnly ? 'ro' : 'rw';
    args.push(`-v=${vol.hostPath}:${vol.containerPath}:${mode}`);
  }

  for (const [key, val] of Object.entries(policy.environment)) {
    args.push(`-e=${key}=${val}`);
  }

  return args;
}
