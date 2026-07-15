import argon2 from 'argon2';
import { describe, expect, it, vi } from 'vitest';
import { createSession, verifyLoginPassword } from '../src/routes/auth.js';

describe('authentication session rotation', () => {
  it('verifies a password hash and rejects the same password for an unknown account', async () => {
    const hash = await argon2.hash('correct horse battery staple', { type: argon2.argon2id });

    await expect(verifyLoginPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyLoginPassword('correct horse battery staple', null)).resolves.toBe(false);
    await expect(verifyLoginPassword('wrong password', hash)).resolves.toBe(false);
  });

  it('revokes the replaced session and audits the rotation atomically', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockResolvedValue({ id: 'new-session' });
    const audit = vi.fn().mockResolvedValue({ id: 1n });
    const transaction = vi.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({ authSession: { updateMany, create }, auditLog: { create: audit } }),
    );
    const setCookie = vi.fn();
    const send = vi.fn((body: unknown) => body);

    await createSession(
      {
        config: { COOKIE_SECURE: true, SESSION_TTL_SECONDS: 3_600 },
        prisma: { $transaction: transaction },
      } as never,
      'trace-1',
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'user@example.test',
        displayName: 'User',
        role: 'USER',
      },
      { setCookie, send } as never,
      '22222222-2222-4222-8222-222222222222',
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: '22222222-2222-4222-8222-222222222222',
          revokedAt: null,
        }),
      }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'auth.session.refreshed' }),
      }),
    );
    expect(setCookie).toHaveBeenCalledWith(
      '__Host-cadir_session',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict' }),
    );
  });
});
