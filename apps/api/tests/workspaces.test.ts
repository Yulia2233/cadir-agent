import { chmod, mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createWorkspace,
  freezeWorkingCopy,
  makeWorkingCopyWritable,
  WORKSPACE_DIRECTORIES,
} from '../src/services/workspaces.js';

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

  it('freezes an immutable snapshot without removing the working evidence', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cadir-workspace-'));
    roots.push(root);
    const id = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const workspace = await createWorkspace(root, id);
    const model = path.join(workspace, 'working', taskId, 'Model');
    await mkdir(model, { recursive: true });
    await writeFile(path.join(model, 'model.py'), 'print(1)');

    const frozen = await freezeWorkingCopy(root, id, taskId, 1);
    await expect(stat(path.join(model, 'model.py'))).resolves.toBeDefined();
    expect((await stat(path.join(frozen, 'model.py'))).mode & 0o222).toBe(0);
  });

  it('restores writable permissions after a frozen tree is copied into working space', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cadir-workspace-'));
    roots.push(root);
    const id = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const workspace = await createWorkspace(root, id);
    const model = path.join(workspace, 'working', taskId, 'Model');
    await mkdir(path.join(model, 'previews'), { recursive: true });
    await writeFile(path.join(model, 'model.json'), '{}');
    await chmod(path.join(model, 'model.json'), 0o440);
    await chmod(path.join(model, 'previews'), 0o550);

    await makeWorkingCopyWritable(model);

    expect((await stat(path.join(model, 'model.json'))).mode & 0o200).toBeGreaterThan(0);
    const previewMode = (await stat(path.join(model, 'previews'))).mode;
    expect(previewMode & 0o200).toBeGreaterThan(0);
    if (process.platform !== 'win32') expect(previewMode & 0o010).toBe(0o010);
  });
});
