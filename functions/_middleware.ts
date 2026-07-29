import { onRequest as apiRequest } from './_lib/api-handler';
import type { Env } from './_lib/runtime';

type MiddlewareContext = {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
};

/** 同域 API 由 Middleware 分发，静态资源和前端路由继续交给 Pages Assets。 */
export const onRequest = async (context: MiddlewareContext): Promise<Response> => {
  const url = new URL(context.request.url);
  if (!url.pathname.startsWith('/api/')) return context.next();
  const path = url.pathname.slice('/api/'.length).split('/').filter(Boolean);
  return apiRequest({ request: context.request, env: context.env, params: { path } });
};
