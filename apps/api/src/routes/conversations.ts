import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { createWorkspace, removeWorkspace } from '../services/workspaces.js';

const querySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  q: z.string().trim().max(200).optional(),
  archived: z.coerce.boolean().default(false),
});
const idSchema = z.object({ id: z.string().uuid() });
const patchSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  archived: z.boolean().optional(),
});

export const conversationRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/conversations', { preHandler: app.authenticate }, async (request, reply) => {
    const conversationId = randomUUID();
    const workspaceId = randomUUID();
    const storagePath = `${app.config.WORKSPACE_ROOT}/${workspaceId}`;
    await createWorkspace(app.config.WORKSPACE_ROOT, workspaceId);
    const conversation = await app.prisma
      .$transaction(async (tx) => {
        const created = await tx.conversation.create({
          data: {
            id: conversationId,
            userId: request.authUser.id,
            opencodeSessionId: `pending:${randomUUID()}`,
          },
        });
        await tx.workspace.create({
          data: {
            id: workspaceId,
            conversationId,
            ownerUserId: request.authUser.id,
            storagePath,
            runtimeImageVersion: 'cadir-runner:0.1.0',
            simplecadapiVersion: app.config.SIMPLECADAPI_VERSION,
            skillVersion: app.config.SIMPLECAD_SKILL_VERSION,
          },
        });
        return created;
      })
      .catch(async (error: unknown) => {
        await removeWorkspace(app.config.WORKSPACE_ROOT, workspaceId);
        throw error;
      });
    return reply.status(201).send(conversation);
  });

  app.get('/api/conversations', { preHandler: app.authenticate }, async (request) => {
    const query = querySchema.parse(request.query);
    const items = await app.prisma.conversation.findMany({
      where: {
        userId: request.authUser.id,
        deletedAt: null,
        archivedAt: query.archived ? { not: null } : null,
        ...(query.cursor ? { updatedAt: { lt: new Date(query.cursor) } } : {}),
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: 'insensitive' as const } },
                {
                  messages: {
                    some: { content: { contains: query.q, mode: 'insensitive' as const } },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });
    return { items, nextCursor: items.at(-1)?.updatedAt.toISOString() ?? null };
  });

  app.get('/api/conversations/:id', { preHandler: app.authenticate }, async (request) => {
    const { id } = idSchema.parse(request.params);
    const conversation = await app.prisma.conversation.findFirst({
      where: { id, userId: request.authUser.id, deletedAt: null },
      include: { currentRevision: true },
    });
    if (conversation === null) throw notFound();
    return conversation;
  });

  app.patch('/api/conversations/:id', { preHandler: app.authenticate }, async (request) => {
    const { id } = idSchema.parse(request.params);
    const input = patchSchema.parse(request.body);
    const existing = await app.prisma.conversation.findFirst({
      where: { id, userId: request.authUser.id, deletedAt: null },
    });
    if (existing === null) throw notFound();
    return app.prisma.conversation.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title, titleSource: 'user' } : {}),
        ...(input.archived !== undefined
          ? {
              archivedAt: input.archived ? new Date() : null,
              status: input.archived ? 'ARCHIVED' : 'IDLE',
            }
          : {}),
      },
    });
  });

  app.delete('/api/conversations/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const existing = await app.prisma.conversation.findFirst({
      where: { id, userId: request.authUser.id, deletedAt: null },
    });
    if (existing === null) throw notFound();
    await app.prisma.$transaction([
      app.prisma.task.updateMany({
        where: { conversationId: id, status: { in: ['QUEUED', 'RUNNING', 'WAITING_USER'] } },
        data: { status: 'ABORTED', abortedAt: new Date() },
      }),
      app.prisma.conversation.update({
        where: { id },
        data: { status: 'DELETING', deletedAt: new Date() },
      }),
    ]);
    return reply.status(204).send();
  });
};
