import { z } from 'zod';
import { artifactTypeSchema, idSchema, taskPhaseSchema, timestampSchema } from './domain.js';

export const eventTypeSchema = z.enum([
  'conversation.title.updated',
  'task.created',
  'task.phase.changed',
  'task.completed',
  'task.failed',
  'agent.message.delta',
  'agent.message.completed',
  'skill.loading',
  'skill.loaded',
  'case.search.started',
  'case.search.completed',
  'code.writing',
  'code.written',
  'model.execution.started',
  'model.execution.progress',
  'model.execution.completed',
  'model.execution.failed',
  'model.validation.started',
  'model.validation.result',
  'model.render.started',
  'model.render.completed',
  'model.revision.published',
  'artifact.available',
  'selection.invalidated',
  'case.candidate.submitted',
]);
export type EventType = z.infer<typeof eventTypeSchema>;

const progressSchema = z.number().min(0).max(1).nullable();
const phaseDataSchema = z
  .object({
    phase: taskPhaseSchema,
    label: z.string().min(1).max(200),
    progress: progressSchema,
  })
  .strict();

export const eventDataSchemas = {
  'conversation.title.updated': z.object({ title: z.string().min(1).max(160) }),
  'task.created': z.object({ phase: taskPhaseSchema, status: z.literal('QUEUED') }).strict(),
  'task.phase.changed': phaseDataSchema,
  'task.completed': z.object({ revisionId: idSchema.nullable(), summary: z.string().max(2_000) }),
  'task.failed': z.object({ code: z.string().min(1).max(100), message: z.string().max(2_000) }),
  'agent.message.delta': z.object({ messageId: idSchema, delta: z.string().max(16_384) }),
  'agent.message.completed': z.object({ messageId: idSchema }),
  'skill.loading': z.object({ name: z.literal('simplecadapi') }),
  'skill.loaded': z.object({ name: z.literal('simplecadapi'), version: z.string().min(1) }),
  'case.search.started': z.object({ query: z.string().max(2_000) }),
  'case.search.completed': z.object({ caseIds: z.array(idSchema).max(50) }),
  'code.writing': z.object({ path: z.literal('Model/model.py') }),
  'code.written': z.object({ path: z.literal('Model/model.py'), checksum: z.string().min(1) }),
  'model.execution.started': z.object({ runtimeId: idSchema }),
  'model.execution.progress': z.object({ label: z.string().max(200), progress: progressSchema }),
  'model.execution.completed': z.object({ runtimeId: idSchema, exitCode: z.literal(0) }),
  'model.execution.failed': z.object({
    runtimeId: idSchema,
    exitCode: z.number().int().nullable(),
  }),
  'model.validation.started': z.object({ revisionNumber: z.number().int().positive() }),
  'model.validation.result': z.object({ passed: z.boolean(), summary: z.string().max(2_000) }),
  'model.render.started': z.object({ views: z.array(z.string()).max(7) }),
  'model.render.completed': z.object({ artifactIds: z.array(idSchema).max(7) }),
  'model.revision.published': z.object({
    revisionId: idSchema,
    revisionNumber: z.number().int().positive(),
  }),
  'artifact.available': z
    .object({ artifactId: idSchema, artifactType: artifactTypeSchema })
    .strict(),
  'selection.invalidated': z.object({ selectionId: idSchema, reason: z.string().max(500) }),
  'case.candidate.submitted': z.object({ candidateId: idSchema }),
} as const satisfies Record<EventType, z.ZodTypeAny>;

const eventEnvelopeBaseSchema = z.object({
  event_id: z.string().regex(/^evt_[A-Za-z0-9_-]+$/),
  conversation_id: idSchema,
  task_id: idSchema.nullable(),
  type: eventTypeSchema,
  timestamp: timestampSchema,
  sequence: z.number().int().nonnegative(),
});

export const cadirEventSchema = eventEnvelopeBaseSchema
  .extend({ data: z.record(z.unknown()) })
  .strict()
  .superRefine((event, context) => {
    const result = eventDataSchemas[event.type].safeParse(event.data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({ ...issue, path: ['data', ...issue.path] });
      }
    }
  });
export type CadirEvent = z.infer<typeof cadirEventSchema>;

export function parseCadirEvent(value: unknown): CadirEvent {
  return cadirEventSchema.parse(value);
}
