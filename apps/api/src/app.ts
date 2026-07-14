import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { loadConfig, type AppConfig } from './config.js';
import { authPlugin } from './plugins/auth.js';
import { databasePlugin } from './plugins/database.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { objectStorePlugin } from './plugins/object-store.js';
import { authRoutes } from './routes/auth.js';
import { artifactRoutes } from './routes/artifacts.js';
import { conversationRoutes } from './routes/conversations.js';
import { healthRoutes } from './routes/health.js';
import { eventRoutes } from './routes/events.js';
import { messageRoutes } from './routes/messages.js';
import { modelConfigRoutes } from './routes/model-configs.js';

export async function buildApp(config: AppConfig = loadConfig()): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true,
    logger: {
      level: config.NODE_ENV === 'development' ? 'debug' : 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          '*.apiKey',
          '*.encryptedApiKey',
          '*.signedUrl',
        ],
        censor: '[REDACTED]',
      },
    },
    requestIdHeader: 'x-request-id',
    disableRequestLogging: false,
  });
  app.decorate('config', config);

  await app.register(cookie);
  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(',').map((value) => value.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-csrf-token', 'x-idempotency-key', 'last-event-id'],
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(databasePlugin);
  await app.register(objectStorePlugin);
  await app.register(authPlugin);
  await app.register(errorHandlerPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(modelConfigRoutes);
  await app.register(conversationRoutes);
  await app.register(messageRoutes);
  await app.register(eventRoutes);
  await app.register(artifactRoutes);
  return app;
}
