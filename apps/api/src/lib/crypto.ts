import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ENVELOPE_VERSION = 'v1';

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function decodeKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, 'base64url');
  if (key.length !== 32) {
    throw new Error('MODEL_CONFIG_KEK must be a 32-byte base64url value');
  }
  return key;
}

export function encryptSecret(plaintext: string, encodedKey: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', decodeKey(encodedKey), nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    nonce.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptSecret(envelope: string, encodedKey: string): string {
  const [version, nonceValue, tagValue, ciphertextValue] = envelope.split('.');
  if (
    version !== ENVELOPE_VERSION ||
    nonceValue === undefined ||
    tagValue === undefined ||
    ciphertextValue === undefined
  ) {
    throw new Error('Invalid encrypted secret envelope');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    decodeKey(encodedKey),
    Buffer.from(nonceValue, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function secureHashEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
