import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

const PBKDF2_DIGEST = 'sha256';
const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_KEY_LENGTH = 32;

export function hashPassword(password: string, salt = randomBytes(16)): string {
  const derived = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [kind, iterationsRaw, saltRaw, hashRaw] = storedHash.split('$');
  const iterations = Number(iterationsRaw);

  if (kind !== 'pbkdf2' || !Number.isInteger(iterations) || !saltRaw || !hashRaw) return false;

  const expected = Buffer.from(hashRaw, 'base64url');
  const actual = pbkdf2Sync(password, Buffer.from(saltRaw, 'base64url'), iterations, expected.length, PBKDF2_DIGEST);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}
