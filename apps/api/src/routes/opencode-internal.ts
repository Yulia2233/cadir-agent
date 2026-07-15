import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { TaskMode } from '@prisma/client';
import { CAD_AGENT_SYSTEM_PROMPT, parseCadToolCall } from '@cadir/opencode-adapter';
import { z } from 'zod';
import { decryptSecret } from '../lib/crypto.js';
import { AppError, notFound } from '../lib/errors.js';
import { validateExternalBaseUrl } from '../lib/ssrf.js';
import { publishDomainEvent } from '../services/events.js';

const sessionHeadersSchema = z.object({
  'x-cadir-opencode-session': z.string().min(1).max(160),
});

function requireInternalToken(request: FastifyRequest, expected: string): void {
  const authorization = request.headers.authorization;
  if (authorization !== `Bearer ${expected}`) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }
}

function openCodeMode(mode: TaskMode): 'PLAN' | 'BUILD' {
  return mode === TaskMode.PLAN ? 'PLAN' : 'BUILD';
}

function workingModelRoot(workspaceRoot: string, workspaceId: string, taskId: string): string {
  return path.join(workspaceRoot, workspaceId, 'working', taskId, 'Model');
}

export const opencodeInternalRoutes: FastifyPluginAsync = async (app) => {
  app.post('/internal/opencode/tools/:name', async (request) => {
    requireInternalToken(request, app.config.OPENCODE_TOOL_TOKEN);
    const { name } = z.object({ name: z.string().min(1).max(80) }).parse(request.params);
    const body = z
      .object({ conversationId: z.string().uuid(), taskId: z.string().uuid() })
      .passthrough()
      .parse(request.body);
    const task = await app.prisma.task.findFirst({
      where: { id: body.taskId, conversationId: body.conversationId },
      include: { workspace: true, conversation: true },
    });
    if (task === null) throw notFound();
    const parsed = parseCadToolCall(openCodeMode(task.mode), name, request.body);
    const modelRoot = workingModelRoot(app.config.WORKSPACE_ROOT, task.workspaceId, task.id);

    if (parsed.tool === 'load_simplecad_skill') {
      const input = parsed.input as typeof body & { document: string };
      const response = await fetch(
        new URL('/internal/skill/document', app.config.RUNNER_INTERNAL_URL),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ document: input.document }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok)
        throw new AppError(502, 'SKILL_READ_FAILED', 'Skill document is unavailable');
      const document = z
        .object({
          document: z.string(),
          content: z.string(),
          sha256: z.string(),
          version: z.string(),
        })
        .parse(await response.json());
      await app.prisma.auditLog.create({
        data: {
          action: 'skill.document.read',
          resourceType: 'task',
          resourceId: task.id,
          traceId: task.id,
          details: { document: input.document, sha256: document.sha256 },
        },
      });
      return document;
    }

    if (parsed.tool === 'write_model') {
      const input = parsed.input as typeof body & { source: string };
      await writeFile(path.join(modelRoot, 'model.py'), input.source, {
        encoding: 'utf8',
        mode: 0o660,
      });
      await publishDomainEvent(app.prisma, {
        conversationId: task.conversationId,
        taskId: task.id,
        type: 'code.written',
        data: { path: 'Model/model.py', checksum: 'recorded-at-execution' },
      });
      return { path: 'Model/model.py', bytes: Buffer.byteLength(input.source, 'utf8') };
    }

    if (parsed.tool === 'read_model') {
      const input = parsed.input as typeof body & { artifact: 'model.py' | 'model.json' };
      const content = await readFile(path.join(modelRoot, input.artifact), 'utf8');
      return { artifact: input.artifact, content };
    }

    if (parsed.tool === 'execute_model') {
      const response = await fetch(new URL('/internal/execute', app.config.RUNNER_INTERNAL_URL), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          task_id: task.id,
          workspace_path: path.dirname(modelRoot),
          timeout_seconds: 300,
          max_output_bytes: 1_048_576,
        }),
        signal: AbortSignal.timeout(310_000),
      });
      if (!response.ok) throw new AppError(502, 'RUNNER_FAILED', 'CAD Runner rejected the model');
      return response.json();
    }

    if (parsed.tool === 'inspect_geometry') {
      const input = parsed.input as typeof body & {
        entity: 'solid' | 'face' | 'edge';
        index?: number;
        fields: string[];
      };
      const response = await fetch(new URL('/internal/inspect', app.config.RUNNER_INTERNAL_URL), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspace_path: path.dirname(modelRoot),
          entity: input.entity,
          ...(input.index === undefined ? {} : { index: input.index }),
          fields: input.fields,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new AppError(502, 'INSPECTION_FAILED', 'Geometry inspection failed');
      return response.json();
    }

    if (parsed.tool === 'search_model_cases') {
      const input = parsed.input as typeof body & { query: string; limit: number };
      const cases = await app.prisma.modelCase.findMany({
        where: {
          status: 'PUBLISHED',
          OR: [
            { title: { contains: input.query, mode: 'insensitive' } },
            { description: { contains: input.query, mode: 'insensitive' } },
          ],
        },
        take: input.limit,
        select: {
          id: true,
          title: true,
          description: true,
          dimensions: true,
          compatibility: true,
          artifacts: { select: { type: true, filename: true } },
        },
      });
      await app.prisma.modelCaseRetrievalLog.create({
        data: {
          userId: task.userId,
          conversationId: task.conversationId,
          taskId: task.id,
          query: input.query,
          returnedCaseIds: cases.map((item) => item.id),
        },
      });
      return { items: cases };
    }

    if (parsed.tool === 'get_model_case') {
      const input = parsed.input as typeof body & { caseId: string };
      const modelCase = await app.prisma.modelCase.findFirst({
        where: { id: input.caseId, status: 'PUBLISHED' },
        include: { artifacts: true },
      });
      if (modelCase === null) throw notFound();
      return modelCase;
    }

    throw new AppError(409, 'TOOL_PHASE_CONTROLLED', 'This tool is controlled by the workflow');
  });

  app.post('/internal/provider/v1/*', async (request, reply) => {
    const headers = sessionHeadersSchema.parse(request.headers);
    if (request.headers['x-cadir-opencode-token'] !== app.config.OPENCODE_TOOL_TOKEN) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
    }
    const conversation = await app.prisma.conversation.findFirst({
      where: { opencodeSessionId: headers['x-cadir-opencode-session'] },
      select: { userId: true, deletedAt: true },
    });
    if (conversation === null || conversation.deletedAt !== null) throw notFound();
    const provider = await app.prisma.userModelConfig.findFirst({
      where: { userId: conversation.userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (provider === null) {
      throw new AppError(409, 'PROVIDER_REQUIRED', 'Configure a model Provider before modeling');
    }
    const wildcard = (request.params as { '*': string })['*'].replace(/^\/+/, '');
    if (!['chat/completions', 'responses'].includes(wildcard)) {
      throw new AppError(404, 'NOT_FOUND', 'Resource not found');
    }
    await validateExternalBaseUrl(provider.baseUrl);
    const upstream = new URL(wildcard, `${provider.baseUrl.replace(/\/+$/, '')}/`);
    const providerBody =
      typeof request.body === 'object' && request.body !== null
        ? { ...(request.body as Record<string, unknown>), model: provider.modelId }
        : request.body;
    const body = providerBody === undefined ? undefined : JSON.stringify(providerBody);
    const response = await fetch(upstream, {
      method: request.method,
      headers: {
        authorization: `Bearer ${decryptSecret(provider.encryptedApiKey, app.config.MODEL_CONFIG_KEK)}`,
        'content-type': request.headers['content-type'] ?? 'application/json',
        accept: request.headers.accept ?? 'application/json',
      },
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) {
      const upstreamType = response.headers.get('content-type') ?? '';
      const upstreamText = await response.text();
      request.log.warn(
        {
          providerStatus: response.status,
          providerError: safeProviderError(upstreamText),
          providerPath: wildcard,
        },
        'Provider request was rejected',
      );
      reply
        .status(response.status)
        .type(upstreamType.includes('json') ? upstreamType : 'application/json');
      return reply.send(
        upstreamType.includes('json')
          ? upstreamText
          : JSON.stringify({ error: { message: 'Provider rejected the request' } }),
      );
    }
    reply.status(response.status);
    for (const name of ['content-type', 'cache-control']) {
      const value = response.headers.get(name);
      if (value !== null) reply.header(name, value);
    }
    return reply.send(response.body === null ? null : Readable.fromWeb(response.body));
  });
};

function safeProviderError(value: string): string {
  return value
    .replace(/(?:Bearer\s+)?sk-[A-Za-z0-9_-]{12,}/giu, '[REDACTED]')
    .replace(/[A-Za-z]:\\[^\s]+|\/(?:data|home|srv|opt|tmp)\/[^\s]+/gu, '[internal path]')
    .slice(0, 2_000);
}

export { CAD_AGENT_SYSTEM_PROMPT };
