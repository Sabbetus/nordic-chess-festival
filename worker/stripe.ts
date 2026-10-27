// Talking to Stripe over plain HTTPS (no SDK) and verifying webhook signatures.

import type { Env } from './types.ts';
import type { Registration, Quote } from '../src/lib/registration.ts';

type Form = { [key: string]: string | number | boolean | Form | Form[] | undefined };

/** Stripe's form encoding: nested keys become a[b][c]=…, arrays become a[0][b]=… */
export function formEncode(obj: Form, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => out.push(...formEncode(item, `${key}[${i}]`)));
    else if (typeof v === 'object') out.push(...formEncode(v, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

const refundNote = {
  en: 'Refunds: 75% of the entry fee if you withdraw by 2 June 2027. Questions: info@nordicchess.fi',
  fi: 'Palautukset: 75 % osallistumismaksusta, jos peruutat 2.6.2027 mennessä. Kysymykset: info@nordicchess.fi',
};

/** Everything Stripe needs for one Checkout Session. Amounts are always recalculated on the server. */
export function buildSessionParams(reg: Registration, q: Quote, registrationId: string, origin: string, nowSeconds: number): Form {
  const prefix = reg.locale === 'fi' ? '/fi' : '';
  const lineItems: Form[] = [];
  const product = (name: string, description: string | undefined, cents: number): Form => ({
    quantity: 1,
    price_data: { currency: 'eur', unit_amount: cents, product_data: { name, description } },
  });
  if (q.entryCents > 0) {
    const kind = { 'early-bird': 'early bird', junior: 'junior', senior: 'senior', none: 'regular' }[q.fee.discount];
    lineItems.push(product('Nordic Chess Festival 2027: entry fee', `${q.fee.band.label}, ${kind} price. ${reg.name}`, q.entryCents));
  }
  if (q.busCents > 0) {
    lineItems.push(product('Daily bus transfer Tampere – Kangasala Areena', `Return trips every day of the festival. ${reg.name}`, q.busCents));
  }
  return {
    mode: 'payment',
    line_items: lineItems,
    customer_email: reg.email,
    client_reference_id: registrationId,
    locale: reg.locale,
    metadata: { registration_id: registrationId },
    payment_intent_data: {
      description: `Nordic Chess Festival 2027, ${reg.name}`,
      metadata: { registration_id: registrationId },
    },
    custom_text: { submit: { message: refundNote[reg.locale] } },
    expires_at: nowSeconds + 3600,
    success_url: `${origin}${prefix}/register/thanks/?r=${registrationId}`,
    cancel_url: `${origin}${prefix}/register/?cancelled=1`,
  };
}

export async function createCheckoutSession(env: Env, params: Form): Promise<{ id: string; url: string }> {
  const base = env.STRIPE_API_BASE ?? 'https://api.stripe.com';
  const res = await fetch(`${base}/v1/checkout/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formEncode(params).join('&'),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !body.id || !body.url) throw new Error(`Stripe error ${res.status}: ${body.error?.message ?? 'no session'}`);
  return { id: body.id, url: body.url };
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * Verifies the Stripe-Signature header ("t=…,v1=…") against the raw request body.
 * Rejects events older than the tolerance (default five minutes) to stop replays.
 */
export async function verifyStripeSignature(payload: string, header: string | null, secret: string, nowSeconds: number, toleranceSeconds = 300): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || signatures.length === 0 || !/^\d+$/.test(t)) return false;
  if (Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;
  const expected = await hmacSha256Hex(secret, `${t}.${payload}`);
  return signatures.some((s) => safeEqual(s, expected));
}

