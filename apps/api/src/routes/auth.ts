import type { FastifyPluginAsync } from 'fastify';
import argon2 from 'argon2';
import { z } from 'zod';
import { UserStatus } from '@prisma/client';
import { randomToken, sha256 } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { SESSION_COOKIE } from '../plugins/auth.js';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(512),
});

const INVALID_CREDENTIALS = 'Email or password is incorrect';

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const input = loginSchema.parse(request.body);
      const user = await app.prisma.user.findUnique({ where: { email: input.email } });
      const passwordMatches =
        user !== null
          ? await argon2.verify(user.passwordHash, input.password).catch(() => false)
          : false;
      if (user === null || !passwordMatches) {
        throw new AppError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);
      }
      if (user.status !== UserStatus.ACTIVE) {
        throw new AppError(403, 'ACCOUNT_UNAVAILABLE', 'Account is unavailable');
      }

      const sessionToken = randomToken();
      const csrfToken = randomToken();
      const expiresAt = new Date(Date.now() + app.config.SESSION_TTL_SECONDS * 1000);
      const session = await app.prisma.authSession.create({
        data: {
          userId: user.id,
          tokenHash: sha256(sessionToken),
          csrfHash: sha256(csrfToken),
          expiresAt,
        },
      });
      reply.setCookie(SESSION_COOKIE, sessionToken, {
        path: '/',
        httpOnly: true,
        secure: app.config.NODE_ENV !== 'development',
        sameSite: 'strict',
        expires: expiresAt,
      });
      reply.setCookie('cadir_csrf', csrfToken, {
        path: '/',
        httpOnly: false,
        secure: app.config.NODE_ENV !== 'development',
        sameSite: 'strict',
        expires: expiresAt,
      });
      await app.prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'auth.login',
          resourceType: 'auth_session',
          resourceId: session.id,
          traceId: request.id,
        },
      });
      return reply.send({
        user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
        csrfToken,
        expiresAt: expiresAt.toISOString(),
      });
    },
  });

  app.post('/api/auth/logout', { preHandler: app.authenticate }, async (request, reply) => {
    await app.prisma.authSession.update({
      where: { id: request.authSessionId },
      data: { revokedAt: new Date() },
    });
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.clearCookie('cadir_csrf', { path: '/' });
    return reply.status(204).send();
  });

  app.get('/api/me', { preHandler: app.authenticate }, async (request) => ({
    user: request.authUser,
  }));
};
