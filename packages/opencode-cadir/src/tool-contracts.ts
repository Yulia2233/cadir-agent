import { z } from 'zod';
import { cadToolNameSchema, type AgentMode, assertToolAllowed } from './policy.js';

const workspaceContextSchema = z
  .object({
    conversationId: z.string().uuid(),
    taskId: z.string().uuid(),
  })
  .strict();

export const cadToolInputSchemas = {
  load_simplecad_skill: workspaceContextSchema.extend({
    document: z.string().min(1).max(255),
  }),
  search_model_cases: workspaceContextSchema.extend({
    query: z.string().min(1).max(1_000),
    geometryFamily: z.string().max(100).optional(),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  get_model_case: workspaceContextSchema.extend({ caseId: z.string().uuid() }),
  write_model: workspaceContextSchema.extend({
    source: z
      .string()
      .min(1)
      .max(512 * 1024),
  }),
  read_model: workspaceContextSchema.extend({ artifact: z.enum(['model.py', 'model.json']) }),
  execute_model: workspaceContextSchema,
  inspect_geometry: workspaceContextSchema.extend({
    entity: z.enum(['solid', 'face', 'edge']),
    index: z.number().int().nonnegative().optional(),
    fields: z
      .array(z.enum(['volume', 'area', 'length', 'normal', 'center', 'tags', 'count']))
      .min(1)
      .max(10),
  }),
  render_model_views: workspaceContextSchema.extend({
    views: z
      .array(z.enum(['iso', 'front', 'back', 'left', 'right', 'top', 'bottom']))
      .min(1)
      .max(7),
  }),
  export_model_artifacts: workspaceContextSchema,
  convert_freecad_artifacts: workspaceContextSchema.extend({ revisionId: z.string().uuid() }),
  submit_case_candidate: workspaceContextSchema.extend({ revisionId: z.string().uuid() }),
} satisfies Record<z.infer<typeof cadToolNameSchema>, z.ZodTypeAny>;

export function parseCadToolCall(mode: AgentMode, name: string, input: unknown) {
  const tool = assertToolAllowed(mode, name);
  return { tool, input: cadToolInputSchemas[tool].parse(input) };
}
