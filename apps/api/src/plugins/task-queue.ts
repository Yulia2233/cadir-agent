import fp from 'fastify-plugin';
import { CadTaskQueue } from '../services/task-queue.js';

export const taskQueuePlugin = fp(async (app) => {
  const taskQueue = new CadTaskQueue(app.config.REDIS_URL);
  app.decorate('taskQueue', taskQueue);
  app.addHook('onClose', async () => taskQueue.close());
});
