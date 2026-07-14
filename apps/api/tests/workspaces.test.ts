import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkspace, WORKSPACE_DIRECTORIES } from '../src/services/workspaces.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('workspace manager', () => {
  it('creates an isolated fixed directory layout', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cadir-workspace-'));
    roots.push(root);
    const id = '11111111-1111-4111-8111-111111111111';
    const workspace = await createWorkspace(root, id);

    for (const directory of WORKSPACE_DIRECTORIES) {
      await expect(readdir(path.join(workspace, directory))).resolves.toBeDefined();
      const mode = (await stat(path.join(workspace, directory))).mode & 0o777;
      expect(mode & 0o060).toBe(0o060);
      if (process.platform !== 'win32') expect(mode & 0o010).toBe(0o010);
    }
  });

  it('does not accept a client-controlled path', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cadir-workspace-'));
    roots.push(root);
    await expect(createWorkspace(root, '../outside')).rejects.toThrow(/Workspace ID/);
  });
});
