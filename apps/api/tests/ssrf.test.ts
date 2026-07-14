import { describe, expect, it } from 'vitest';
import { isBlockedAddress } from '../src/lib/ssrf.js';

describe('SSRF address policy', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.1.1', '192.168.1.1', '169.254.169.254'])(
    'blocks private or metadata IPv4 address %s',
    (address) => expect(isBlockedAddress(address)).toBe(true),
  );

  it.each(['::1', 'fc00::1', 'fd00::1', 'fe80::1'])('blocks private IPv6 address %s', (address) =>
    expect(isBlockedAddress(address)).toBe(true),
  );

  it.each(['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'])('allows public address %s', (address) =>
    expect(isBlockedAddress(address)).toBe(false),
  );
});
