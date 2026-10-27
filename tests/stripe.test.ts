import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { buildSessionParams, formEncode, verifyStripeSignature } from '../worker/stripe.ts';
import { quote, validateRegistration } from '../src/lib/registration.ts';

const sign = (secret: string, t: number, body: string) => createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

test('form encoding nests keys the way Stripe expects', () => {
  const out = formEncode({ mode: 'payment', line_items: [{ quantity: 1, price_data: { currency: 'eur' } }], metadata: { a: 'x y' } });
  assert.deepEqual(out, ['mode=payment', 'line_items%5B0%5D%5Bquantity%5D=1', 'line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=eur', 'metadata%5Ba%5D=x%20y']);
});

test('webhook signatures: valid, wrong secret, stale, malformed', async () => {
  const body = '{"id":"evt_1"}';
  const now = 1_800_000_000;
  const good = `t=${now},v1=${sign('whsec_x', now, body)}`;
  assert.equal(await verifyStripeSignature(body, good, 'whsec_x', now), true);
  assert.equal(await verifyStripeSignature(body, good, 'whsec_other', now), false);
  assert.equal(await verifyStripeSignature(body + ' ', good, 'whsec_x', now), false);
  assert.equal(await verifyStripeSignature(body, good, 'whsec_x', now + 301), false);
  assert.equal(await verifyStripeSignature(body, null, 'whsec_x', now), false);
  assert.equal(await verifyStripeSignature(body, 'garbage', 'whsec_x', now), false);
  const two = `t=${now},v1=deadbeef,v1=${sign('whsec_x', now, body)}`;
  assert.equal(await verifyStripeSignature(body, two, 'whsec_x', now), true);
});

test('checkout session: entry fee and bus as separate line items, amounts in cents', () => {
  const v = validateRegistration({ name: 'Anna Test', email: 'a@example.com', phoneCountry: 'FI', phoneNumber: '0401234567', fideId: '100001', rating: '1850', birthYear: '1990', federation: 'FIN', bus: true, accept: true, locale: 'en' });
  assert.ok(v.ok);
  if (!v.ok) return;
  const params = buildSessionParams(v.value, quote(v.value, '2027-03-01'), 'reg-1', 'https://example.org', 1_800_000_000) as Record<string, unknown>;
  const items = params.line_items as { price_data: { unit_amount: number } }[];
  assert.deepEqual(items.map((i) => i.price_data.unit_amount), [21500, 5000]);
  assert.equal(params.client_reference_id, 'reg-1');
  assert.equal(params.success_url, 'https://example.org/register/thanks/?r=reg-1');
  assert.equal(params.expires_at, 1_800_003_600);
});

test('Finnish players return to the Finnish pages', () => {
  const v = validateRegistration({ name: 'Anna Test', email: 'a@example.com', phoneCountry: 'FI', phoneNumber: '0401234567', noFideId: true, birthYear: '1990', federation: 'FIN', accept: true, locale: 'fi' });
  assert.ok(v.ok);
  if (!v.ok) return;
  const params = buildSessionParams(v.value, quote(v.value, '2027-03-01'), 'reg-2', 'https://example.org', 0) as Record<string, string>;
  assert.equal(params.success_url, 'https://example.org/fi/register/thanks/?r=reg-2');
  assert.equal(params.cancel_url, 'https://example.org/fi/register/?cancelled=1');
});
