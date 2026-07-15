import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      const redisStatus = await app.redis.ping();
      if (redisStatus !== 'PONG') throw new Error('redis_unavailable');
      await app.objectStore.ready();
      await app.taskQueue.deadLetters(1);
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
      const opencodeHealth = await app.opencode.health().catch(() => null);
      const opencodeVersionMatch = opencodeHealth?.version === app.config.OPENCODE_VERSION;
      const freecadResponse = await fetch(
        new URL('/health/ready', app.config.FREECAD_INTERNAL_URL),
        {
          signal: AbortSignal.timeout(2_000),
        },
      );
      const freecadHealth = (await freecadResponse.json().catch(() => null)) as {
        status?: string;
        simplecadapi?: string;
      } | null;
      const freecadReady =
        freecadResponse.ok &&
        freecadHealth?.status === 'ready' &&
        freecadHealth.simplecadapi === app.config.SIMPLECADAPI_VERSION;
      if (!versionMatch || !runnerVersionMatch || !opencodeVersionMatch || !freecadReady) {
        return reply.status(503).send({ status: 'unavailable', reason: 'cad_version_mismatch' });
      }
      return {
        status: 'ready',
        dependencies: {
          database: 'ok',
          redis: 'ok',
          objectStorage: 'ok',
          runner: 'ok',
          opencode: 'ok',
          freecad: 'ok',
        },
        cad: {
          simplecadapi: app.config.SIMPLECADAPI_VERSION,
          skill: app.config.SIMPLECAD_SKILL_VERSION,
          opencode: app.config.OPENCODE_VERSION,
          opencodeCommit: app.config.OPENCODE_COMMIT,
        },
      };
    } catch {
      return reply.status(503).send({ status: 'unavailable', reason: 'dependency_unavailable' });
    }
  });
};
