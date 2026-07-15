import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { errorHandlerPlugin } from '../src/plugins/error-handler.js';

describe('API error boundary', () => {
  it('preserves expected Fastify client errors instead of turning them into 500 responses', async () => {
    const app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    app.post('/empty', async () => ({ ok: true }));

    const response = await app.inject({
      method: 'POST',
      url: '/empty',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'ignored=true',
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({
      error: { code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE' },
    });
    await app.close();
  });
});
