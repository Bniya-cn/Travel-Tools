import { z } from 'zod';
import { AppError, body, digest, id, now, ok, type Env } from './runtime';

export interface AuthUser {
  id: string;
  account: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

type Row = Record<string, unknown>;

const COOKIE_NAME = 'travel_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 1_200;

const authInput = z.object({
  account: z.string().trim().min(3).max(80),
  password: z.string().min(8).max(200),
  display_name: z.string().trim().min(1).max(80).nullable().optional(),
});

async function one(env: Env, sql: string, ...params: unknown[]): Promise<Row | null> {
  return env.DB.prepare(sql).bind(...params).first();
}

async function run(env: Env, sql: string, ...params: unknown[]): Promise<void> {
  await env.DB.prepare(sql).bind(...params).run();
}

function normalizeAccount(account: string): string {
  return account.trim().toLowerCase();
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

async function iteratedPasswordHash(password: string, salt: string, iterations: number): Promise<string> {
  let value = `${salt}:${password}`;
  for (let index = 0; index < iterations; index += 1) value = await digest(value);
  return value;
}

async function hashPassword(password: string): Promise<string> {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await iteratedPasswordHash(password, salt, PASSWORD_ITERATIONS);
  return `sha256_iter$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

async function verifyPassword(password: string, stored: unknown): Promise<boolean> {
  if (typeof stored !== 'string') return false;
  const [scheme, iterationsText, saltText, hashText] = stored.split('$');
  const iterations = Number(iterationsText);
  if (scheme !== 'sha256_iter' || !Number.isInteger(iterations) || !saltText || !hashText) return false;
  const actual = await iteratedPasswordHash(password, saltText, iterations);
  const expected = hashText;
  return timingSafeEqual(actual, expected);
}

function publicUser(row: Row): AuthUser {
  return {
    id: String(row.id),
    account: String(row.account),
    display_name: row.display_name === null ? null : String(row.display_name),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function readCookie(request: Request): string | null {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function sessionCookie(request: Request, token: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function createSession(env: Env, userId: string): Promise<string> {
  const token = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
  const tokenHash = await digest(token);
  const stamp = now();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await run(
    env,
    'INSERT INTO user_sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    id(),
    userId,
    tokenHash,
    stamp,
    expiresAt,
  );
  return token;
}

export async function getCurrentUser(request: Request, env: Env): Promise<AuthUser | null> {
  const token = readCookie(request);
  if (!token) return null;
  const tokenHash = await digest(token);
  const row = await one(
    env,
    `SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`,
    tokenHash,
    now(),
  );
  return row ? publicUser(row) : null;
}

export async function requireUser(request: Request, env: Env): Promise<AuthUser> {
  const user = await getCurrentUser(request, env);
  if (!user) throw new AppError('AUTH_REQUIRED', '请先登录', 401);
  return user;
}

export async function handleAuth(request: Request, env: Env, action: string | undefined): Promise<Response> {
  if (action === 'me' && request.method === 'GET') return ok(await getCurrentUser(request, env));

  if (action === 'register' && request.method === 'POST') {
    const input = await body(request, authInput);
    const account = normalizeAccount(input.account);
    const existing = await one(env, 'SELECT id FROM users WHERE account = ?', account);
    if (existing) throw new AppError('ACCOUNT_EXISTS', '账号已存在', 409);
    const stamp = now();
    const user = {
      id: id(),
      account,
      password_hash: await hashPassword(input.password),
      display_name: input.display_name ?? null,
      created_at: stamp,
      updated_at: stamp,
    };
    await run(
      env,
      'INSERT INTO users (id, account, password_hash, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      user.id,
      user.account,
      user.password_hash,
      user.display_name,
      user.created_at,
      user.updated_at,
    );
    const token = await createSession(env, user.id);
    const response = ok(publicUser(user), 201);
    response.headers.set('Set-Cookie', sessionCookie(request, token, SESSION_TTL_SECONDS));
    return response;
  }

  if (action === 'login' && request.method === 'POST') {
    const input = await body(request, authInput.pick({ account: true, password: true }));
    const account = normalizeAccount(input.account);
    const row = await one(env, 'SELECT * FROM users WHERE account = ?', account);
    if (!row || !(await verifyPassword(input.password, row.password_hash))) {
      throw new AppError('INVALID_CREDENTIALS', '账号或密码错误', 401);
    }
    const token = await createSession(env, String(row.id));
    await run(env, 'UPDATE users SET last_login_at = ? WHERE id = ?', now(), row.id);
    const response = ok(publicUser(row));
    response.headers.set('Set-Cookie', sessionCookie(request, token, SESSION_TTL_SECONDS));
    return response;
  }

  if (action === 'logout' && request.method === 'POST') {
    const token = readCookie(request);
    if (token) await run(env, 'DELETE FROM user_sessions WHERE token_hash = ?', await digest(token));
    const response = ok({ ok: true });
    response.headers.set('Set-Cookie', sessionCookie(request, '', 0));
    return response;
  }

  throw new AppError('NOT_FOUND', '接口不存在', 404);
}
