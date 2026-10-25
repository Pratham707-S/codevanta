/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/verification/sandbox.test.ts
 * Owner: Pratham
 * Purpose: Unit tests for DockerRunner, SandboxPolicy, and ResourceLimits
 */

import { describe, it, expect } from 'vitest';
import {
  resolveResourceLimits,
  formatDockerResourceArgs,
} from '../../../src/verification/sandbox/resource-limits.js';
import {
  resolveSecurityPolicy,
  formatDockerSecurityArgs,
} from '../../../src/verification/sandbox/sandbox-policy.js';
import { DockerRunner } from '../../../src/verification/sandbox/docker-runner.js';
import { CheckRunner } from '../../../src/verification/check-runner.js';

describe('Verification Sandbox: Resource Limits', () => {
  it('resolves default resource limits with safe values', () => {
    const limits = resolveResourceLimits();
    expect(limits.maxMemoryMb).toBe(512);
    expect(limits.maxCpus).toBe(1.0);
    expect(limits.pidsLimit).toBe(100);
    expect(limits.timeoutMs).toBe(30_000);
  });

  it('clamps invalid or dangerously low values to hardened minimums', () => {
    const limits = resolveResourceLimits({
      maxMemoryMb: 10,
      maxCpus: 0.01,
      pidsLimit: 2,
      timeoutMs: 100,
    });
    expect(limits.maxMemoryMb).toBe(64);
    expect(limits.maxCpus).toBe(0.1);
    expect(limits.pidsLimit).toBe(10);
    expect(limits.timeoutMs).toBe(1000);
  });

  it('formats Docker resource arguments correctly', () => {
    const args = formatDockerResourceArgs({
      maxMemoryMb: 256,
      memorySwapMb: 256,
      maxCpus: 1.5,
      pidsLimit: 50,
      tmpfsSizeMb: 32,
      timeoutMs: 15_000,
    });

    expect(args).toContain('--memory=256m');
    expect(args).toContain('--memory-swap=256m');
    expect(args).toContain('--cpus=1.5');
    expect(args).toContain('--pids-limit=50');
    expect(args).toContain('--tmpfs=/tmp:rw,noexec,nosuid,size=32m');
  });
});

describe('Verification Sandbox: Security Policy', () => {
  it('resolves hardened default security policy with network isolation', () => {
    const policy = resolveSecurityPolicy();
    expect(policy.networkMode).toBe('none');
    expect(policy.dropCapabilities).toContain('ALL');
    expect(policy.noNewPrivileges).toBe(true);
    expect(policy.user).toBe('node');
  });

  it('formats Docker security arguments correctly', () => {
    const policy = resolveSecurityPolicy({
      networkMode: 'none',
      dropCapabilities: ['ALL'],
      noNewPrivileges: true,
      readOnlyRootFilesystem: true,
      user: '1001:1001',
      volumes: [{ hostPath: '/host/dir', containerPath: '/workspace', readOnly: false }],
      environment: { CI: 'true' },
    });

    const args = formatDockerSecurityArgs(policy);
    expect(args).toContain('--network=none');
    expect(args).toContain('--cap-drop=ALL');
    expect(args).toContain('--security-opt=no-new-privileges:true');
    expect(args).toContain('--read-only');
    expect(args).toContain('--user=1001:1001');
    expect(args).toContain('-v=/host/dir:/workspace:rw');
    expect(args).toContain('-e=CI=true');
  });
});

describe('Verification Sandbox: DockerRunner', () => {
  it('constructs safe Docker run arguments with workspace volume mount and resource limits', () => {
    const runner = new DockerRunner({
      image: 'node:22-alpine',
      workdir: '/app',
      resources: { maxMemoryMb: 512, maxCpus: 1.0 },
    });

    const args = runner.buildDockerRunArgs('/test/repo', 'npm test');
    expect(args[0]).toBe('run');
    expect(args).toContain('--rm');
    expect(args).toContain('-i');
    expect(args).toContain('--workdir=/app');
    expect(args.some((a) => a.startsWith('-v=') && a.includes('/app:rw'))).toBe(true);
    expect(args).toContain('--memory=512m');
    expect(args).toContain('--network=none');
    expect(args).toContain('node:22-alpine');
    expect(args.slice(-2)).toEqual(['npm', 'test']);
  });

  it('blocks dangerous shell chaining operators before container execution', async () => {
    const runner = new DockerRunner();
    const result = await runner.runCheck('Malicious Check', 'npm test && rm -rf /', '/fake/path');

    expect(result.outcome).toBe('ERROR');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Shell chaining, redirection, or subshells are strictly disallowed');
  });

  it('falls back to subprocess runner when Docker daemon is not available and fallback is enabled', async () => {
    const mockSubprocessRunner = new CheckRunner({
      allowlist: ['node -e "console.log(42)"'],
    });

    const runner = new DockerRunner({
      dockerBinary: 'non_existent_docker_binary_xyz',
      fallbackToSubprocess: true,
      subprocessRunner: mockSubprocessRunner,
    });

    const result = await runner.runCheck('Echo Check', 'node -e "console.log(42)"', process.cwd());
    expect(result.outcome).toBe('PASSED');
    expect(result.stdout.trim()).toBe('42');
    expect(result.explanation).toContain('[Subprocess Fallback: Docker daemon unavailable]');
  });

  it('marks check as SKIPPED when Docker is not available and fallback is disabled', async () => {
    const runner = new DockerRunner({
      dockerBinary: 'non_existent_docker_binary_xyz',
      fallbackToSubprocess: false,
    });

    const result = await runner.runCheck('Skipped Check', 'npm test', process.cwd());
    expect(result.outcome).toBe('SKIPPED');
    expect(result.exitCode).toBeNull();
    expect(result.explanation).toContain('skipped');
  });
});
