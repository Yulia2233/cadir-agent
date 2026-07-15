import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('durable CAD task queue contract', () => {
  it('uses BullMQ stable job IDs, bounded retries, and retained failure evidence', async () => {
    const source = await readFile(
      new URL('../src/services/task-queue.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("export const CAD_TASK_QUEUE = 'cadir-cad-tasks'");
    expect(source).toContain('attempts: 3');
    expect(source).toContain("backoff: { type: 'exponential', delay: 1_000 }");
    expect(source).toContain('removeOnComplete: { age: 24 * 60 * 60, count: 5_000 }');
    expect(source).toContain('removeOnFail: { age: 30 * 24 * 60 * 60, count: 10_000 }');
    expect(source).toContain('const jobId = `${taskId}-${run}`');
  });

  it('consumes through a leased BullMQ worker instead of Redis list polling', async () => {
    const [worker, messages] = await Promise.all([
      readFile(new URL('../src/services/task-worker.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/routes/messages.ts', import.meta.url), 'utf8'),
    ]);

    expect(worker).toContain('new Worker<CadTaskJobData>');
    expect(worker).toContain('lockDuration: 10 * 60 * 1_000');
    expect(worker).toContain('maxStalledCount: 2');
    expect(worker).not.toContain('.brpop(');
    expect(worker).not.toContain("'queue:cadir:tasks'");
    expect(messages).toContain('app.taskQueue.add');
    expect(messages).not.toContain('.lpush(');
  });
});
