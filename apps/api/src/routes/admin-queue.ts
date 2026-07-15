import type { FastifyPluginAsync } from 'fastify';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });

export const adminQueueRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/admin/queue/dead-letters',
    { preHandler: app.requireRole([UserRole.ADMIN, UserRole.REVIEWER]) },
    async (request) => ({
      items: await app.taskQueue.deadLetters(querySchema.parse(request.query).limit),
    }),
  );
};
