interface GuestClaims { shareId: string; dinnerId: string; version: number; exp: number; }

function encode(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = ''; bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decode(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function key(): Promise<CryptoKey> {
  const secret = Deno.env.get('GUEST_TOKEN_SECRET');
  if (!secret || secret.length < 32) throw new Error('Guest access is not configured.');
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signGuestToken(claims: Omit<GuestClaims, 'exp'>): Promise<string> {
  const payload = encode(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 }));
  const signature = await crypto.subtle.sign('HMAC', await key(), new TextEncoder().encode(payload));
  return `${payload}.${encode(new Uint8Array(signature))}`;
}

export async function verifyGuestToken(token: string): Promise<GuestClaims> {
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !await crypto.subtle.verify('HMAC', await key(), decode(signature), new TextEncoder().encode(payload))) throw new Error('Invalid guest token.');
  const claims = JSON.parse(new TextDecoder().decode(decode(payload))) as GuestClaims;
  if (!claims.shareId || !claims.dinnerId || claims.exp < Date.now() / 1000) throw new Error('Guest token has expired.');
  return claims;
}

export async function hashIp(value: string): Promise<string> {
  const salt = Deno.env.get('GUEST_RATE_LIMIT_SALT') || Deno.env.get('GUEST_TOKEN_SECRET') || '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${value}`));
  return encode(new Uint8Array(digest));
}

