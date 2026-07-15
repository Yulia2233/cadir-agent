import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import argon2 from 'argon2';
import { z } from 'zod';
import { UserRole, UserStatus } from '@prisma/client';
import { randomToken, sha256 } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { sessionCookieName } from '../plugins/auth.js';

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
// Always verify one Argon2id hash, including for unknown accounts, so the
// authentication path does not expose an obvious account-enumeration timing gap.
const INVALID_LOGIN_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$pggnvFObKLVUYWOrLXzgNA$ougWj7LV4SAf7hXLE/jZD9YlN4KkBK5nL4UMUS+lwc8';

const bootstrapSchema = loginSchema.extend({
  displayName: z.string().trim().min(1).max(100),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/auth/bootstrap/status', async () => ({
    available: app.config.BOOTSTRAP_ADMIN_ENABLED && (await app.prisma.user.count()) === 0,
  }));

  app.post('/api/auth/bootstrap', {
    config: { rateLimit: { max: 3, timeWindow: '10 minutes' } },
    handler: async (request, reply) => {
      if (!app.config.BOOTSTRAP_ADMIN_ENABLED) {
        throw new AppError(404, 'NOT_FOUND', 'Resource not found');
      }
      const input = bootstrapSchema.parse(request.body);
      const user = await app.prisma.$transaction(async (tx) => {
        // Serialize first-user creation so concurrent requests cannot create multiple admins.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(1128354386)`;
        if ((await tx.user.count()) !== 0) {
          throw new AppError(409, 'BOOTSTRAP_CLOSED', 'Administrator setup is already complete');
        }
        return tx.user.create({
          data: {
            email: input.email,
            displayName: input.displayName,
            passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }),
            role: UserRole.ADMIN,
          },
        });
      });
      return createSession(app, request.id, user, reply);
    },
  });

  app.post('/api/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const input = loginSchema.parse(request.body);
      const user = await app.prisma.user.findUnique({ where: { email: input.email } });
      const passwordMatches = await verifyLoginPassword(input.password, user?.passwordHash ?? null);
      if (user === null || !passwordMatches) {
        throw new AppError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);
      }
      if (user.status !== UserStatus.ACTIVE) {
        throw new AppError(403, 'ACCOUNT_UNAVAILABLE', 'Account is unavailable');
      }

      return createSession(app, request.id, user, reply);
    },
  });

  app.post('/api/auth/refresh', { preHandler: app.authenticate }, async (request, reply) => {
    return createSession(app, request.id, request.authUser, reply, request.authSessionId);
  });

  app.post('/api/auth/logout', { preHandler: app.authenticate }, async (request, reply) => {
    await app.prisma.$transaction(async (tx) => {
      await tx.authSession.update({
        where: { id: request.authSessionId },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: request.authUser.id,
          action: 'auth.logout',
          resourceType: 'auth_session',
          resourceId: request.authSessionId,
          traceId: request.id,
        },
      });
    });
    reply.clearCookie(sessionCookieName(app.config.COOKIE_SECURE), { path: '/' });
    reply.clearCookie('cadir_csrf', { path: '/' });
    return reply.status(204).send();
  });

  app.get('/api/me', { preHandler: app.authenticate }, async (request) => ({
    user: request.authUser,
  }));
};

export async function createSession(
  app: Parameters<FastifyPluginAsync>[0],
  traceId: string,
  user: { id: string; email: string; displayName: string; role: UserRole },
  reply: FastifyReply,
  replacedSessionId?: string,
) {
  const sessionToken = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + app.config.SESSION_TTL_SECONDS * 1000);
  const session = await app.prisma.$transaction(async (tx) => {
    if (replacedSessionId !== undefined) {
      await tx.authSession.updateMany({
        where: { id: replacedSessionId, userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    const created = await tx.authSession.create({
      data: {
        userId: user.id,
        tokenHash: sha256(sessionToken),
        csrfHash: sha256(csrfToken),
        expiresAt,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: replacedSessionId === undefined ? 'auth.login' : 'auth.session.refreshed',
        resourceType: 'auth_session',
        resourceId: created.id,
        traceId,
        ...(replacedSessionId === undefined ? {} : { details: { replacedSessionId } }),
      },
    });
    return created;
  });
  reply.setCookie(sessionCookieName(app.config.COOKIE_SECURE), sessionToken, {
    path: '/',
    httpOnly: true,
    secure: app.config.COOKIE_SECURE,
    sameSite: 'strict',
    expires: expiresAt,
  });
  reply.setCookie('cadir_csrf', csrfToken, {
    path: '/',
    httpOnly: false,
    secure: app.config.COOKIE_SECURE,
    sameSite: 'strict',
    expires: expiresAt,
  });
  return reply.send({
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    csrfToken,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function verifyLoginPassword(password: string, storedHash: string | null) {
  const matches = await argon2
    .verify(storedHash ?? INVALID_LOGIN_HASH, password)
    .catch(() => false);
  return storedHash !== null && matches;
}
