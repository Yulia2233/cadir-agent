import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { Redis } from 'ioredis';
import { TaskWorker } from './services/task-worker.js';

const config = loadConfig();
const app = await buildApp(config);
const workerRedis = config.TASK_WORKER_ENABLED
  ? new Redis(config.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: null,
      connectTimeout: 5_000,
    })
  : null;
const worker =
  workerRedis === null
    ? null
    : new TaskWorker({
        prisma: app.prisma,
        redis: workerRedis,
        logger: app.log,
        runnerUrl: config.RUNNER_INTERNAL_URL,
        freecadUrl: config.FREECAD_INTERNAL_URL,
        workspaceRoot: config.WORKSPACE_ROOT,
        skillVersion: config.SIMPLECAD_SKILL_VERSION,
        objectStore: app.objectStore,
        opencode: app.opencode,
        maxAutoIterations: config.TASK_MAX_AUTO_ITERATIONS,
      });
await workerRedis?.connect();
worker?.start();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Stopping API server');
  await worker?.stop();
  await app.close();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: config.API_HOST, port: config.API_PORT });
