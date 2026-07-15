import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const baseEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://cadir:test@postgres:5432/cadir',
  REDIS_URL: 'redis://redis:6379/0',
  SESSION_SECRET: '01234567890123456789012345678901',
  CSRF_SECRET: '01234567890123456789012345678901',
  MODEL_CONFIG_KEK: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  OPENCODE_INTERNAL_PASSWORD: '01234567890123456789012345678901',
  OPENCODE_TOOL_TOKEN: '01234567890123456789012345678901',
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

  it('rejects a public FreeCAD Worker endpoint', () => {
    expect(() =>
      loadConfig({ ...baseEnvironment, FREECAD_INTERNAL_URL: 'https://freecad.example.com' }),
    ).toThrow(/internal FreeCAD/);
  });

  it('rejects a public OpenCode endpoint', () => {
    expect(() =>
      loadConfig({ ...baseEnvironment, OPENCODE_INTERNAL_URL: 'https://opencode.example.com' }),
    ).toThrow(/internal OpenCode/);
  });

  it('keeps one-time administrator setup and insecure cookies disabled by default', () => {
    const config = loadConfig(baseEnvironment);
    expect(config.BOOTSTRAP_ADMIN_ENABLED).toBe(false);
    expect(config.COOKIE_SECURE).toBe(true);
    expect(config.TASK_MAX_AUTO_ITERATIONS).toBe(4);
  });

  it('rejects an invalid automatic repair limit', () => {
    expect(() => loadConfig({ ...baseEnvironment, TASK_MAX_AUTO_ITERATIONS: '0' })).toThrow();
  });
});
