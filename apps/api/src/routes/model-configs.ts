import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { notFound } from '../lib/errors.js';
import { validateExternalBaseUrl } from '../lib/ssrf.js';

const createSchema = z.object({
  provider: z.string().trim().min(1).max(80),
  baseUrl: z.string().trim().max(2048),
  apiKey: z.string().min(1).max(4096),
  modelId: z.string().trim().min(1).max(200),
  isDefault: z.boolean().default(false),
});

const idSchema = z.object({ id: z.string().uuid() });

function publicConfig(config: {
  id: string;
  provider: string;
  baseUrl: string;
  modelId: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return { ...config, apiKeyConfigured: true };
}

export const modelConfigRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/me/model-configs', { preHandler: app.authenticate }, async (request) => {
    const configs = await app.prisma.userModelConfig.findMany({
      where: { userId: request.authUser.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        provider: true,
        baseUrl: true,
        modelId: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { items: configs.map(publicConfig) };
  });

  app.post('/api/me/model-configs', { preHandler: app.authenticate }, async (request, reply) => {
    const input = createSchema.parse(request.body);
    const baseUrl = await validateExternalBaseUrl(input.baseUrl);
    const result = await app.prisma.$transaction(async (tx) => {
      const count = await tx.userModelConfig.count({ where: { userId: request.authUser.id } });
      const makeDefault = input.isDefault || count === 0;
      if (makeDefault) {
        await tx.userModelConfig.updateMany({
          where: { userId: request.authUser.id },
          data: { isDefault: false },
        });
      }
      return tx.userModelConfig.create({
        data: {
          userId: request.authUser.id,
          provider: input.provider,
          baseUrl: baseUrl.toString().replace(/\/$/, ''),
          encryptedApiKey: encryptSecret(input.apiKey, app.config.MODEL_CONFIG_KEK),
          modelId: input.modelId,
          isDefault: makeDefault,
        },
        select: {
          id: true,
          provider: true,
          baseUrl: true,
          modelId: true,
          isDefault: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
    return reply.status(201).send(publicConfig(result));
  });

  app.post('/api/me/model-configs/:id/test', { preHandler: app.authenticate }, async (request) => {
    const { id } = idSchema.parse(request.params);
    const config = await app.prisma.userModelConfig.findFirst({
      where: { id, userId: request.authUser.id },
    });
    if (config === null) throw notFound();
    await validateExternalBaseUrl(config.baseUrl);

    // Decryption remains inside the provider adapter boundary and is never logged.
    const apiKey = decryptSecret(config.encryptedApiKey, app.config.MODEL_CONFIG_KEK);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      return response.ok
        ? { status: 'succeeded' }
        : { status: 'failed', reason: 'provider_rejected_request' };
    } catch {
      return { status: 'failed', reason: 'provider_unreachable' };
    } finally {
      clearTimeout(timeout);
    }
  });
};
