import { purgeStalePending, handleAdmin, handleHealth, handleRegister, handleStripeWebhook, json } from './handlers.ts';
import type { Env } from './types.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/health') return handleHealth(env);
    if (pathname === '/api/register') return handleRegister(request, env);
    if (pathname === '/api/stripe/webhook') return handleStripeWebhook(request, env);
    if (pathname.startsWith('/api/admin/')) return handleAdmin(request, env);
    if (pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    // Everything else is the static site (only reached if the Worker runs first for non-API paths).
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  },
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await purgeStalePending(env);
  },
};
