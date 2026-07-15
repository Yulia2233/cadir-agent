import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

export const errorHandlerPlugin = fp(async (app) => {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
        traceId: request.id,
      });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: { issues: error.issues },
        },
        traceId: request.id,
      });
    }
    if ('statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: {
          code: typeof error.code === 'string' ? error.code : 'BAD_REQUEST',
          message: error.statusCode === 415 ? 'Unsupported request content type' : error.message,
        },
        traceId: request.id,
      });
    }

    request.log.error({ err: error }, 'Unhandled request error');
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed' },
      traceId: request.id,
    });
  });
});
