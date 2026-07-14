import { describe, expect, it } from 'vitest';
import { safeUploadFilename, validateUpload } from '../src/services/uploads.js';

describe('upload validation', () => {
  it('accepts PNG content that matches extension and MIME', () => {
    const result = validateUpload({
      filename: 'drawing.png',
      declaredContentType: 'image/png',
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
    });
    expect(result.objectKey).toMatch(/^uploads\/[0-9a-f-]+\/original$/u);
  });

  it('rejects an executable renamed to PNG', () => {
    expect(() =>
      validateUpload({
        filename: 'payload.png',
        declaredContentType: 'image/png',
        body: Buffer.from('MZ executable'),
      }),
    ).toThrow('signature');
  });

  it('rejects zero-byte and unsupported files', () => {
    expect(() =>
      validateUpload({
        filename: 'empty.pdf',
        declaredContentType: 'application/pdf',
        body: new Uint8Array(),
      }),
    ).toThrow('empty');
    expect(() =>
      validateUpload({
        filename: 'script.exe',
        declaredContentType: 'application/octet-stream',
        body: Buffer.from('MZ'),
      }),
    ).toThrow('not supported');
  });

  it('normalizes an unsafe client filename', () => {
    expect(safeUploadFilename('../../设计\u0000.stp')).toContain('设计_');
    expect(safeUploadFilename('../../设计\u0000.stp')).not.toContain('..');
  });
});
