import { describe, expect, it } from 'vitest';
import { assertObjectKey } from '../src/services/object-store.js';

describe('object storage namespace policy', () => {
  it.each([
    'uploads/user/conversation/file',
    'revisions/conversation/1/model.step',
    'candidates/candidate/model.json',
    'public-cases/case/1/model.py',
  ])('allows owned service namespace %s', (key) =>
    expect(() => assertObjectKey(key)).not.toThrow(),
  );

  it.each([
    'private/key',
    '../uploads/key',
    '/uploads/key',
    'uploads/../../secret',
    'uploads\\key',
  ])('rejects unsafe object key %s', (key) =>
    expect(() => assertObjectKey(key)).toThrow(/namespace/),
  );
});
