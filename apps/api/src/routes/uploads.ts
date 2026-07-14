import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { MAX_UPLOAD_BYTES, safeUploadFilename, validateUpload } from '../services/uploads.js';

const idSchema = z.object({ id: z.string().uuid() });

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  await app.register(multipart, {
    limits: { files: 1, fileSize: MAX_UPLOAD_BYTES, fields: 10, parts: 11 },
  });

  app.post(
    '/api/conversations/:id/uploads',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id: conversationId } = idSchema.parse(request.params);
      const conversation = await app.prisma.conversation.findFirst({
        where: { id: conversationId, userId: request.authUser.id, deletedAt: null },
        select: { id: true },
      });
      if (conversation === null) throw notFound();
      const file = await request.file();
      if (file === undefined) throw notFound();
      const body = await file.toBuffer();
      const checked = validateUpload({
        filename: file.filename,
        declaredContentType: file.mimetype,
        body,
      });
      const quota = await app.prisma.upload.aggregate({
        where: { conversation: { userId: request.authUser.id }, status: { not: 'DELETED' } },
        _sum: { size: true },
      });
      if ((quota._sum.size ?? 0n) + BigInt(checked.size) > 1024n * 1024n * 1024n) {
        return reply
          .status(413)
          .send({ error: { code: 'USER_QUOTA_EXCEEDED', message: 'Upload quota exceeded' } });
      }
      await app.objectStore.put(checked.objectKey, body, checked.contentType);
      const upload = await app.prisma.upload.create({
        data: {
          id: checked.id,
          conversationId,
          objectKey: checked.objectKey,
          filename: safeUploadFilename(file.filename),
          contentType: checked.contentType,
          size: BigInt(checked.size),
          checksum: checked.checksum,
          status: 'READY',
        },
      });
      return reply.status(201).send({ ...upload, size: upload.size.toString() });
    },
  );

  app.delete(
    '/api/conversations/:id/uploads/:uploadId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = z
        .object({ id: z.string().uuid(), uploadId: z.string().uuid() })
        .parse(request.params);
      const upload = await app.prisma.upload.findFirst({
        where: {
          id: params.uploadId,
          conversationId: params.id,
          conversation: { userId: request.authUser.id },
        },
      });
      if (upload === null) throw notFound();
      await app.objectStore.delete(upload.objectKey);
      await app.prisma.upload.update({ where: { id: upload.id }, data: { status: 'DELETED' } });
      return reply.status(204).send();
    },
  );
};
