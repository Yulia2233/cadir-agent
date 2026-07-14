import { describe, expect, it } from 'vitest';
import { normalizeWorkspaceRelativePath, safeDownloadFilename } from '../src/lib/path-security.js';

describe('workspace paths', () => {
  it.each(['../secret', 'Model/../../secret', '/etc/passwd', 'C:\\Windows\\system.ini'])(
    'rejects escaping path %s',
    (value) => expect(() => normalizeWorkspaceRelativePath(value)).toThrow(/not allowed/),
  );

  it('normalizes an allowed model path', () => {
    expect(normalizeWorkspaceRelativePath('Model\\viewer\\model.glb')).toBe(
      'Model/viewer/model.glb',
    );
  });

  it('creates a safe attachment name', () => {
    expect(safeDownloadFilename('../bad"name.step')).toBe('bad_name.step');
  });
});
