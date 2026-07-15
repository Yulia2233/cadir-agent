import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('dead-letter administration boundary', () => {
  it('exposes only a reviewer/admin route and bounded summaries', async () => {
    const route = await readFile(new URL('../src/routes/admin-queue.ts', import.meta.url), 'utf8');
    const queue = await readFile(new URL('../src/services/task-queue.ts', import.meta.url), 'utf8');

    expect(route).toContain("'/api/admin/queue/dead-letters'");
    expect(route).toContain('app.requireRole([UserRole.ADMIN, UserRole.REVIEWER])');
    expect(route).toContain('max(100)');
    expect(route).toContain('app.taskQueue.deadLetters');
    expect(queue).toContain('getFailed(0, Math.max(0, limit - 1))');
    expect(queue).toContain('failedReason?.slice(0, 500)');
    expect(queue).not.toContain('job.stacktrace');
  });
});
