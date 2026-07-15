import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('monorepo baseline', () => {
  it('contains the independently owned product and test boundaries', async () => {
    const required = [
      'apps/api',
      'apps/web',
      'services/orchestrator',
      'services/runner',
      'services/validator',
      'services/viewer',
      'services/case-service',
      'workers/freecad',
      'packages/contracts',
      'packages/opencode-cadir',
      'vendor/opencode',
      'infra',
      'tests',
    ];

    await Promise.all(required.map((entry) => access(path.join(root, entry))));
  });

  it('keeps environment examples free from credential values', async () => {
    const example = await readFile(path.join(root, '.env.example'), 'utf8');
    const secretNames = [
      'POSTGRES_PASSWORD',
      'DATABASE_URL',
      'S3_ACCESS_KEY',
      'S3_SECRET_KEY',
      'SESSION_SECRET',
      'CSRF_SECRET',
      'MODEL_CONFIG_KEK',
      'OPENCODE_INTERNAL_PASSWORD',
      'OPENCODE_TOOL_TOKEN',
      'SYSTEM_MODEL_API_KEY',
    ];
    for (const name of secretNames) expect(example).toMatch(new RegExp(`^${name}=$`, 'm'));
    expect(example).not.toMatch(/sk-[A-Za-z0-9_-]{12,}/);
  });

  it('documents one-command startup and both host wrapper surfaces', async () => {
    const [readme, windows, posix] = await Promise.all([
      readFile(path.join(root, 'README.md'), 'utf8'),
      readFile(path.join(root, 'scripts/dev-env.ps1'), 'utf8'),
      readFile(path.join(root, 'scripts/dev-env.sh'), 'utf8'),
    ]);

    expect(readme).toContain('docker compose --env-file .env -f infra/compose.yaml up -d --build');
    expect(readme).toContain('http://localhost:3000');
    for (const action of ['up', 'down', 'health']) {
      expect(windows).toContain(`'${action}'`);
      expect(posix).toContain(`${action})`);
    }
    expect(readme).toContain('scripts/dev-env.ps1 up');
    expect(readme).toContain('docs/development/LOCAL_ENVIRONMENT.md');
    expect(await readFile(path.join(root, 'scripts/dev-data.mjs'), 'utf8')).toContain('init|clean');
  });
});
