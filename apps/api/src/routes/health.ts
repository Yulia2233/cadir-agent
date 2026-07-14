import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      const redisStatus = await app.redis.ping();
      if (redisStatus !== 'PONG') throw new Error('redis_unavailable');
      await app.objectStore.ready();
      const runnerResponse = await fetch(new URL('/health/ready', app.config.RUNNER_INTERNAL_URL), {
        signal: AbortSignal.timeout(2_000),
      });
      if (!runnerResponse.ok) throw new Error('runner_unavailable');
      const runnerHealth = (await runnerResponse.json()) as {
        status?: string;
        simplecadapi?: string;
        skill?: string;
      };
      const versionMatch = app.config.SIMPLECADAPI_VERSION === app.config.SIMPLECAD_SKILL_VERSION;
      const runnerVersionMatch =
        runnerHealth.status === 'ready' &&
        runnerHealth.simplecadapi === app.config.SIMPLECADAPI_VERSION &&
        runnerHealth.skill === app.config.SIMPLECAD_SKILL_VERSION;
      if (!versionMatch || !runnerVersionMatch) {
        return reply.status(503).send({ status: 'unavailable', reason: 'cad_version_mismatch' });
      }
      return {
        status: 'ready',
        dependencies: { database: 'ok', redis: 'ok', objectStorage: 'ok', runner: 'ok' },
        cad: {
          simplecadapi: app.config.SIMPLECADAPI_VERSION,
          skill: app.config.SIMPLECAD_SKILL_VERSION,
        },
      };
    } catch {
      return reply.status(503).send({ status: 'unavailable', reason: 'dependency_unavailable' });
    }
  });
};
