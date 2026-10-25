/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: src/verification/sandbox/sandbox-policy.ts
 * Owner: Pratham
 * Purpose: Container sandbox: network and filesystem sandbox policy
 */

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
    const mode = vol.readOnly ? 'ro' : 'rw';
    args.push(`-v=${vol.hostPath}:${vol.containerPath}:${mode}`);
  }

  for (const [key, val] of Object.entries(policy.environment)) {
    args.push(`-e=${key}=${val}`);
  }

  return args;
}
