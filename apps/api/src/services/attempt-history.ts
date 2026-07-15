import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TaskPhase } from '@prisma/client';

export type AttemptRecord = {
  iteration: number;
  phase: TaskPhase;
  outcome: 'passed' | 'failed';
  failureCode: string | null;
  evidence: string | null;
  codeChecksum: string | null;
  previousCodeChecksum: string | null;
  summary: string;
};

export async function writeAttemptHistory(input: {
  workspaceRoot: string;
  workspaceId: string;
  taskId: string;
  modelPath: string;
  iteration: number;
  phase: TaskPhase;
  outcome: 'passed' | 'failed';
  failureCode: string | null;
  evidence: string | null;
  previousCodeChecksum: string | null;
}): Promise<AttemptRecord> {
  const source = await readFile(input.modelPath, 'utf8').catch(() => null);
  const codeChecksum =
    source === null ? null : createHash('sha256').update(source, 'utf8').digest('hex');
  const record: AttemptRecord = {
    iteration: input.iteration,
    phase: input.phase,
    outcome: input.outcome,
    failureCode: input.failureCode,
    evidence: input.evidence,
    codeChecksum,
    previousCodeChecksum: input.previousCodeChecksum,
    summary: attemptSummary(
      input.outcome,
      input.failureCode,
      codeChecksum,
      input.previousCodeChecksum,
    ),
  };
  const directory = path.join(
    input.workspaceRoot,
    input.workspaceId,
    'runtime',
    input.taskId,
    'attempts',
    String(input.iteration),
  );
  await mkdir(directory, { recursive: true, mode: 0o2770 });
  if (source !== null) {
    await writeFile(path.join(directory, 'model.py'), source, {
      encoding: 'utf8',
      mode: 0o440,
    });
  }
  await writeFile(path.join(directory, 'attempt.json'), JSON.stringify(record, null, 2), {
    encoding: 'utf8',
    mode: 0o440,
  });
  return record;
}

function attemptSummary(
  outcome: 'passed' | 'failed',
  failureCode: string | null,
  codeChecksum: string | null,
  previousCodeChecksum: string | null,
): string {
  if (outcome === 'passed')
    return 'The generated model passed execution, validation, and derivation.';
  const codeChange =
    codeChecksum === null
      ? 'No model source was produced.'
      : previousCodeChecksum === null
        ? 'The first model source snapshot was recorded.'
        : codeChecksum === previousCodeChecksum
          ? 'The model source did not change from the previous attempt.'
          : 'The model source changed from the previous attempt.';
  return `${failureCode ?? 'CAD_FAILURE'}: ${codeChange}`;
}
