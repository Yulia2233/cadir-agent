import type { FastifyPluginAsync } from 'fastify';
import { UserRole } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError, notFound } from '../lib/errors.js';

const CONSENT_VERSION = 'public-model-case-v1';
const revisionSchema = z.object({ revisionId: z.string().uuid() });
const metadataSchema = z.object({
  consent: z.literal(true),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4_000),
  tags: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  dimensions: z.record(z.number()).default({}),
  geometrySummary: z.record(z.unknown()).default({}),
});

function requireReviewer(role: UserRole): void {
  if (role !== UserRole.REVIEWER && role !== UserRole.ADMIN) {
    throw new AppError(403, 'REVIEWER_REQUIRED', 'Reviewer access is required');
  }
}

export const caseCandidateRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/revisions/:revisionId/case-candidates',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { revisionId } = revisionSchema.parse(request.params);
      const metadata = metadataSchema.parse(request.body);
      const revision = await app.prisma.modelRevision.findFirst({
        where: {
          id: revisionId,
          status: 'SUCCEEDED',
          validationStatus: 'PASSED',
          conversation: { userId: request.authUser.id, deletedAt: null },
        },
        include: { artifacts: true },
      });
      if (revision === null) throw notFound();
      const required = new Set(['MODEL_PYTHON', 'MODEL_JSON', 'STEP', 'STL', 'VALIDATION']);
      if (
        ![...required].every((type) =>
          revision.artifacts.some((artifact) => artifact.type === type),
        )
      ) {
        throw new AppError(409, 'INCOMPLETE_REVISION', 'Revision artifact package is incomplete');
      }
      const existing = await app.prisma.modelCaseCandidate.findUnique({
        where: { sourceRevisionId: revision.id },
      });
      if (existing !== null) return reply.status(200).send(existing);
      const candidate = await app.prisma.$transaction(async (tx) => {
        const consent = await tx.consentRecord.create({
          data: {
            userId: request.authUser.id,
            revisionId: revision.id,
            textVersion: CONSENT_VERSION,
            acceptedAt: new Date(),
          },
        });
        return tx.modelCaseCandidate.create({
          data: {
            sourceRevisionId: revision.id,
            sourceUserId: request.authUser.id,
            consentRecordId: consent.id,
            status: 'CANDIDATE',
            metadata: metadata as Prisma.InputJsonValue,
            precheckResult: { passed: true, requiredArtifacts: [...required] },
          },
        });
      });
      return reply.status(201).send(candidate);
    },
  );

  app.get('/api/admin/case-candidates', { preHandler: app.authenticate }, async (request) => {
    requireReviewer(request.authUser.role);
    return {
      items: await app.prisma.modelCaseCandidate.findMany({
        where: { status: { notIn: ['DELETED', 'DELETING'] } },
        orderBy: { createdAt: 'desc' },
        include: { sourceRevision: { include: { artifacts: true } }, consentRecord: true },
      }),
    };
  });

  app.post(
    '/api/admin/case-candidates/:candidateId/approve',
    { preHandler: app.authenticate },
    async (request) => {
      requireReviewer(request.authUser.role);
      const { candidateId } = z.object({ candidateId: z.string().uuid() }).parse(request.params);
      const input = z
        .object({
          title: z.string().trim().min(1).max(160),
          description: z.string().trim().min(1).max(4_000),
          tags: z.array(z.string().trim().min(1).max(100)).max(30),
          confirm: z.literal(true),
        })
        .parse(request.body);
      const candidate = await app.prisma.modelCaseCandidate.findFirst({
        where: { id: candidateId, status: 'CANDIDATE' },
        include: { sourceRevision: { include: { artifacts: true } } },
      });
      if (candidate === null) throw notFound();
      const familyId = crypto.randomUUID();
      return app.prisma.$transaction(async (tx) => {
        const published = await tx.modelCase.create({
          data: {
            familyId,
            version: 1,
            candidateId: candidate.id,
            title: input.title,
            description: input.description,
            tags: input.tags,
            dimensions: (candidate.metadata as { dimensions?: object }).dimensions ?? {},
            geometrySummary:
              (candidate.metadata as { geometrySummary?: object }).geometrySummary ?? {},
            compatibility: { simplecadapi: '2.0.1b1', skill: '2.0.1b1' },
            publishedAt: new Date(),
          },
        });
        for (const artifact of candidate.sourceRevision.artifacts) {
          const key = `public-cases/${familyId}/1/${artifact.filename}`;
          await app.objectStore.copy(artifact.objectKey, key);
          await tx.modelCaseArtifact.create({
            data: {
              caseId: published.id,
              caseVersion: 1,
              type: artifact.type,
              objectKey: key,
              filename: artifact.filename,
              checksum: artifact.checksum,
            },
          });
        }
        await tx.modelCaseReview.create({
          data: {
            candidateId: candidate.id,
            reviewerId: request.authUser.id,
            decision: 'APPROVED',
            metadataChanges: input,
          },
        });
        await tx.modelCaseCandidate.update({
          where: { id: candidate.id },
          data: { status: 'APPROVED' },
        });
        return published;
      });
    },
  );

  app.post(
    '/api/admin/case-candidates/:candidateId/reject',
    { preHandler: app.authenticate },
    async (request) => {
      requireReviewer(request.authUser.role);
      const { candidateId } = z.object({ candidateId: z.string().uuid() }).parse(request.params);
      const { reason } = z
        .object({ reason: z.string().trim().min(1).max(2_000) })
        .parse(request.body);
      const candidate = await app.prisma.modelCaseCandidate.findFirst({
        where: { id: candidateId, status: 'CANDIDATE' },
      });
      if (candidate === null) throw notFound();
      await app.prisma.$transaction([
        app.prisma.modelCaseCandidate.update({
          where: { id: candidate.id },
          data: { status: 'REJECTED' },
        }),
        app.prisma.modelCaseReview.create({
          data: {
            candidateId: candidate.id,
            reviewerId: request.authUser.id,
            decision: 'REJECTED',
            notes: reason,
          },
        }),
      ]);
      return { status: 'REJECTED' };
    },
  );
};
