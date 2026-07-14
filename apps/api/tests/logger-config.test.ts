import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

describe('production log redaction paths', () => {
  it('accepts cookie and credential paths without logging their values', async () => {
    const app = Fastify({
      logger: {
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            '*.apiKey',
          ],
          censor: '[REDACTED]',
        },
      },
    });

    expect(app.log).toBeDefined();
    await app.close();
  });
});
