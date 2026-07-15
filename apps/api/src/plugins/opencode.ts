import fp from 'fastify-plugin';
import { OpenCodeClient } from '@cadir/opencode-adapter';

export const opencodePlugin = fp(async (app) => {
  const client = new OpenCodeClient(app.config.OPENCODE_INTERNAL_URL, {
    username: app.config.OPENCODE_INTERNAL_USERNAME,
    password: app.config.OPENCODE_INTERNAL_PASSWORD,
  });
  app.decorate('opencode', client);
});
