import type { Prisma, TaskPhase } from '@prisma/client';
import { assertPhaseTransition, statusForPhase } from '../domain/task-state.js';
import { publishDomainEvent } from './events.js';

const phaseLabels: Record<TaskPhase, string> = {
  DOMAIN_GUARD: 'Checking CAD request scope',
  ANALYZE: 'Analyzing requirements',
  WAITING_USER: 'Waiting for required dimensions',
  RETRIEVE: 'Searching similar model Cases',
  PLAN: 'Planning modeling steps',
  CODE: 'Writing Model/model.py',
  EXECUTE: 'Executing model',
  VALIDATE: 'Validating geometry',
  VISUAL_REVIEW: 'Generating standard views',
  PUBLISH: 'Publishing model revision',
  CASE_PACKAGE: 'Packaging model Case candidate',
  CASE_CANDIDATE: 'Submitting model Case candidate',
  REJECTED: 'Request is outside CAD scope',
  NEEDS_USER: 'More information is needed',
  FAILED: 'Task failed',
  COMPLETED: 'Task completed',
};

export async function transitionTask(
  tx: Prisma.TransactionClient,
  input: { taskId: string; conversationId: string; from: TaskPhase; to: TaskPhase },
) {
  assertPhaseTransition(input.from, input.to);
  const updated = await tx.task.updateMany({
    where: { id: input.taskId, currentPhase: input.from },
    data: { currentPhase: input.to, status: statusForPhase(input.to) },
  });
  if (updated.count !== 1) throw new Error('Task phase changed concurrently');
  await publishDomainEvent(tx, {
    conversationId: input.conversationId,
    taskId: input.taskId,
    type: 'task.phase.changed',
    data: { phase: input.to, label: phaseLabels[input.to], progress: null },
  });
}
