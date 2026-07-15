import { Queue, type JobsOptions, type Job } from 'bullmq';
import { Redis } from 'ioredis';

export const CAD_TASK_QUEUE = 'cadir-cad-tasks';
export const CAD_TASK_JOB = 'execute-cad-task';

export type CadTaskJobData = {
  taskId: string;
  run: number;
};

export type DeadLetterSummary = {
  jobId: string;
  taskId: string;
  run: number;
  name: string;
  attemptsMade: number;
  failedReason: string | null;
  finishedOn: number | null;
};

const jobPolicy: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 5_000 },
  removeOnFail: { age: 30 * 24 * 60 * 60, count: 10_000 },
  stackTraceLimit: 8,
};

export class CadTaskQueue {
  private readonly connection: Redis;
  private readonly queue: Queue<CadTaskJobData>;

  public constructor(redisUrl: string) {
    this.connection = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
    });
    this.queue = new Queue<CadTaskJobData>(CAD_TASK_QUEUE, {
      connection: this.connection,
      defaultJobOptions: jobPolicy,
    });
    // The API logger owns user-visible reporting; this listener prevents an
    // unhandled EventEmitter error while Redis is temporarily unavailable.
    this.queue.on('error', () => undefined);
  }

  public async add(taskId: string, run: number): Promise<string> {
    // A stable ID makes repeated delivery of the same domain run idempotent.
    // The run suffix permits a NEEDS_USER task to be explicitly resumed.
    const jobId = `${taskId}-${run}`;
    const job = await this.queue.add(CAD_TASK_JOB, { taskId, run }, { jobId });
    return job.id ?? jobId;
  }

  public async deadLetters(limit = 50): Promise<DeadLetterSummary[]> {
    const jobs = await this.queue.getFailed(0, Math.max(0, limit - 1));
    return jobs.map((job: Job<CadTaskJobData>) => ({
      jobId: job.id ?? 'unknown',
      taskId: job.data.taskId,
      run: job.data.run,
      name: job.name,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason?.slice(0, 500) ?? null,
      finishedOn: job.finishedOn ?? null,
    }));
  }

  public async close(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect(false);
  }
}
