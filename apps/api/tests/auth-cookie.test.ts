import { describe, expect, it, vi } from 'vitest';
import { authRoutes, createSession } from '../src/routes/auth.js';
import { sessionCookieName } from '../src/plugins/auth.js';

describe('authentication cookies', () => {
  it('sets a readable strict CSRF cookie alongside the HTTP-only session cookie', async () => {
    type RouteHandler = (...args: unknown[]) => Promise<unknown>;
    const routes: Array<{ path: string; handler: RouteHandler }> = [];
    const app = {
      config: { COOKIE_SECURE: false, SESSION_TTL_SECONDS: 3_600 },
      prisma: {},
      post: (
        path: string,
        options: { handler?: RouteHandler } | RouteHandler,
        handler?: RouteHandler,
      ) => {
        routes.push({
          path,
          handler: typeof options === 'function' ? options : (options.handler ?? handler!),
        });
      },
      get: vi.fn(),
    };
    await authRoutes(app as never, {} as never);
    expect(routes.map((route) => route.path)).toContain('/api/auth/login');

    // The integration route test cannot authenticate without PostgreSQL; source registration
    // is still guarded here so future auth refactors cannot silently remove the CSRF cookie.
    const source = createSession.toString();
    expect(source).toMatch(/setCookie\(["']cadir_csrf["']/);
    expect(source).toContain('httpOnly: false');
    expect(source).toMatch(/sameSite: ["']strict["']/);
  });

  it('uses a host-prefixed cookie only when HTTPS secure cookies are enabled', () => {
    expect(sessionCookieName(true)).toBe('__Host-cadir_session');
    expect(sessionCookieName(false)).toBe('cadir_session');
  });
});
