import { sign, verifyPassword } from './crypto.js';
import type { DistributorAccount, SessionClaims } from './types.js';

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

function sessionCookieName(isProduction: boolean): string {
  return isProduction ? '__Host-treali_session' : 'treali_session';
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decode<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function loadAccounts(env: NodeJS.ProcessEnv = process.env): DistributorAccount[] {
  const raw = env.TREALI_ACCOUNTS_JSON;
  if (!raw) throw new Error('TREALI_ACCOUNTS_JSON não foi configurado.');

  const accounts = JSON.parse(raw) as DistributorAccount[];
  if (!Array.isArray(accounts) || accounts.some((account) => !account.id || !account.email || !account.passwordHash || !account.cityId || !account.citySlug)) {
    throw new Error('TREALI_ACCOUNTS_JSON possui um formato inválido.');
  }
  return accounts;
}

export function authenticate(email: string, password: string, env: NodeJS.ProcessEnv = process.env): DistributorAccount | null {
  const normalized = email.trim().toLocaleLowerCase('pt-BR');
  const account = loadAccounts(env).find((candidate) => candidate.email.toLocaleLowerCase('pt-BR') === normalized);
  return account && verifyPassword(password, account.passwordHash) ? account : null;
}

export function createSession(account: DistributorAccount, env: NodeJS.ProcessEnv = process.env, now = Date.now()): string {
  const secret = env.TREALI_SESSION_SECRET;
  if (!secret) throw new Error('TREALI_SESSION_SECRET não foi configurado.');

  const claims: SessionClaims = {
    distributorId: account.id,
    cityId: account.cityId,
    citySlug: account.citySlug,
    label: account.label,
    expiresAt: now + SESSION_DURATION_MS,
  };
  const payload = encode(claims);
  return `${payload}.${sign(payload, secret)}`;
}

export function readSession(request: Request, env: NodeJS.ProcessEnv = process.env, now = Date.now()): SessionClaims | null {
  const secret = env.TREALI_SESSION_SECRET;
  const token = readCookie(request.headers.get('cookie'), sessionCookieName(env.VERCEL === '1'));
  if (!secret || !token) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature || sign(payload, secret) !== signature) return null;

  const claims = decode<SessionClaims>(payload);
  if (!claims || claims.expiresAt <= now || !claims.distributorId || !claims.cityId || !claims.citySlug) return null;
  return claims;
}

export function sessionCookie(token: string, isProduction = process.env.VERCEL === '1'): string {
  return `${sessionCookieName(isProduction)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_MS / 1000}${isProduction ? '; Secure' : ''}`;
}

export function expiredSessionCookie(isProduction = process.env.VERCEL === '1'): string {
  return `${sessionCookieName(isProduction)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isProduction ? '; Secure' : ''}`;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const match = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}
