import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

export const databasePlugin = fp(async (app) => {
  const prisma = new PrismaClient({
    log: app.config.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
  await prisma.$connect();
  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
