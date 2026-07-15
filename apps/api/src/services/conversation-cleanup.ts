import type { PrismaClient } from '@prisma/client';
import type { ObjectStore } from './object-store.js';
import { removeWorkspace } from './workspaces.js';

/** Best-effort cleanup removes private objects while retaining a tombstone. */
export async function cleanupConversationResources(input: {
  prisma: PrismaClient;
  objectStore: ObjectStore;
  workspaceRoot: string;
  conversationId: string;
  workspaceId: string | null;
  logger: { warn: (object: unknown, message: string) => void };
}): Promise<void> {
  const [uploads, artifacts] = await Promise.all([
    input.prisma.upload.findMany({
      where: { conversationId: input.conversationId },
      select: { objectKey: true },
    }),
    input.prisma.artifact.findMany({
      where: { revision: { conversationId: input.conversationId } },
      select: { objectKey: true },
    }),
  ]);
  const operations = [
    ...[...uploads, ...artifacts].map((item) => input.objectStore.delete(item.objectKey)),
    ...(input.workspaceId === null
      ? []
      : [removeWorkspace(input.workspaceRoot, input.workspaceId)]),
  ];
  const results = await Promise.allSettled(operations);
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    input.logger.warn(
      { conversationId: input.conversationId, failureCount: failures.length },
      'Conversation cleanup was partial',
    );
  }
  await input.prisma.conversation.update({
    where: { id: input.conversationId },
    data: { status: 'DELETED' },
  });
}
