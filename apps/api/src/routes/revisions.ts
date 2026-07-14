import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import {
  findTopologyEntity,
  parseTopologyMap,
  resolveTopologyEntity,
} from '../services/topology.js';

const paramsSchema = z.object({ id: z.string().uuid(), revisionId: z.string().uuid() });
const inspectSchema = z.object({
  entityType: z.enum(['face', 'edge']),
  topologyRef: z.string().min(1).max(200),
});

export const revisionRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/conversations/:id/revisions', { preHandler: app.authenticate }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const conversation = await app.prisma.conversation.findFirst({
      where: { id, userId: request.authUser.id, deletedAt: null },
    });
    if (conversation === null) throw notFound();
    const items = await app.prisma.modelRevision.findMany({
      where: { conversationId: id, status: 'SUCCEEDED' },
      orderBy: { revisionNumber: 'desc' },
      include: { artifacts: true },
    });
    return {
      items: items.map((revision) => ({
        ...revision,
        artifacts: revision.artifacts.map((artifact) => ({
          ...artifact,
          size: artifact.size.toString(),
        })),
      })),
    };
  });

  app.get(
    '/api/conversations/:id/revisions/:revisionId',
    { preHandler: app.authenticate },
    async (request) => {
      const params = paramsSchema.parse(request.params);
      const revision = await ownedRevision(app, request.authUser.id, params.id, params.revisionId);
      return {
        ...revision,
        artifacts: revision.artifacts.map((artifact) => ({
          ...artifact,
          size: artifact.size.toString(),
        })),
      };
    },
  );

  app.get(
    '/api/conversations/:id/revisions/:revisionId/viewer',
    { preHandler: app.authenticate },
    async (request) => {
      const params = paramsSchema.parse(request.params);
      const revision = await ownedRevision(app, request.authUser.id, params.id, params.revisionId);
      const artifacts = Object.fromEntries(
        revision.artifacts.map((artifact) => [artifact.type, artifact]),
      );
      const glb = artifacts.GLB;
      const topology = artifacts.TOPOLOGY_MAP;
      const edges = artifacts.BREP_EDGES;
      if (glb === undefined || topology === undefined || edges === undefined)
        return { revisionId: revision.id, status: 'PROCESSING' };
      const metadata = revision.metadata as {
        unit?: string;
        bounds?: number[];
        solidCount?: number;
        viewerVersion?: string;
      };
      return {
        revisionId: revision.id,
        status: 'READY',
        version: metadata.viewerVersion ?? '1',
        unit: metadata.unit ?? 'mm',
        bounds: metadata.bounds ?? [0, 0, 0, 0, 0, 0],
        solidCount: metadata.solidCount ?? 1,
        glbUrl: await app.objectStore.signedDownloadUrl(glb.objectKey, 300),
        edgesUrl: await app.objectStore.signedDownloadUrl(edges.objectKey, 300),
        topologyMapUrl: await app.objectStore.signedDownloadUrl(topology.objectKey, 300),
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      };
    },
  );

  app.post(
    '/api/conversations/:id/revisions/:revisionId/selection/inspect',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = paramsSchema.parse(request.params);
      const input = inspectSchema.parse(request.body);
      const revision = await ownedRevision(app, request.authUser.id, params.id, params.revisionId);
      const map = await loadTopologyMap(app, revision);
      const entity = findTopologyEntity(map, input.entityType, input.topologyRef);
      const selection = await app.prisma.selection.create({
        data: {
          conversationId: params.id,
          revisionId: revision.id,
          userId: request.authUser.id,
          entityType: input.entityType,
          topologyRef: entity.topologyRef,
          displayId: entity.displayId,
          tags: entity.tags,
          signature: entity.signature,
          qlSelector: { entity: input.entityType, tags: entity.tags, signature: entity.signature },
          status: 'ACTIVE',
        },
      });
      return reply.status(201).send({
        ...selection,
        adjacentTopologyRefs: entity.adjacentTopologyRefs,
        unique: true,
        confidence: 1,
      });
    },
  );

  app.post(
    '/api/conversations/:id/revisions/:revisionId/selection/resolve',
    { preHandler: app.authenticate },
    async (request) => {
      const params = paramsSchema.parse(request.params);
      const input = z.object({ selectionId: z.string().uuid() }).parse(request.body);
      const nextRevision = await ownedRevision(
        app,
        request.authUser.id,
        params.id,
        params.revisionId,
      );
      const old = await app.prisma.selection.findFirst({
        where: { id: input.selectionId, conversationId: params.id, userId: request.authUser.id },
      });
      if (old === null) throw notFound();
      const oldRevision = await ownedRevision(app, request.authUser.id, params.id, old.revisionId);
      const oldMap = await loadTopologyMap(app, oldRevision);
      const nextMap = await loadTopologyMap(app, nextRevision);
      const oldEntity = findTopologyEntity(
        oldMap,
        old.entityType as 'face' | 'edge',
        old.topologyRef,
      );
      const resolution = resolveTopologyEntity(
        oldEntity,
        nextMap,
        old.entityType as 'face' | 'edge',
      );
      return { status: resolution.status, entity: resolution.entity };
    },
  );
};

async function ownedRevision(
  app: Parameters<FastifyPluginAsync>[0],
  userId: string,
  conversationId: string,
  revisionId: string,
) {
  const revision = await app.prisma.modelRevision.findFirst({
    where: { id: revisionId, conversationId, conversation: { userId, deletedAt: null } },
    include: { artifacts: true },
  });
  if (revision === null) throw notFound();
  return revision;
}

async function loadTopologyMap(
  app: Parameters<FastifyPluginAsync>[0],
  revision: Awaited<ReturnType<typeof ownedRevision>>,
) {
  const artifact = revision.artifacts.find((candidate) => candidate.type === 'TOPOLOGY_MAP');
  if (artifact === undefined) throw notFound();
  const bytes = await app.objectStore.getBytes(artifact.objectKey, 64 * 1024 * 1024);
  return parseTopologyMap(JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown, revision.id);
}
