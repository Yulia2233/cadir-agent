import fp from 'fastify-plugin';
import { Redis } from 'ioredis';

export const redisPlugin = fp(async (app) => {
  const redis = new Redis(app.config.REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    commandTimeout: 2_000,
  });

  redis.on('error', (error: Error) => {
    app.log.warn({ errorType: error.name }, 'Redis connection error');
  });
  await redis.connect();
  app.decorate('redis', redis);
  app.addHook('onClose', async () => {
    redis.disconnect(false);
  });
});
