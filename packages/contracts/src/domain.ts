import { z } from 'zod';

export const idSchema = z.string().uuid();
export const timestampSchema = z.string().datetime({ offset: true });

export const taskStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'WAITING_USER',
  'NEEDS_USER',
  'ABORTING',
  'ABORTED',
  'FAILED',
  'COMPLETED',
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskPhaseSchema = z.enum([
  'DOMAIN_GUARD',
  'ANALYZE',
  'WAITING_USER',
  'RETRIEVE',
  'PLAN',
  'CODE',
  'EXECUTE',
  'VALIDATE',
  'VISUAL_REVIEW',
  'PUBLISH',
  'CASE_PACKAGE',
  'CASE_CANDIDATE',
  'REJECTED',
  'NEEDS_USER',
  'FAILED',
  'COMPLETED',
]);
export type TaskPhase = z.infer<typeof taskPhaseSchema>;

export const artifactTypeSchema = z.enum([
  'MODEL_PYTHON',
  'MODEL_JSON',
  'STEP',
  'STL',
  'VALIDATION',
  'PREVIEW_ISO',
  'PREVIEW_FRONT',
  'PREVIEW_BACK',
  'PREVIEW_LEFT',
  'PREVIEW_RIGHT',
  'PREVIEW_TOP',
  'PREVIEW_BOTTOM',
  'GLB',
  'TOPOLOGY_MAP',
  'BREP_EDGES',
  'BREP',
  'FREECAD_DOCUMENT',
  'FREECAD_SCRIPT',
]);
export type ArtifactType = z.infer<typeof artifactTypeSchema>;

export const candidateStatusSchema = z.enum([
  'PRECHECKING',
  'PRECHECK_FAILED',
  'CANDIDATE',
  'APPROVED',
  'REJECTED',
  'DUPLICATE',
  'DELETING',
  'DELETED',
]);
export type CandidateStatus = z.infer<typeof candidateStatusSchema>;

export const caseStatusSchema = z.enum(['PUBLISHED', 'DEPRECATED', 'UNPUBLISHED']);
export type CaseStatus = z.infer<typeof caseStatusSchema>;

export const selectionEntityTypeSchema = z.enum(['solid', 'face', 'edge', 'wire', 'vertex']);
export const selectionStatusSchema = z.enum(['ACTIVE', 'RECOVERED', 'AMBIGUOUS', 'INVALID']);
export const selectionSchema = z
  .object({
    id: idSchema,
    conversationId: idSchema,
    revisionId: idSchema,
    entityType: selectionEntityTypeSchema,
    topologyRef: z.string().min(1).max(512),
    displayId: z.string().min(1).max(160),
    tags: z.array(z.string().min(1).max(100)).max(100).default([]),
    signature: z.record(z.unknown()).default({}),
    qlSelector: z.record(z.unknown()).nullable().default(null),
    status: selectionStatusSchema,
    createdAt: timestampSchema,
  })
  .strict();
export type Selection = z.infer<typeof selectionSchema>;
