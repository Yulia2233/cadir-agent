import { z } from 'zod';
import {
  candidateStatusSchema,
  caseStatusSchema,
  idSchema,
  selectionSchema,
  taskPhaseSchema,
  taskStatusSchema,
  timestampSchema,
} from './domain.js';

export const API_CONTRACT_VERSION = '1.0.0';

export const providerModelsSchema = z
  .object({ items: z.array(z.string().min(1).max(200)).max(500) })
  .strict();

export const apiErrorSchema = z
  .object({
    error: z.object({
      code: z.string().min(1),
      message: z.string().min(1),
      requestId: z.string().min(1).optional(),
      details: z.unknown().optional(),
    }),
  })
  .strict();

export const conversationSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1).max(160),
    titleSource: z.enum(['system', 'agent', 'user']),
    status: z.enum([
      'IDLE',
      'RUNNING',
      'WAITING_USER',
      'FAILED',
      'COMPLETED',
      'ARCHIVED',
      'DELETING',
    ]),
    currentRevisionId: idSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const messagePartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().max(100_000) }).strict(),
  z
    .object({ type: z.literal('attachment'), uploadId: idSchema, filename: z.string().max(255) })
    .strict(),
  z.object({ type: z.literal('selection'), selectionId: idSchema }).strict(),
  z.object({ type: z.literal('artifact'), artifactId: idSchema }).strict(),
]);
export const messageSchema = z
  .object({
    id: idSchema,
    conversationId: idSchema,
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().max(100_000),
    structuredParts: z.array(messagePartSchema).max(100),
    createdAt: timestampSchema,
  })
  .strict();

export const taskSchema = z
  .object({
    id: idSchema,
    conversationId: idSchema,
    status: taskStatusSchema,
    currentPhase: taskPhaseSchema,
    freecadRequested: z.boolean(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const taskModeSchema = z.enum(['AUTO', 'PLAN', 'TARGET']);
export const requirementSnapshotSchema = z
  .object({
    version: z.number().int().positive(),
    partType: z.string().max(200).nullable().default(null),
    unit: z.enum(['mm', 'cm', 'm', 'in']).default('mm'),
    dimensions: z.record(z.number().finite()).default({}),
    features: z.array(z.string().min(1).max(500)).max(100).default([]),
    constraints: z.array(z.string().min(1).max(500)).max(100).default([]),
    solidCount: z.number().int().positive().nullable().default(null),
    freecadRequested: z.boolean().default(false),
    selectionIds: z.array(idSchema).max(20).default([]),
    attachmentIds: z.array(idSchema).max(20).default([]),
    parentRevisionId: idSchema.nullable().default(null),
    missing: z.array(z.string().min(1).max(200)).max(50).default([]),
    conflicts: z.array(z.string().min(1).max(500)).max(50).default([]),
  })
  .strict();

export const revisionSchema = z
  .object({
    id: idSchema,
    conversationId: idSchema,
    taskId: idSchema,
    revisionNumber: z.number().int().positive(),
    parentRevisionId: idSchema.nullable(),
    status: z.enum(['PUBLISHING', 'SUCCEEDED', 'FAILED']),
    validationStatus: z.enum(['PENDING', 'PASSED', 'FAILED']),
    createdAt: timestampSchema,
  })
  .strict();

export const viewerManifestSchema = z
  .object({
    revisionId: idSchema,
    status: z.enum(['PROCESSING', 'READY', 'FAILED']),
    version: z.string().min(1).max(100),
    unit: z.string().min(1).max(32),
    bounds: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
    solidCount: z.number().int().nonnegative(),
    glbUrl: z.string().url().nullable(),
    edgesUrl: z.string().url().nullable(),
    topologyMapUrl: z.string().url().nullable(),
    expiresAt: timestampSchema.nullable(),
  })
  .strict();

export const topologySignatureSchema = z
  .object({
    geometryType: z.string().min(1).max(80),
    center: z.tuple([z.number(), z.number(), z.number()]).nullable().default(null),
    normal: z.tuple([z.number(), z.number(), z.number()]).nullable().default(null),
    axis: z.tuple([z.number(), z.number(), z.number()]).nullable().default(null),
    area: z.number().nonnegative().nullable().default(null),
    length: z.number().nonnegative().nullable().default(null),
    radius: z.number().nonnegative().nullable().default(null),
  })
  .strict();

export const topologyEntitySchema = z
  .object({
    displayId: z.string().min(1).max(40),
    topologyRef: z.string().min(1).max(200),
    tags: z.array(z.string().min(1).max(100)).max(100),
    signature: topologySignatureSchema,
    adjacentTopologyRefs: z.array(z.string().min(1).max(200)).max(100),
  })
  .strict();

export const topologyMapSchema = z
  .object({
    version: z.string().min(1).max(100),
    revisionId: idSchema,
    unit: z.string().min(1).max(32),
    faces: z
      .array(
        topologyEntitySchema.extend({
          triangleStart: z.number().int().nonnegative(),
          triangleCount: z.number().int().positive(),
        }),
      )
      .max(1_000_000),
    edges: z
      .array(
        topologyEntitySchema.extend({
          polylineStart: z.number().int().nonnegative(),
          polylineCount: z.number().int().positive(),
        }),
      )
      .max(1_000_000),
  })
  .strict();

export const selectionInspectRequestSchema = z
  .object({ entityType: z.enum(['face', 'edge']), topologyRef: z.string().min(1).max(200) })
  .strict();
export const selectionInspectResponseSchema = selectionSchema.extend({
  adjacentTopologyRefs: z.array(z.string().min(1).max(200)).max(100),
  unique: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export const uploadSchema = z
  .object({
    id: idSchema,
    conversationId: idSchema,
    filename: z.string().min(1).max(255),
    contentType: z.string().min(1).max(160),
    size: z.number().int().positive(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(['SCANNING', 'PROCESSING', 'READY', 'REJECTED', 'FAILED']),
    createdAt: timestampSchema,
  })
  .strict();

export const modelCaseSummarySchema = z
  .object({
    id: idSchema,
    familyId: idSchema,
    version: z.number().int().positive(),
    title: z.string().min(1).max(160),
    description: z.string().max(10_000),
    tags: z.array(z.string().min(1).max(100)).max(100),
    dimensions: z.record(z.number().finite()),
    compatibility: z.record(z.unknown()),
    status: caseStatusSchema,
    score: z.number().min(0).max(1).optional(),
  })
  .strict();

export const caseCandidateSchema = z
  .object({
    id: idSchema,
    sourceRevisionId: idSchema,
    status: candidateStatusSchema,
    metadata: z.record(z.unknown()),
    precheckResult: z.record(z.unknown()).nullable(),
    version: z.number().int().positive(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const freecadConversionSchema = z
  .object({
    status: z.enum(['not_requested', 'queued', 'succeeded', 'failed', 'unsupported']),
    documentArtifactId: idSchema.nullable(),
    scriptArtifactId: idSchema.nullable(),
    reason: z.string().max(2_000).nullable(),
    freecadVersion: z.string().max(80).nullable(),
    adapterVersion: z.string().max(80).nullable(),
    workerVersion: z.string().max(80).nullable(),
  })
  .strict();

export const cursorPageSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({ items: z.array(itemSchema), nextCursor: z.string().nullable() }).strict();

export const sendMessageRequestSchema = z
  .object({
    content: z.string().trim().min(1).max(100_000),
    parts: z.array(messagePartSchema).max(100).default([]),
    mode: taskModeSchema.default('AUTO'),
    freecadRequested: z.boolean().default(false),
    parentRevisionId: idSchema.nullable().default(null),
  })
  .strict();

export const searchModelCasesRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(2_000),
    geometryFamily: z.string().trim().min(1).max(100).optional(),
    dimensions: z.record(z.number().finite()).optional(),
    backend: z.enum(['simplecad', 'freecad']).optional(),
    limit: z.number().int().min(1).max(20).default(5),
  })
  .strict();

export const submitCaseCandidateRequestSchema = z
  .object({
    consent: z.literal(true),
    consentTextVersion: z.string().min(1).max(40),
    metadata: z.record(z.unknown()).default({}),
  })
  .strict();

export const reviewCaseCandidateRequestSchema = z
  .object({
    decision: z.enum(['approve', 'reject', 'duplicate']),
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().max(10_000).optional(),
    tags: z.array(z.string().min(1).max(100)).max(100).optional(),
    notes: z.string().max(10_000).optional(),
    duplicateCaseId: idSchema.optional(),
    expectedUpdatedAt: timestampSchema,
  })
  .strict();

export const restApiSchema = {
  authLogin: { method: 'POST', path: '/api/auth/login' },
  authLogout: { method: 'POST', path: '/api/auth/logout' },
  me: { method: 'GET', path: '/api/me' },
  modelConfigs: { method: 'GET', path: '/api/me/model-configs' },
  modelConfigModels: { method: 'GET', path: '/api/me/model-configs/:id/models' },
  conversations: { method: 'GET', path: '/api/conversations' },
  conversationCreate: { method: 'POST', path: '/api/conversations' },
  conversation: { method: 'GET', path: '/api/conversations/:id' },
  messages: { method: 'GET', path: '/api/conversations/:id/messages' },
  messageCreate: { method: 'POST', path: '/api/conversations/:id/messages' },
  abort: { method: 'POST', path: '/api/conversations/:id/abort' },
  events: { method: 'GET', path: '/api/conversations/:id/events' },
  uploads: { method: 'POST', path: '/api/conversations/:id/uploads' },
  revisions: { method: 'GET', path: '/api/conversations/:id/revisions' },
  viewer: { method: 'GET', path: '/api/conversations/:id/revisions/:revisionId/viewer' },
  selectionInspect: {
    method: 'POST',
    path: '/api/conversations/:id/revisions/:revisionId/selection/inspect',
  },
  selectionResolve: {
    method: 'POST',
    path: '/api/conversations/:id/revisions/:revisionId/selection/resolve',
  },
  artifactDownload: { method: 'GET', path: '/api/artifacts/:artifactId/download' },
  candidateSubmit: { method: 'POST', path: '/api/revisions/:revisionId/case-candidates' },
  modelCases: { method: 'GET', path: '/api/model-cases' },
  modelCase: { method: 'GET', path: '/api/model-cases/:caseId' },
  candidateAdmin: { method: 'GET', path: '/api/admin/case-candidates' },
  candidateAdminDetail: { method: 'GET', path: '/api/admin/case-candidates/:id' },
  candidateApprove: { method: 'POST', path: '/api/admin/case-candidates/:id/approve' },
  candidateReject: { method: 'POST', path: '/api/admin/case-candidates/:id/reject' },
  modelCaseDeprecate: { method: 'POST', path: '/api/admin/model-cases/:id/deprecate' },
  modelCaseUnpublish: { method: 'POST', path: '/api/admin/model-cases/:id/unpublish' },
} as const;

export type RestApiOperation = keyof typeof restApiSchema;
export type RestApiRoute = (typeof restApiSchema)[RestApiOperation];
