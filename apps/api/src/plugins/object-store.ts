import fp from 'fastify-plugin';
import { ObjectStore } from '../services/object-store.js';

export const objectStorePlugin = fp(async (app) => {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY } = app.config;
  app.decorate(
    'objectStore',
    new ObjectStore(S3_BUCKET, {
      region: S3_REGION,
      ...(S3_ENDPOINT !== undefined ? { endpoint: S3_ENDPOINT } : {}),
      ...(S3_ACCESS_KEY !== undefined ? { accessKeyId: S3_ACCESS_KEY } : {}),
      ...(S3_SECRET_KEY !== undefined ? { secretAccessKey: S3_SECRET_KEY } : {}),
    }),
  );
});
