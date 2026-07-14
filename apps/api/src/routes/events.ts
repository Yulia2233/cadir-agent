import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';

const idSchema = z.object({ id: z.string().uuid() });

function formatEvent(event: {
  eventId: string;
  type: string;
  conversationId: string;
  taskId: string | null;
  data: unknown;
  createdAt: Date;
}): string {
  return `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify({
    event_id: event.eventId,
    conversation_id: event.conversationId,
    task_id: event.taskId,
    type: event.type,
    timestamp: event.createdAt.toISOString(),
    data: event.data,
  })}\n\n`;
}

export const eventRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/conversations/:id/events',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = idSchema.parse(request.params);
      const conversation = await app.prisma.conversation.findFirst({
        where: { id, userId: request.authUser.id, deletedAt: null },
        select: { id: true },
      });
      if (conversation === null) throw notFound();

      const lastEventId = request.headers['last-event-id'];
      let cursor = 0n;
      if (typeof lastEventId === 'string') {
        const previous = await app.prisma.domainEvent.findFirst({
          where: { eventId: lastEventId, conversationId: id },
          select: { id: true },
        });
        cursor = previous?.id ?? 0n;
      }

      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      reply.raw.write('retry: 2000\n\n');

      let closed = false;
      request.raw.on('close', () => {
        closed = true;
      });
      while (!closed) {
        const events = await app.prisma.domainEvent.findMany({
          where: { conversationId: id, id: { gt: cursor } },
          orderBy: { id: 'asc' },
          take: 100,
        });
        for (const event of events) {
          reply.raw.write(formatEvent(event));
          cursor = event.id;
        }
        if (events.length === 0) reply.raw.write(': heartbeat\n\n');
        await new Promise((resolve) => setTimeout(resolve, events.length > 0 ? 100 : 15_000));
      }
    },
  );
};
