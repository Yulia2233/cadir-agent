import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';

const querySchema = z.object({
  q: z.string().trim().max(500).default(''),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const modelCaseRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/model-cases', { preHandler: app.authenticate }, async (request) => {
    const query = querySchema.parse(request.query);
    const items = await app.prisma.modelCase.findMany({
      where: {
        status: 'PUBLISHED',
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: 'insensitive' as const } },
                { description: { contains: query.q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { publishedAt: 'desc' },
      take: query.limit,
      select: {
        id: true,
        familyId: true,
        version: true,
        title: true,
        description: true,
        tags: true,
        dimensions: true,
        geometrySummary: true,
        compatibility: true,
        publishedAt: true,
        artifacts: { select: { id: true, type: true, filename: true, checksum: true } },
      },
    });
    return { items };
  });

  app.get('/api/model-cases/:caseId', { preHandler: app.authenticate }, async (request) => {
    const { caseId } = z.object({ caseId: z.string().uuid() }).parse(request.params);
    const modelCase = await app.prisma.modelCase.findFirst({
      where: { id: caseId, status: 'PUBLISHED' },
      include: { artifacts: true },
    });
    if (modelCase === null) throw notFound();
    return modelCase;
  });

  app.get(
    '/api/model-cases/:caseId/artifacts/:artifactId/download',
    { preHandler: app.authenticate },
    async (request) => {
      const params = z
        .object({ caseId: z.string().uuid(), artifactId: z.string().uuid() })
        .parse(request.params);
      const artifact = await app.prisma.modelCaseArtifact.findFirst({
        where: { id: params.artifactId, caseId: params.caseId, modelCase: { status: 'PUBLISHED' } },
      });
      if (artifact === null) throw notFound();
      const stored = await app.objectStore.head(artifact.objectKey);
      if (stored.checksum !== artifact.checksum) throw notFound();
      return {
        url: await app.objectStore.signedDownloadUrl(artifact.objectKey, 300),
        filename: artifact.filename,
        checksum: artifact.checksum,
        expiresInSeconds: 300,
      };
    },
  );
};
