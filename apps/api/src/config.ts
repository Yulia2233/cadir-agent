import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(3).default('cadir-artifacts'),
  S3_ACCESS_KEY: z.string().min(1).optional(),
  S3_SECRET_KEY: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  MODEL_CONFIG_KEK: z.string().min(43),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).default(43_200),
  WORKSPACE_ROOT: z.string().default('/data/workspaces'),
  RUNNER_INTERNAL_URL: z.string().url().default('http://runner:8091'),
  SIMPLECADAPI_VERSION: z.literal('2.0.1b1').default('2.0.1b1'),
  SIMPLECAD_SKILL_VERSION: z.literal('2.0.1b1').default('2.0.1b1'),
  TASK_WORKER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  TASK_WORKER_POLL_SECONDS: z.coerce.number().int().min(1).max(30).default(2),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = configSchema.parse(env);
  if ((config.S3_ACCESS_KEY === undefined) !== (config.S3_SECRET_KEY === undefined)) {
    throw new Error('S3_ACCESS_KEY and S3_SECRET_KEY must be configured together');
  }
  if (
    config.NODE_ENV === 'production' &&
    config.S3_ENDPOINT !== undefined &&
    config.S3_ACCESS_KEY === undefined
  ) {
    throw new Error('S3 credentials are required for a configured production S3 endpoint');
  }
  const runnerUrl = new URL(config.RUNNER_INTERNAL_URL);
  if (!['runner', '127.0.0.1', 'localhost'].includes(runnerUrl.hostname)) {
    throw new Error('RUNNER_INTERNAL_URL must target the internal Runner service');
  }
  return config;
}
