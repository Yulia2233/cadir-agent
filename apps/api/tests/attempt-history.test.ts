import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeAttemptHistory } from '../src/services/attempt-history.js';
import type { AttemptRecord } from '../src/services/attempt-history.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('CAD repair attempt history', () => {
  it('persists immutable source and structured evidence for each iteration', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cadir-attempt-'));
    roots.push(root);
    const workspaceId = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const modelPath = path.join(root, workspaceId, 'working', taskId, 'Model', 'model.py');
    await mkdir(path.dirname(modelPath), { recursive: true });
    await writeFile(modelPath, 'print("attempt one")\n', 'utf8');

    const record = await writeAttemptHistory({
      workspaceRoot: root,
      workspaceId,
      taskId,
      modelPath,
      iteration: 1,
      phase: 'EXECUTE',
      outcome: 'failed',
      failureCode: 'MODEL_EXECUTION_FAILED',
      evidence: 'boolean operation failed',
      previousCodeChecksum: null,
    });
    const attemptRoot = path.join(root, workspaceId, 'runtime', taskId, 'attempts', '1');
    const metadata = JSON.parse(
      await readFile(path.join(attemptRoot, 'attempt.json'), 'utf8'),
    ) as AttemptRecord;

    expect(await readFile(path.join(attemptRoot, 'model.py'), 'utf8')).toBe(
      'print("attempt one")\n',
    );
    expect(metadata).toMatchObject(record);
    expect(record.codeChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(record.summary).toContain('first model source snapshot');
  });

  it('records when no source was produced', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cadir-attempt-'));
    roots.push(root);
    const record = await writeAttemptHistory({
      workspaceRoot: root,
      workspaceId: '11111111-1111-4111-8111-111111111111',
      taskId: '22222222-2222-4222-8222-222222222222',
      modelPath: path.join(root, 'missing.py'),
      iteration: 1,
      phase: 'CODE',
      outcome: 'failed',
      failureCode: 'MODEL_NOT_WRITTEN',
      evidence: 'no model source',
      previousCodeChecksum: null,
    });

    expect(record.codeChecksum).toBeNull();
    expect(record.summary).toContain('No model source');
  });
});
