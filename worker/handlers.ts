import { helsinkiToday, quote, validateRegistration } from '../src/lib/registration.ts';
import {
  applyRefund, attachSession, deleteRegistration, deleteStalePending, findDuplicate, insertRegistration, listRegistrations, markPaid, updateReview,
  type RegistrationRow,
} from './db.ts';
import { buildSessionParams, createCheckoutSession, safeEqual, verifyStripeSignature } from './stripe.ts';
import type { Env } from './types.ts';

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

export function handleHealth(env: Env): Response {
  return json({ ok: true, registration: Boolean(env.DB && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET), turnstile: Boolean(env.TURNSTILE_SECRET) });
}

async function verifyTurnstile(token: string, secret: string, ip: string | null, base = 'https://challenges.cloudflare.com'): Promise<boolean> {
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set('remoteip', ip);
    const res = await fetch(`${base}/turnstile/v0/siteverify`, { method: 'POST', body: form });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

/** Scheduled clean-up: unpaid registrations hold personal data for nothing, so drop them after two days. */
export async function purgeStalePending(env: Env, now: Date = new Date()): Promise<void> {
  if (!env.DB) return;
  await deleteStalePending(env.DB, new Date(now.getTime() - 48 * 3_600_000).toISOString());
}

/** POST /api/register: validate, price, store, and hand the player over to Stripe (or finish a free registration). */
export async function handleRegister(request: Request, env: Env, now: Date = new Date()): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!env.DB || !env.STRIPE_SECRET_KEY) return json({ error: 'unavailable' }, 503);

  // Only our own pages may submit registrations (browsers always send Origin on cross-site POSTs).
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'forbidden' }, 403);

  const text = await request.text();
  if (text.length > 10_000) return json({ error: 'too_large' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  // Honeypot: bots fill every field. Pretend it worked.
  if (body && typeof body === 'object' && typeof (body as { website?: unknown }).website === 'string' && (body as { website: string }).website.trim() !== '') {
    return json({ ok: true });
  }

  // Optional bot check: enforced as soon as the Turnstile secret is configured.
  if (env.TURNSTILE_SECRET) {
    const token = (body as { turnstile?: unknown } | null)?.turnstile;
    if (typeof token !== 'string' || !(await verifyTurnstile(token, env.TURNSTILE_SECRET, request.headers.get('cf-connecting-ip'), env.TURNSTILE_API_BASE))) {
      return json({ error: 'bot_check' }, 400);
    }
  }

  const v = validateRegistration(body);
  if (!v.ok) return json({ error: 'validation', errors: v.errors }, 422);
  const reg = v.value;

  if (await findDuplicate(env.DB, { fideId: reg.fideId, email: reg.email, name: reg.name })) return json({ error: 'duplicate' }, 409);

  const paidOn = helsinkiToday(now);
  const q = quote(reg, paidOn);
  const id = crypto.randomUUID();
  const iso = now.toISOString();
  const row: RegistrationRow = {
    id, created_at: iso, name: reg.name, email: reg.email, phone: reg.phone, fide_id: reg.fideId, title: reg.title, rating: reg.rating,
    birth_year: reg.birthYear, federation: reg.federation, locale: reg.locale, band: q.fee.band.id, discount: q.fee.discount,
    bus: reg.bus ? 1 : 0, entry_cents: q.entryCents, bus_cents: q.busCents, total_cents: q.totalCents, paid_on: paidOn,
    payment_status: q.free ? 'not_required' : 'pending', stripe_session_id: null, stripe_payment_intent: null, paid_at: null,
    refunded_cents: 0, review_status: 'unverified', note: null, accepted_terms_at: iso,
  };
  await insertRegistration(env.DB, row);
  if (q.free) return json({ ok: true, free: true, id });

  try {
    const origin = new URL(request.url).origin;
    const session = await createCheckoutSession(env, buildSessionParams(reg, q, id, origin, Math.floor(now.getTime() / 1000)));
    await attachSession(env.DB, id, session.id);
    return json({ ok: true, url: session.url, id });
  } catch (err) {
    console.error('Creating the Stripe session failed', err);
    await deleteRegistration(env.DB, id);
    return json({ error: 'payment_unavailable' }, 502);
  }
}

/** POST /api/stripe/webhook: Stripe tells us a payment succeeded or was refunded. */
export async function handleStripeWebhook(request: Request, env: Env, now: Date = new Date()): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!env.DB || !env.STRIPE_WEBHOOK_SECRET) return json({ error: 'unavailable' }, 503);

  const payload = await request.text();
  const valid = await verifyStripeSignature(payload, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET, Math.floor(now.getTime() / 1000));
  if (!valid) return json({ error: 'bad_signature' }, 400);

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const object = event.data?.object ?? {};

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      // Delayed payment methods complete the session as "unpaid" and succeed later.
      if (object.payment_status === 'paid' && typeof object.id === 'string') {
        await markPaid(env.DB, object.id, typeof object.payment_intent === 'string' ? object.payment_intent : null, now.toISOString());
      }
      break;
    case 'charge.refunded':
      if (typeof object.payment_intent === 'string' && typeof object.amount_refunded === 'number' && typeof object.amount === 'number') {
        await applyRefund(env.DB, object.payment_intent, object.amount_refunded, object.amount);
      }
      break;
  }
  return json({ received: true });
}

const REVIEW = ['unverified', 'verified', 'rejected'];

/** Typed-in text that starts like a formula gets a leading quote. Validated values (phone numbers) are safe as they are. */
function csvCell(value: unknown, validated = false): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (!validated && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: RegistrationRow[]): string {
  const euro = (c: number) => (c / 100).toFixed(2);
  const header = ['id', 'registered', 'name', 'email', 'phone', 'fide_id', 'title', 'rating', 'birth_year', 'federation', 'fee_group', 'discount', 'bus', 'entry_eur', 'bus_eur', 'total_eur', 'payment', 'refunded_eur', 'review', 'paid_at', 'note'];
  const lines = rows.map((r) =>
    [csvCell(r.id), csvCell(r.created_at), csvCell(r.name), csvCell(r.email), csvCell(r.phone, true), csvCell(r.fide_id), csvCell(r.title), csvCell(r.rating),
      csvCell(r.birth_year), csvCell(r.federation), csvCell(r.band), csvCell(r.discount), r.bus ? 'yes' : 'no', euro(r.entry_cents), euro(r.bus_cents),
      euro(r.total_cents), csvCell(r.payment_status), euro(r.refunded_cents), csvCell(r.review_status), csvCell(r.paid_at), csvCell(r.note)].join(','),
  );
  return [header.join(','), ...lines].join('\n') + '\n';
}

/** /api/admin/registrations: organisers only (Bearer token). */
export async function handleAdmin(request: Request, env: Env): Promise<Response> {
  // A short token is guessable: refuse to run with one rather than run unprotected.
  if (!env.DB || !env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32) return json({ error: 'unavailable' }, 503);
  const match = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '');
  if (!match || !safeEqual(match[1], env.ADMIN_TOKEN)) return json({ error: 'unauthorised' }, 401);

  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/api/admin/registrations') {
    const rows = await listRegistrations(env.DB, url.searchParams.get('include') === 'all');
    if (url.searchParams.get('format') === 'csv') {
      return new Response(toCsv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="registrations.csv"', 'cache-control': 'no-store' } });
    }
    return json({ registrations: rows });
  }

  const prefix = '/api/admin/registrations/';
  if (request.method === 'POST' && url.pathname.startsWith(prefix)) {
    const id = url.pathname.slice(prefix.length);
    const body = (await request.json().catch(() => null)) as { review_status?: string; note?: string } | null;
    if (!body || !REVIEW.includes(String(body.review_status))) return json({ error: 'bad_request' }, 400);
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;
    return (await updateReview(env.DB, id, String(body.review_status), note)) ? json({ ok: true }) : json({ error: 'not_found' }, 404);
  }
  return json({ error: 'not_found' }, 404);
}
