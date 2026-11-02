import { purgeStalePending, handleAdmin, handleFideLookup, handleHealth, handleRegister, handleStripeWebhook, json } from './handlers.ts';
import type { Env } from './types.ts';
import { finnishRedirect, isEnglishPage } from './lang.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/health') return handleHealth(env);
    if (pathname.startsWith('/api/fide/')) return handleFideLookup(request, env);
    if (pathname === '/api/register') return handleRegister(request, env);
    if (pathname === '/api/stripe/webhook') return handleStripeWebhook(request, env);
    if (pathname.startsWith('/api/admin/')) return handleAdmin(request, env);
    if (pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    // Everything else is the static site (the Worker runs first for English pages only, see wrangler.jsonc).
    const redirect = finnishRedirect(request);
    if (redirect) return new Response(null, { status: 302, headers: { location: redirect, vary: 'Accept-Language, Cookie', 'cache-control': 'private, no-store' } });
    if (!env.ASSETS) return new Response('Not found', { status: 404 });
    const res = await env.ASSETS.fetch(request);
    if (!isEnglishPage(request)) return res;
    // The English page is the answer only for visitors without a Finnish preference: caches must not mix them up.
    const out = new Response(res.body, res);
    out.headers.append('vary', 'Accept-Language, Cookie');
    return out;
  },
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await purgeStalePending(env);
  },
};
