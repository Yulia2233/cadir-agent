import { z } from 'zod';
import { idSchema, taskPhaseSchema, taskStatusSchema, timestampSchema } from './domain.js';

export const API_CONTRACT_VERSION = '1.0.0';

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

export const cursorPageSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({ items: z.array(itemSchema), nextCursor: z.string().nullable() }).strict();

export const sendMessageRequestSchema = z
  .object({
    content: z.string().trim().min(1).max(100_000),
    parts: z.array(messagePartSchema).max(100).default([]),
    freecadRequested: z.boolean().default(false),
  })
  .strict();

export const restApiSchema = {
  authLogin: { method: 'POST', path: '/api/auth/login' },
  authLogout: { method: 'POST', path: '/api/auth/logout' },
  me: { method: 'GET', path: '/api/me' },
  modelConfigs: { method: 'GET', path: '/api/me/model-configs' },
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
  artifactDownload: { method: 'GET', path: '/api/artifacts/:artifactId/download' },
} as const;

export type RestApiOperation = keyof typeof restApiSchema;
export type RestApiRoute = (typeof restApiSchema)[RestApiOperation];
