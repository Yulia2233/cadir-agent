import type { FastifyPluginAsync } from 'fastify';
import { TaskMode, TaskPhase, TaskStatus } from '@prisma/client';
import { z } from 'zod';
import { classifyDomainRequest } from '../domain/domain-guard.js';
import { AppError, notFound } from '../lib/errors.js';
import { publishDomainEvent } from '../services/events.js';

const idSchema = z.object({ id: z.string().uuid() });
const listSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const sendSchema = z.object({
  content: z.string().trim().min(1).max(40_000),
  mode: z.nativeEnum(TaskMode).default(TaskMode.AUTO),
  freecadRequested: z.boolean().default(false),
  parentRevisionId: z.string().uuid().optional(),
  selections: z.array(z.string().uuid()).max(20).default([]),
  attachments: z.array(z.string().uuid()).max(20).default([]),
});

export const messageRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/conversations/:id/messages', { preHandler: app.authenticate }, async (request) => {
    const { id } = idSchema.parse(request.params);
    const query = listSchema.parse(request.query);
    const conversation = await app.prisma.conversation.findFirst({
      where: { id, userId: request.authUser.id, deletedAt: null },
      select: { id: true },
    });
    if (conversation === null) throw notFound();

    const cursorMessage = query.cursor
      ? await app.prisma.message.findFirst({
          where: { id: query.cursor, conversationId: id },
          select: { createdAt: true, id: true },
        })
      : null;
    const items = await app.prisma.message.findMany({
      where: {
        conversationId: id,
        ...(cursorMessage
          ? {
              OR: [
                { createdAt: { lt: cursorMessage.createdAt } },
                { createdAt: cursorMessage.createdAt, id: { lt: cursorMessage.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });
    return { items: items.reverse(), nextCursor: items.at(-1)?.id ?? null };
  });

  app.post(
    '/api/conversations/:id/messages',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = idSchema.parse(request.params);
      const input = sendSchema.parse(request.body);
      const idempotencyKey = request.headers['x-idempotency-key'];
      if (typeof idempotencyKey !== 'string' || idempotencyKey.length > 160) {
        throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid idempotency key is required');
      }

      const conversation = await app.prisma.conversation.findFirst({
        where: { id, userId: request.authUser.id, deletedAt: null },
        include: { workspace: true },
      });
      if (conversation === null || conversation.workspace === null) throw notFound();
      const workspace = conversation.workspace;

      const existingMessage = await app.prisma.message.findFirst({
        where: { conversationId: id, idempotencyKey },
        include: { task: true },
      });
      if (existingMessage !== null) {
        return reply.status(200).send({ message: existingMessage, task: existingMessage.task });
      }

      const activeTask = await app.prisma.task.findFirst({
        where: {
          conversationId: id,
          status: { in: [TaskStatus.QUEUED, TaskStatus.RUNNING, TaskStatus.WAITING_USER] },
        },
        select: { id: true },
      });
      if (activeTask !== null) {
        throw new AppError(409, 'CONVERSATION_BUSY', 'This conversation already has a write task');
      }

      if (input.parentRevisionId !== undefined) {
        const parent = await app.prisma.modelRevision.findFirst({
          where: { id: input.parentRevisionId, conversationId: id, status: 'SUCCEEDED' },
        });
        if (parent === null) throw notFound();
      }
      if (input.selections.length > 0) {
        const ownedSelections = await app.prisma.selection.count({
          where: { id: { in: input.selections }, conversationId: id, userId: request.authUser.id },
        });
        if (ownedSelections !== input.selections.length) throw notFound();
      }

      const guard = classifyDomainRequest(input.content, conversation.currentRevisionId !== null);
      const result = await app.prisma.$transaction(async (tx) => {
        const task = await tx.task.create({
          data: {
            conversationId: id,
            userId: request.authUser.id,
            workspaceId: workspace.id,
            status: guard.allowed ? TaskStatus.QUEUED : TaskStatus.COMPLETED,
            currentPhase: guard.allowed ? TaskPhase.DOMAIN_GUARD : TaskPhase.REJECTED,
            mode: input.mode,
            freecadRequested: input.freecadRequested,
            requirementSnapshot: {
              version: 1,
              parentRevisionId: input.parentRevisionId,
              selectionIds: input.selections,
              attachmentIds: input.attachments,
            },
          },
        });
        const message = await tx.message.create({
          data: {
            conversationId: id,
            userId: request.authUser.id,
            taskId: task.id,
            role: 'USER',
            content: input.content,
            structuredParts: {
              selections: input.selections,
              attachments: input.attachments,
            },
            idempotencyKey,
          },
        });
        await publishDomainEvent(tx, {
          conversationId: id,
          taskId: task.id,
          type: 'task.created',
          data: { taskId: task.id, mode: task.mode },
        });

        if (!guard.allowed) {
          const agentMessage = await tx.message.create({
            data: {
              conversationId: id,
              taskId: task.id,
              role: 'AGENT',
              content:
                guard.category === 'unsafe_intent'
                  ? 'I can only use the restricted CAD modeling tools and cannot perform that action.'
                  : 'I can help with CAD modeling, CAD file analysis, and changes to the current model.',
            },
          });
          await publishDomainEvent(tx, {
            conversationId: id,
            taskId: task.id,
            type: 'agent.message.completed',
            data: { messageId: agentMessage.id },
          });
          await publishDomainEvent(tx, {
            conversationId: id,
            taskId: task.id,
            type: 'task.completed',
            data: { phase: TaskPhase.REJECTED },
          });
        }
        return { message, task, guard };
      });
      return reply.status(guard.allowed ? 202 : 200).send(result);
    },
  );

  app.post(
    '/api/conversations/:id/abort',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = idSchema.parse(request.params);
      const conversation = await app.prisma.conversation.findFirst({
        where: { id, userId: request.authUser.id, deletedAt: null },
      });
      if (conversation === null) throw notFound();
      const task = await app.prisma.task.findFirst({
        where: {
          conversationId: id,
          status: { in: [TaskStatus.QUEUED, TaskStatus.RUNNING, TaskStatus.WAITING_USER] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (task === null) return reply.status(204).send();

      await app.prisma.$transaction(async (tx) => {
        await tx.task.update({
          where: { id: task.id },
          data: { status: TaskStatus.ABORTING, abortedAt: new Date() },
        });
        await publishDomainEvent(tx, {
          conversationId: id,
          taskId: task.id,
          type: 'task.abort.requested',
          data: { taskId: task.id },
        });
      });
      return reply.status(202).send({ taskId: task.id, status: TaskStatus.ABORTING });
    },
  );
};
