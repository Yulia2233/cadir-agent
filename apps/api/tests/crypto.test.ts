import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../src/lib/crypto.js';

const key = Buffer.alloc(32, 7).toString('base64url');

describe('provider secret encryption', () => {
  it('round-trips without exposing plaintext in the envelope', () => {
    const plaintext = 'provider-test-secret';
    const envelope = encryptSecret(plaintext, key);

    expect(envelope).not.toContain(plaintext);
    expect(decryptSecret(envelope, key)).toBe(plaintext);
  });

  it('rejects a key with the wrong size', () => {
    expect(() => encryptSecret('value', 'short')).toThrow(/32-byte/);
  });
});
