import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';

const connect = vi.fn(async () => undefined);
const disconnect = vi.fn(() => undefined);
const on = vi.fn(() => undefined);

const RedisMock = class RedisMock {
    connect = connect;
    disconnect = disconnect;
    on = on;
  };

vi.mock('ioredis', () => ({ default: RedisMock, Redis: RedisMock }));

describe('Redis lifecycle plugin', () => {
  afterEach(() => {
    connect.mockClear();
    disconnect.mockClear();
    on.mockClear();
  });

  it('connects during startup and disconnects during shutdown', async () => {
    const { redisPlugin } = await import('../src/plugins/redis.js');
    const app = Fastify({ logger: false });
    app.decorate(
      'config',
      loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://cadir:test@postgres:5432/cadir',
        REDIS_URL: 'redis://redis:6379/0',
        SESSION_SECRET: '01234567890123456789012345678901',
        CSRF_SECRET: '01234567890123456789012345678901',
        MODEL_CONFIG_KEK: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      }),
    );

    await app.register(redisPlugin);
    await app.ready();

    expect(connect).toHaveBeenCalledOnce();
    expect(app.redis).toBeDefined();
    await app.close();
    expect(disconnect).toHaveBeenCalledWith(false);
  });
});
