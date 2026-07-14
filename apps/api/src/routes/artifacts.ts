import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { safeDownloadFilename } from '../lib/path-security.js';

const idSchema = z.object({ artifactId: z.string().uuid() });

export const artifactRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/artifacts/:artifactId/download',
    { preHandler: app.authenticate },
    async (request) => {
      const { artifactId } = idSchema.parse(request.params);
      const artifact = await app.prisma.artifact.findFirst({
        where: {
          id: artifactId,
          revision: { conversation: { userId: request.authUser.id, deletedAt: null } },
        },
      });
      if (artifact === null) throw notFound();
      const stored = await app.objectStore.head(artifact.objectKey);
      if (stored.checksum !== artifact.checksum || BigInt(stored.size) !== artifact.size) {
        throw new Error('Artifact integrity verification failed');
      }
      return {
        url: await app.objectStore.signedDownloadUrl(artifact.objectKey, 300),
        filename: safeDownloadFilename(artifact.filename),
        contentType: artifact.contentType,
        size: artifact.size.toString(),
        checksum: artifact.checksum,
        expiresInSeconds: 300,
      };
    },
  );
};
