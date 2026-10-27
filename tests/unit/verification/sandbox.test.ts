/**
 * RepoGuard — AI-Assisted Code Reliability & Security Platform
 *
 * Path: tests/unit/verification/sandbox.test.ts
 * Owner: Pratham
 * Purpose: Unit tests for DockerRunner, SandboxPolicy, ResourceLimits, and Orchestrator integration
 */

import { describe, it, expect } from 'vitest';
import {
  resolveResourceLimits,
  formatDockerResourceArgs,
} from '../../../src/verification/sandbox/resource-limits.js';
import {
  resolveSecurityPolicy,
  formatDockerSecurityArgs,
  validateMountPath,
} from '../../../src/verification/sandbox/sandbox-policy.js';
import { DockerRunner } from '../../../src/verification/sandbox/docker-runner.js';
import { CheckRunner } from '../../../src/verification/check-runner.js';
import {
  VerificationOrchestrator,
  type IVerificationRunner,
} from '../../../src/verification/verification-orchestrator.js';

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

describe('Verification Sandbox: Security Policy & Mount Validation', () => {
  it('resolves hardened default security policy with network isolation', () => {
    const policy = resolveSecurityPolicy();
    expect(policy.networkMode).toBe('none');
    expect(policy.dropCapabilities).toContain('ALL');
    expect(policy.noNewPrivileges).toBe(true);
    expect(policy.user).toBe('node');
  });

  it('formats Docker security arguments correctly for safe mounts', () => {
    const policy = resolveSecurityPolicy({
      networkMode: 'none',
      dropCapabilities: ['ALL'],
      noNewPrivileges: true,
      readOnlyRootFilesystem: true,
      user: '1001:1001',
      volumes: [{ hostPath: process.cwd(), containerPath: '/workspace', readOnly: false }],
      environment: { CI: 'true' },
    });

    const args = formatDockerSecurityArgs(policy);
    expect(args).toContain('--network=none');
    expect(args).toContain('--cap-drop=ALL');
    expect(args).toContain('--security-opt=no-new-privileges:true');
    expect(args).toContain('--read-only');
    expect(args).toContain('--user=1001:1001');
    expect(args.some((a) => a.startsWith('-v=') && a.includes(':/workspace:rw'))).toBe(true);
    expect(args).toContain('-e=CI=true');
  });

  describe('validateMountPath', () => {
    it('blocks Docker sockets and named pipes', () => {
      expect(validateMountPath('/var/run/docker.sock').safe).toBe(false);
      expect(validateMountPath('/run/docker.sock').safe).toBe(false);
      expect(validateMountPath('//./pipe/docker_engine').safe).toBe(false);
      expect(validateMountPath('\\\\.\\pipe\\docker_engine').safe).toBe(false);
      expect(validateMountPath('/var/run/containerd.sock').safe).toBe(false);
    });

    it('blocks filesystem root directories', () => {
      expect(validateMountPath('/').safe).toBe(false);
      expect(validateMountPath('C:/').safe).toBe(false);
      expect(validateMountPath('C:\\').safe).toBe(false);
    });

    it('blocks dangerous system and credential directories', () => {
      expect(validateMountPath('/etc').safe).toBe(false);
      expect(validateMountPath('/etc/passwd').safe).toBe(false);
      expect(validateMountPath('C:/Windows').safe).toBe(false);
      expect(validateMountPath('C:/Program Files').safe).toBe(false);
      expect(validateMountPath('/home/user/.ssh').safe).toBe(false);
      expect(validateMountPath('/root/.aws').safe).toBe(false);
      expect(validateMountPath('/user/.docker/config.json').safe).toBe(false);
    });

    it('allows legitimate project repository directories', () => {
      expect(validateMountPath(process.cwd()).safe).toBe(true);
      expect(validateMountPath('/home/user/workspace/my-project').safe).toBe(true);
      expect(validateMountPath('D:/Projects/Hackathon/repoguard').safe).toBe(true);
    });

    it('throws error in formatDockerSecurityArgs when dangerous volume mount is configured', () => {
      const maliciousPolicy = resolveSecurityPolicy({
        volumes: [{ hostPath: '/var/run/docker.sock', containerPath: '/var/run/docker.sock', readOnly: false }],
      });
      expect(() => formatDockerSecurityArgs(maliciousPolicy)).toThrow(/Insecure mount rejected/);
    });
  });
});

describe('Verification Sandbox: DockerRunner', () => {
  it('constructs safe Docker run arguments with workspace volume mount and resource limits', () => {
    const runner = new DockerRunner({
      image: 'node:22-alpine',
      workdir: '/app',
      resources: { maxMemoryMb: 512, maxCpus: 1.0 },
    });

    const args = runner.buildDockerRunArgs(process.cwd(), 'npm test', 'test-container-123');
    expect(args[0]).toBe('run');
    expect(args).toContain('--rm');
    expect(args).toContain('-i');
    expect(args).toContain('--workdir=/app');
    expect(args).toContain('--name=test-container-123');
    expect(args.some((a) => a.startsWith('-v=') && a.includes('/app:rw'))).toBe(true);
    expect(args).toContain('--memory=512m');
    expect(args).toContain('--network=none');
    expect(args).toContain('node:22-alpine');
    expect(args.slice(-2)).toEqual(['npm', 'test']);
  });

  it('rejects dangerous repoRoot mount paths before spawning container', async () => {
    const runner = new DockerRunner();
    const result = await runner.runCheck('Root Mount Check', 'npm test', '/var/run/docker.sock');

    expect(result.outcome).toBe('ERROR');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Exposing Docker socket');
  });

  it('blocks dangerous shell chaining operators before container execution', async () => {
    const runner = new DockerRunner();
    const result = await runner.runCheck('Malicious Check', 'npm test && rm -rf /', process.cwd());

    expect(result.outcome).toBe('ERROR');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Shell chaining, redirection, or subshells are strictly disallowed');
  });

  it('defaults to fallbackToSubprocess = false and skips execution when Docker is unavailable', async () => {
    const runner = new DockerRunner({
      dockerBinary: 'non_existent_docker_binary_xyz',
      // default fallbackToSubprocess is false
    });

    const result = await runner.runCheck('Skipped Check', 'npm test', process.cwd());
    expect(result.outcome).toBe('SKIPPED');
    expect(result.exitCode).toBeNull();
    expect(result.stderr).toContain('host fallback is disabled by default');
    expect(result.explanation).toContain('host fallback disabled');
  });

  it('falls back to subprocess runner only when fallbackToSubprocess is explicitly set to true', async () => {
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

  it('provides a clean container cleanup helper that handles non-existent or stopped containers', async () => {
    const runner = new DockerRunner();
    const cleanupResult = await runner.cleanupContainer('repoguard-sandbox-nonexistent-999');
    expect(typeof cleanupResult.success).toBe('boolean');
  });
});

describe('Verification Sandbox: Orchestrator Integration', () => {
  it('defaults VerificationOrchestrator to subprocess CheckRunner when no executionMode is specified', () => {
    const orchestrator = new VerificationOrchestrator();
    expect(orchestrator.getRunner() instanceof CheckRunner).toBe(true);
  });

  it('explicitly selects DockerRunner when executionMode: "docker" is configured', () => {
    const orchestrator = new VerificationOrchestrator({
      executionMode: 'docker',
      dockerOptions: { image: 'node:22-alpine' },
    });
    expect(orchestrator.getRunner() instanceof DockerRunner).toBe(true);
  });

  it('accepts an explicitly injected custom runner implementing IVerificationRunner', () => {
    const mockRunner: IVerificationRunner = {
      runCheck: async () => ({
        checkName: 'Custom',
        command: 'mock',
        outcome: 'PASSED' as const,
        exitCode: 0,
        durationMs: 10,
        stdout: '',
        stderr: '',
        explanation: 'mock',
      }),
    };

    const orchestrator = new VerificationOrchestrator({ runner: mockRunner });
    expect(orchestrator.getRunner()).toBe(mockRunner);
  });
});
