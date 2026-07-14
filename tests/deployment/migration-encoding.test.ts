import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('database migration portability', () => {
  it('stores the initial migration as UTF-8 without a byte-order mark', async () => {
    const migration = await readFile(
      new URL(
        '../../apps/api/prisma/migrations/20260714000100_initial/migration.sql',
        import.meta.url,
      ),
    );

    expect([...migration.subarray(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(migration.subarray(0, 3).toString('utf8')).toBe('-- ');
  });
});
