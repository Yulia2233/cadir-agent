import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('API Docker image policy', () => {
  it('uses a pinned Linux base, a non-root user, and a healthcheck', async () => {
    const dockerfile = await readFile(
      new URL('../../apps/api/Dockerfile', import.meta.url),
      'utf8',
    );

    expect(dockerfile).toMatch(/node:22\.17\.1-bookworm-slim@sha256:[a-f0-9]{64}/);
    expect(dockerfile).toMatch(/USER 10001:10001/);
    expect(dockerfile).toContain('HEALTHCHECK');
    expect(dockerfile).not.toMatch(/node:latest/);
  });

  it('keeps internal dependencies private and mounts the API workspace', () => {
    const env = {
      ...process.env,
      POSTGRES_PASSWORD: 'test-only-password',
      S3_ACCESS_KEY: 'test-access-key',
      S3_SECRET_KEY: 'test-secret-key-value',
      SESSION_SECRET: '01234567890123456789012345678901',
      CSRF_SECRET: '01234567890123456789012345678901',
      MODEL_CONFIG_KEK: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    };
    const raw = execFileSync(
      'docker',
      [
        'compose',
        '-f',
        'infra/compose.yaml',
        '-f',
        'infra/compose.server.yaml',
        '-f',
        'infra/compose.production.yaml',
        'config',
        '--format',
        'json',
      ],
      { cwd: new URL('../..', import.meta.url), env, encoding: 'utf8' },
    );
    const config = JSON.parse(raw) as {
      services: Record<
        string,
        {
          ports?: unknown[];
          networks?: Record<string, unknown>;
          volumes?: Array<{ target: string }>;
          environment?: Record<string, string>;
        }
      >;
    };

    expect(config.services.api?.ports ?? []).toEqual([]);
    expect(config.services.web?.ports ?? []).toEqual([]);
    expect(config.services.postgres?.ports ?? []).toEqual([]);
    expect(config.services.redis?.ports ?? []).toEqual([]);
    expect(config.services.minio?.ports ?? []).toEqual([]);
    expect(config.services.api?.volumes).toContainEqual(
      expect.objectContaining({ target: '/data/workspaces' }),
    );
    expect(config.services.api?.environment?.S3_ENDPOINT).toBe('http://minio:9000');
    expect(config.services.runner?.networks).toEqual({ 'runner-control': null });
  });

  it('keeps server services private and preserves the runner isolation boundary', async () => {
    const compose = await readFile(new URL('../../infra/compose.yaml', import.meta.url), 'utf8');
    const server = await readFile(
      new URL('../../infra/compose.server.yaml', import.meta.url),
      'utf8',
    );
    const runner = await readFile(
      new URL('../../services/runner/Dockerfile', import.meta.url),
      'utf8',
    );

    expect(compose).toContain('internal: true');
    expect(compose).toContain('- egress');
    expect(compose).toContain('no-new-privileges:true');
    expect(compose).not.toContain('/var/run/docker.sock');
    expect(server).toContain('ports: !reset []');
    expect(server).toContain('- edge');
    expect(runner).toMatch(/USER 10002:10002/);
    expect(runner).toContain('/health/ready');
    expect(runner).toContain("version('simplecadapi') == '2.0.1b1'");
  });
});
