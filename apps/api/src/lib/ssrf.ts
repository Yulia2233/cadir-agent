import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { AppError } from './errors.js';

const blockedHostnameSuffixes = ['.local', '.internal', '.localhost'];

function isBlockedIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some(Number.isNaN)) return true;
  const [a, b] = octets as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  );
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? isBlockedIpv4(address) : family === 6 ? isBlockedIpv6(address) : true;
}

export async function validateExternalBaseUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, 'INVALID_BASE_URL', 'Base URL is invalid');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new AppError(
      400,
      'INVALID_BASE_URL',
      'Base URL must use HTTPS without credentials or a custom port',
    );
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    blockedHostnameSuffixes.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new AppError(400, 'RESTRICTED_BASE_URL', 'Base URL is not allowed');
  }
  const resolved = await lookup(hostname, { all: true, verbatim: true });
  if (resolved.length === 0 || resolved.some((entry) => isBlockedAddress(entry.address))) {
    throw new AppError(400, 'RESTRICTED_BASE_URL', 'Base URL resolves to a restricted address');
  }
  return url;
}
