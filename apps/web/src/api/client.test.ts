import { describe, expect, it } from 'vitest';
import { currentCsrfToken } from './client';

describe('CSRF token selection', () => {
  it('prefers the current cookie over a stale session cache', () => {
    expect(currentCsrfToken('current-cookie', 'stale-cache')).toBe('current-cookie');
  });

  it('uses the cache only when the cookie is unavailable', () => {
    expect(currentCsrfToken(null, 'cached-token')).toBe('cached-token');
  });
});
