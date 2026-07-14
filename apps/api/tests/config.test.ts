import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const baseEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://cadir:test@postgres:5432/cadir',
  REDIS_URL: 'redis://redis:6379/0',
  SESSION_SECRET: '01234567890123456789012345678901',
  CSRF_SECRET: '01234567890123456789012345678901',
  MODEL_CONFIG_KEK: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
};

describe('server configuration', () => {
  it('requires credentials for a production S3-compatible endpoint', () => {
    expect(() => loadConfig({ ...baseEnvironment, S3_ENDPOINT: 'http://minio:9000' })).toThrow(
      /S3 credentials/,
    );
  });

  it('rejects a partial S3 credential pair', () => {
    expect(() => loadConfig({ ...baseEnvironment, S3_ACCESS_KEY: 'only-one' })).toThrow(
      /configured together/,
    );
  });

  it('rejects a public Runner endpoint', () => {
    expect(() =>
      loadConfig({ ...baseEnvironment, RUNNER_INTERNAL_URL: 'https://runner.example.com' }),
    ).toThrow(/internal Runner/);
  });
});
