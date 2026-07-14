import { chmod, mkdir, open, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../lib/errors.js';

export const WORKSPACE_DIRECTORIES = [
  'Model',
  'Model/previews',
  'Model/viewer',
  'uploads',
  'imports',
  'revisions',
  'working',
  'runtime',
] as const;

async function assertRoot(root: string): Promise<string> {
  const resolved = path.resolve(root);
  await mkdir(resolved, { recursive: true, mode: 0o2770 });
  await chmod(resolved, 0o2770);
  return realpath(resolved);
}

function resolveWorkspacePath(root: string, workspaceId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
    throw new AppError(400, 'INVALID_WORKSPACE_ID', 'Workspace ID is invalid');
  }
  const candidate = path.resolve(root, workspaceId);
  if (path.dirname(candidate) !== root) {
    throw new AppError(400, 'INVALID_WORKSPACE_ID', 'Workspace ID is invalid');
  }
  return candidate;
}

export async function createWorkspace(root: string, workspaceId: string): Promise<string> {
  const realRoot = await assertRoot(root);
  const workspace = resolveWorkspacePath(realRoot, workspaceId);
  await mkdir(workspace, { recursive: false, mode: 0o2770 });
  await chmod(workspace, 0o2770);
  const directories = await Promise.all(
    WORKSPACE_DIRECTORIES.map((directory) =>
      mkdir(path.join(workspace, directory), { recursive: true, mode: 0o2770 }).then(() =>
        path.join(workspace, directory),
      ),
    ),
  );
  await Promise.all(directories.map((directory) => chmod(directory, 0o2770)));
  return workspace;
}

export async function removeWorkspace(root: string, workspaceId: string): Promise<void> {
  const realRoot = await assertRoot(root);
  const workspace = resolveWorkspacePath(realRoot, workspaceId);
  const resolved = await realpath(workspace).catch(() => null);
  if (resolved === null || path.dirname(resolved) !== realRoot) return;
  await rm(resolved, { recursive: true, force: true, maxRetries: 2 });
}

export async function freezeWorkingCopy(
  root: string,
  workspaceId: string,
  taskId: string,
  revisionNumber: number,
): Promise<string> {
  const realRoot = await assertRoot(root);
  const workspace = resolveWorkspacePath(realRoot, workspaceId);
  const source = path.join(workspace, 'working', taskId, 'Model');
  const destination = path.join(workspace, 'revisions', String(revisionNumber), 'Model');
  const resolvedSource = await realpath(source);
  if (!resolvedSource.startsWith(`${workspace}${path.sep}`)) {
    throw new AppError(400, 'INVALID_WORKING_COPY', 'Working copy is outside the workspace');
  }
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o2770 });
  await rename(resolvedSource, destination);

  // A sentinel opened exclusively prevents a revision from being frozen twice.
  const sentinel = await open(path.join(path.dirname(destination), '.immutable'), 'wx', 0o440);
  await sentinel.close();
  return destination;
}
