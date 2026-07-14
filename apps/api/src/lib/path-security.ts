import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './errors.js';

const INVALID_PATH = new AppError(400, 'INVALID_PATH', 'The requested path is not allowed');

export function normalizeWorkspaceRelativePath(value: string): string {
  if (value.length === 0 || path.isAbsolute(value) || /^[a-zA-Z]:/.test(value)) throw INVALID_PATH;
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'));
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw INVALID_PATH;
  }
  return normalized;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export async function resolveWorkspaceFile(root: string, relativePath: string): Promise<string> {
  const normalized = normalizeWorkspaceRelativePath(relativePath);
  const realRoot = await realpath(root);
  const candidate = path.resolve(realRoot, normalized);
  if (!isWithin(realRoot, candidate)) throw INVALID_PATH;

  const metadata = await lstat(candidate);
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) throw INVALID_PATH;
  const realCandidate = await realpath(candidate);
  if (!isWithin(realRoot, realCandidate)) throw INVALID_PATH;

  // Opening with no-follow closes the common symlink swap window before the caller reads.
  const handle = await open(realCandidate, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const openedMetadata = await handle.stat();
    if (!openedMetadata.isFile() || openedMetadata.nlink !== 1) throw INVALID_PATH;
  } finally {
    await handle.close();
  }
  return realCandidate;
}

export function safeDownloadFilename(value: string): string {
  const leaf = path.basename(value.replaceAll('\\', '/'));
  const sanitized = leaf
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f"';\\/]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return (sanitized || 'download').slice(0, 180);
}
