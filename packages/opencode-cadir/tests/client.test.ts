import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenCodeClient, OPENCODE_COMMIT, OPENCODE_VERSION } from '../src/index.js';

afterEach(() => vi.unstubAllGlobals());

describe('pinned OpenCode client', () => {
  it('records the audited upstream release identity', () => {
    expect(OPENCODE_VERSION).toBe('1.4.9');
    expect(OPENCODE_COMMIT).toBe('803d9eb7ad5f4dfd832d7506a7cad83ded52253e');
  });

  it('uses authenticated internal health requests without exposing credentials', async () => {
    const fetchMock = vi.fn(async (_url: URL, init: RequestInit) => {
      expect(init.headers).toMatchObject({ authorization: expect.stringMatching(/^Basic /) });
      return new Response(JSON.stringify({ healthy: true, version: '1.4.9' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new OpenCodeClient('http://opencode:4096', {
      username: 'internal',
      password: '01234567890123456789012345678901',
    });

    await expect(client.health()).resolves.toEqual({ healthy: true, version: '1.4.9' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not append a session-wide deny rule over the CAD agent allow-list', async () => {
    const fetchMock = vi.fn(async (_url: URL, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toEqual({ title: 'CAD task' });
      return new Response(JSON.stringify({ id: 'session-1', title: 'CAD task' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new OpenCodeClient('http://opencode:4096', {
      username: 'internal',
      password: '01234567890123456789012345678901',
    });

    await expect(
      client.createSession({ directory: '/workspace', title: 'CAD task' }),
    ).resolves.toEqual({
      id: 'session-1',
      title: 'CAD task',
    });
  });
});
