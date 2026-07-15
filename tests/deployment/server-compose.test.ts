import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('server deployment contract', () => {
  it('documents an external secret file and has no credential values', async () => {
    const example = await readFile(
      new URL('../../infra/server.env.example', import.meta.url),
      'utf8',
    );

    for (const key of [
      'POSTGRES_PASSWORD',
      'DATABASE_URL',
      'S3_ACCESS_KEY',
      'S3_SECRET_KEY',
      'SESSION_SECRET',
      'CSRF_SECRET',
      'MODEL_CONFIG_KEK',
    ]) {
      expect(example).toMatch(new RegExp(`^${key}=$`, 'm'));
    }
    expect(example).not.toMatch(/sk-[A-Za-z0-9_-]{12,}/);
  });

  it('provides deterministic check, deploy, health, and teardown actions', async () => {
    const script = await readFile(
      new URL('../../scripts/server-deploy.mjs', import.meta.url),
      'utf8',
    );

    expect(script).toContain("['check', 'up', 'health', 'down']");
    expect(script).toContain("'config', '--quiet'");
    expect(script).toContain("'--wait'");
    expect(script).toContain('/health/ready');
    expect(script).toContain("serverPlatform !== 'linux/x86_64'");
    expect(script).toContain("assertMinimumVersion('Docker Engine', dockerVersion, 27)");
    expect(script).toContain("assertMinimumVersion('Docker Compose', composeVersion, 2, 24)");
    expect(script).toContain('(envMode & 0o077) !== 0');
  });

  it('keeps the API attached to both data and execution networks in production', async () => {
    const production = await readFile(
      new URL('../../infra/compose.production.yaml', import.meta.url),
      'utf8',
    );
    const apiBlock = production.split('  web:')[0] ?? '';
    expect(apiBlock).toContain('      - backend');
    expect(apiBlock).toContain('      - runner-control');
    expect(apiBlock).toContain('      - egress');
  });
});
