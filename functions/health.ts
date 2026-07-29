import { health, type Env } from './_lib/runtime';

export const onRequestGet = async (_context: { env: Env }) => health({ status: 'ok', runtime: 'cloudflare-pages-functions' });
