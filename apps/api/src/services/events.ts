import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

type EventWriter = Pick<PrismaClient, 'domainEvent'> | Prisma.TransactionClient;

export async function publishDomainEvent(
  writer: EventWriter,
  input: { conversationId: string; taskId?: string; type: string; data: Prisma.InputJsonValue },
) {
  return writer.domainEvent.create({
    data: {
      eventId: `evt_${randomUUID()}`,
      conversationId: input.conversationId,
      taskId: input.taskId ?? null,
      type: input.type,
      data: input.data,
    },
  });
}
