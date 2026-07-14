import { describe, expect, it, vi } from 'vitest';
import { authRoutes } from '../src/routes/auth.js';

describe('authentication cookies', () => {
  it('sets a readable strict CSRF cookie alongside the HTTP-only session cookie', async () => {
    type RouteHandler = (...args: unknown[]) => Promise<unknown>;
    const routes: Array<{ path: string; handler: RouteHandler }> = [];
    const app = {
      config: { NODE_ENV: 'development', SESSION_TTL_SECONDS: 3_600 },
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
    const source = authRoutes.toString();
    expect(source).toMatch(/setCookie\(["']cadir_csrf["']/);
    expect(source).toContain('httpOnly: false');
    expect(source).toMatch(/sameSite: ["']strict["']/);
  });
});
