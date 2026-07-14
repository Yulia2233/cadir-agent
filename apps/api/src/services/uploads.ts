import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { AppError } from '../lib/errors.js';

const ALLOWED_UPLOADS = {
  png: { mime: 'image/png', signatures: [Buffer.from([0x89, 0x50, 0x4e, 0x47])] },
  jpg: { mime: 'image/jpeg', signatures: [Buffer.from([0xff, 0xd8, 0xff])] },
  jpeg: { mime: 'image/jpeg', signatures: [Buffer.from([0xff, 0xd8, 0xff])] },
  pdf: { mime: 'application/pdf', signatures: [Buffer.from('%PDF-')] },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    signatures: [Buffer.from('PK\x03\x04', 'binary')],
  },
  step: { mime: 'model/step', signatures: [Buffer.from('ISO-10303-21')] },
  stp: { mime: 'model/step', signatures: [Buffer.from('ISO-10303-21')] },
  stl: { mime: 'model/stl', signatures: [Buffer.from('solid'), Buffer.from([0x00, 0x00])] },
} as const;

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export function validateUpload(input: {
  filename: string;
  declaredContentType: string;
  body: Uint8Array;
}) {
  if (input.body.byteLength === 0) throw new AppError(400, 'EMPTY_UPLOAD', 'The file is empty');
  if (input.body.byteLength > MAX_UPLOAD_BYTES) {
    throw new AppError(413, 'UPLOAD_TOO_LARGE', 'The file exceeds the upload limit');
  }
  const extension = path
    .extname(input.filename)
    .slice(1)
    .toLowerCase() as keyof typeof ALLOWED_UPLOADS;
  const policy = ALLOWED_UPLOADS[extension];
  if (policy === undefined)
    throw new AppError(415, 'UNSUPPORTED_UPLOAD', 'The file type is not supported');
  if (
    input.declaredContentType !== policy.mime &&
    input.declaredContentType !== 'application/octet-stream'
  ) {
    throw new AppError(415, 'MIME_MISMATCH', 'The declared content type does not match the file');
  }
  const bytes = Buffer.from(input.body);
  const signatureMatches = policy.signatures.some((signature) =>
    bytes.subarray(0, signature.length).equals(signature),
  );
  if (!signatureMatches)
    throw new AppError(415, 'SIGNATURE_MISMATCH', 'The file signature is invalid');
  const id = randomUUID();
  return {
    id,
    contentType: policy.mime,
    checksum: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.byteLength,
    objectKey: `uploads/${id}/original`,
  };
}

export function safeUploadFilename(filename: string): string {
  const normalized = path
    .basename(filename.normalize('NFKC'))
    .replace(/[\u0000-\u001f\u007f]/gu, '_');
  return normalized.slice(0, 255) || 'upload';
}
