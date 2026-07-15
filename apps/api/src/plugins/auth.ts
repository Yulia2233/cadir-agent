import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import { UserStatus } from '@prisma/client';
import type { UserRole } from '@prisma/client';
import { sha256, secureHashEquals } from '../lib/crypto.js';
import { forbidden, unauthorized } from '../lib/errors.js';

const SECURE_SESSION_COOKIE = '__Host-cadir_session';
const LOCAL_SESSION_COOKIE = 'cadir_session';

export function sessionCookieName(secure: boolean): string {
  return secure ? SECURE_SESSION_COOKIE : LOCAL_SESSION_COOKIE;
}

export const authPlugin = fp(async (app) => {
  app.decorate('authenticate', async (request: FastifyRequest) => {
    const sessionToken = request.cookies[sessionCookieName(app.config.COOKIE_SECURE)];
    if (sessionToken === undefined) throw unauthorized();

    const session = await app.prisma.authSession.findUnique({
      where: { tokenHash: sha256(sessionToken) },
      include: { user: true },
    });
    if (
      session === null ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date() ||
      session.user.status !== UserStatus.ACTIVE
    ) {
      throw unauthorized();
    }

    const method = request.method.toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrfToken = request.headers['x-csrf-token'];
      if (typeof csrfToken !== 'string' || !secureHashEquals(sha256(csrfToken), session.csrfHash)) {
        throw forbidden();
      }
    }

    request.authUser = {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      role: session.user.role,
      status: session.user.status,
    };
    request.authSessionId = session.id;
  });

  app.decorate('requireRole', (roles: UserRole[]) => {
    return async (request: FastifyRequest) => {
      await app.authenticate(request);
      if (!roles.includes(request.authUser.role)) throw forbidden();
    };
  });
});
