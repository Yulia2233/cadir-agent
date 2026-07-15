import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('OpenCode deployment boundary', () => {
  it('pins the real upstream source and keeps the service internal', async () => {
    const modules = await readFile(new URL('../../.gitmodules', import.meta.url), 'utf8');
    const compose = await readFile(new URL('../../infra/compose.yaml', import.meta.url), 'utf8');
    const dockerfile = await readFile(
      new URL('../../packages/opencode-cadir/Dockerfile', import.meta.url),
      'utf8',
    );

    expect(modules).toContain('https://github.com/Yulia2233/opencode.git');
    expect(compose).toMatch(/\n  opencode:\n/);
    const service = compose.split('\n  opencode:\n')[1]?.split('\n  runner:\n')[0] ?? '';
    expect(service).not.toContain('\n    ports:');
    expect(service).toContain("group_add:\n      - '10001'");
    expect(dockerfile).toContain('COPY vendor/opencode/ ./');
    expect(dockerfile).toContain(
      'script/build.ts --single --baseline --skip-install --skip-embed-web-ui',
    );
    expect(dockerfile).not.toContain('registry.npmjs.org/opencode-linux');
    expect(dockerfile).toContain('USER 10004:10004');
  });

  it('denies built-in OpenCode capabilities and exposes only CAD tools', async () => {
    const config = JSON.parse(
      await readFile(
        new URL('../../packages/opencode-cadir/runtime/opencode.json', import.meta.url),
        'utf8',
      ),
    ) as { permission: Record<string, string>; agent: Record<string, { permission: object }> };

    expect(config.permission).toEqual({ '*': 'deny' });
    expect(config.agent.cadir?.permission).toMatchObject({
      '*': 'deny',
      load_simplecad_skill: 'allow',
      write_model: 'allow',
      execute_model: 'allow',
    });
    expect(config.agent.cadir?.permission).not.toHaveProperty('bash', 'allow');
  });
});
