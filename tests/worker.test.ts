import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../worker/index.ts';
import { handleAdmin, handleRegister, handleStripeWebhook } from '../worker/handlers.ts';
import type { Env } from '../worker/types.ts';
import { makeDb } from './helpers/d1.ts';
import { fideBucket } from './helpers/fide.ts';
import { clearFideCache, nextUpdateOf } from '../worker/fide.ts';

const NOW = new Date('2027-03-01T10:00:00Z');
const SECRETS = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test', ADMIN_TOKEN: 'organiser-token-with-at-least-32-characters' };

// What the registration form sends: the FIDE ID and the contact details. Everything else comes from FIDE's list
// (100010 is Anna Test, FIN, rating 1850, born 1990: 215 € at the regular price).
const person = (over: Record<string, unknown> = {}) => ({
  email: 'anna@example.com', phoneCountry: 'FI', phoneNumber: '040 123 4567', fideId: '100010', bus: false, accept: true, locale: 'en', ...over,
});
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://nordicchess.fi${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers });

let stripeCalls: { url: string; auth: string | null; body: URLSearchParams }[] = [];
const realFetch = globalThis.fetch;
let env: Env & { DB: ReturnType<typeof makeDb> };

beforeEach(() => {
  stripeCalls = [];
  env = { DB: makeDb(), ...SECRETS, FIDE_LIST: fideBucket() };
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    stripeCalls.push({ url: String(url), auth: new Headers(init?.headers).get('authorization'), body: new URLSearchParams(String(init?.body ?? '')) });
    const n = stripeCalls.length;
    return new Response(JSON.stringify({ id: `cs_test_${n}`, url: `https://checkout.stripe.test/pay/cs_test_${n}` }), { status: 200 });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const rows = () => env.DB.raw.prepare('SELECT * FROM registrations ORDER BY created_at').all() as Record<string, unknown>[];

async function webhook(type: string, object: Record<string, unknown>) {
  const body = JSON.stringify({ id: 'evt_1', type, data: { object } });
  const t = Math.floor(NOW.getTime() / 1000);
  const sig = createHmac('sha256', SECRETS.STRIPE_WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
  return handleStripeWebhook(post('/api/stripe/webhook', body, { 'stripe-signature': `t=${t},v1=${sig}` }), env, NOW);
}

test('a paying player is stored as pending and sent to Stripe with the server-side price', async () => {
  const res = await handleRegister(post('/api/register', person()), env, NOW);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { url: string };
  assert.match(body.url, /^https:\/\/checkout\.stripe\.test\//);
  assert.equal(stripeCalls.length, 1);
  assert.equal(stripeCalls[0].auth, 'Bearer sk_test_x');
  assert.equal(stripeCalls[0].body.get('line_items[0][price_data][unit_amount]'), '21500');
  assert.equal(stripeCalls[0].body.get('customer_email'), 'anna@example.com');
  const [row] = rows();
  assert.equal(row.payment_status, 'pending');
  assert.equal(row.total_cents, 21500);
  assert.equal(row.stripe_session_id, 'cs_test_1');
  assert.equal(row.phone, '+358401234567');
});

test('the price cannot be chosen by the browser', async () => {
  await handleRegister(post('/api/register', person({ amount: 1, totalCents: 1, price: 0 })), env, NOW);
  assert.equal(stripeCalls[0].body.get('line_items[0][price_data][unit_amount]'), '21500');
});

test('early bird applies by Finnish date', async () => {
  await handleRegister(post('/api/register', person()), env, new Date('2027-01-31T21:00:00Z'));
  assert.equal(stripeCalls[0].body.get('line_items[0][price_data][unit_amount]'), '16500');
});

test('the webhook marks the registration paid, and repeating it changes nothing', async () => {
  await handleRegister(post('/api/register', person()), env, NOW);
  const event = { id: 'cs_test_1', payment_status: 'paid', payment_intent: 'pi_1' };
  assert.equal((await webhook('checkout.session.completed', event)).status, 200);
  assert.equal(rows()[0].payment_status, 'paid');
  assert.equal(rows()[0].stripe_payment_intent, 'pi_1');
  assert.equal((await webhook('checkout.session.completed', event)).status, 200);
  assert.equal(rows()[0].payment_status, 'paid');
});

test('a delayed payment stays pending until it succeeds', async () => {
  await handleRegister(post('/api/register', person()), env, NOW);
  await webhook('checkout.session.completed', { id: 'cs_test_1', payment_status: 'unpaid', payment_intent: 'pi_1' });
  assert.equal(rows()[0].payment_status, 'pending');
  await webhook('checkout.session.async_payment_succeeded', { id: 'cs_test_1', payment_status: 'paid', payment_intent: 'pi_1' });
  assert.equal(rows()[0].payment_status, 'paid');
});

test('refunds are tracked, partial and full', async () => {
  await handleRegister(post('/api/register', person()), env, NOW);
  await webhook('checkout.session.completed', { id: 'cs_test_1', payment_status: 'paid', payment_intent: 'pi_1' });
  await webhook('charge.refunded', { payment_intent: 'pi_1', amount: 21500, amount_refunded: 16125 });
  assert.equal(rows()[0].payment_status, 'partially_refunded');
  assert.equal(rows()[0].refunded_cents, 16125);
  await webhook('charge.refunded', { payment_intent: 'pi_1', amount: 21500, amount_refunded: 21500 });
  assert.equal(rows()[0].payment_status, 'refunded');
});

test('webhooks with a bad signature are rejected', async () => {
  const res = await handleStripeWebhook(post('/api/stripe/webhook', '{}', { 'stripe-signature': 't=1,v1=bad' }), env, NOW);
  assert.equal(res.status, 400);
});

test('a grandmaster registers for free, with no Stripe call, awaiting verification', async () => {
  const res = await handleRegister(post('/api/register', person({ fideId: '100011' })), env, NOW);
  assert.deepEqual(await res.json().then((b: { free: boolean }) => b.free), true);
  assert.equal(stripeCalls.length, 0);
  const [row] = rows();
  assert.equal(row.payment_status, 'not_required');
  assert.equal(row.review_status, 'accepted');
  assert.equal(row.entry_cents, 0);
});

test('a grandmaster who wants the bus pays only for the bus', async () => {
  await handleRegister(post('/api/register', person({ fideId: '100011', bus: true })), env, NOW);
  assert.equal(stripeCalls.length, 1);
  assert.equal(stripeCalls[0].body.get('line_items[0][price_data][unit_amount]'), '5000');
  assert.equal(stripeCalls[0].body.get('line_items[1][price_data][unit_amount]'), null);
});

test('a player with a FIDE ID but no rating pays the unrated price', async () => {
  await handleRegister(post('/api/register', person({ fideId: '100014' })), env, NOW);
  assert.equal(stripeCalls[0].body.get('line_items[0][price_data][unit_amount]'), '30000');
  assert.equal(rows()[0].fide_id, '100014');
  assert.equal(rows()[0].rating, null);
  assert.equal(rows()[0].band, 'unrated');
  assert.match(String(rows()[0].note), /unrated/);
});

test('juniors and seniors get their discount from the birth year in FIDE\'s list', async () => {
  await handleRegister(post('/api/register', person({ fideId: '100012' })), env, NOW);
  await handleRegister(post('/api/register', person({ fideId: '100013' })), env, NOW);
  assert.equal(stripeCalls[0].body.get('line_items[0][price_data][unit_amount]'), '16500');
  assert.equal(stripeCalls[1].body.get('line_items[0][price_data][unit_amount]'), '16500');
});

test('the same FIDE ID cannot register twice once the first registration is live', async () => {
  await handleRegister(post('/api/register', person()), env, NOW);
  // still pending (unpaid): trying again is fine
  assert.equal((await handleRegister(post('/api/register', person()), env, NOW)).status, 200);
  await webhook('checkout.session.completed', { id: 'cs_test_1', payment_status: 'paid', payment_intent: 'pi_1' });
  assert.equal((await handleRegister(post('/api/register', person({ email: 'other@example.com' })), env, NOW)).status, 409);
});

test('invalid input is rejected without touching the database or Stripe', async () => {
  const res = await handleRegister(post('/api/register', person({ email: 'bad', accept: false })), env, NOW);
  assert.equal(res.status, 422);
  const body = (await res.json()) as { errors: Record<string, string> };
  assert.equal(body.errors.email, 'invalid');
  assert.equal(body.errors.accept, 'required');
  assert.equal(rows().length, 0);
  assert.equal(stripeCalls.length, 0);
  assert.equal((await handleRegister(post('/api/register', 'not json'), env, NOW)).status, 400);
});

test('bots that fill the hidden field get a silent success and nothing is stored', async () => {
  const res = await handleRegister(post('/api/register', person({ website: 'http://spam.example' })), env, NOW);
  assert.equal(res.status, 200);
  assert.equal(rows().length, 0);
  assert.equal(stripeCalls.length, 0);
});

test('a failing Stripe call leaves no orphan registration', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 })) as typeof fetch;
  const res = await handleRegister(post('/api/register', person()), env, NOW);
  assert.equal(res.status, 502);
  assert.equal(rows().length, 0);
});

test('without database or secrets the API reports that it is not available', async () => {
  const res = await handleRegister(post('/api/register', person()), {} as Env, NOW);
  assert.equal(res.status, 503);
  const health = await worker.fetch(new Request('https://nordicchess.fi/api/health'), {});
  assert.deepEqual(await health.json(), { ok: true, registration: false, turnstile: false, fideList: null, fideMonth: null, fideNextUpdate: null });
  const ready = await worker.fetch(new Request('https://nordicchess.fi/api/health'), env);
  assert.deepEqual(await ready.json(), { ok: true, registration: true, turnstile: false, fideList: '2027-02-28', fideMonth: '2027-03', fideNextUpdate: '2027-04-01' });
  // Without the FIDE list IDs cannot be checked, so registration stays closed.
  clearFideCache();
  const noList = await worker.fetch(new Request('https://nordicchess.fi/api/health'), { ...env, FIDE_LIST: undefined });
  assert.equal(((await noList.json()) as { registration: boolean }).registration, false);
});

test('organiser endpoints need the token, list registrations, export CSV safely and record verification', async () => {
  await handleRegister(post('/api/register', person({ fideId: '100020' })), env, NOW);
  await webhook('checkout.session.completed', { id: 'cs_test_1', payment_status: 'paid', payment_intent: 'pi_1' });
  const get = (path: string, token?: string) => new Request(`https://nordicchess.fi${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

  assert.equal((await handleAdmin(get('/api/admin/registrations'), env)).status, 401);
  assert.equal((await handleAdmin(get('/api/admin/registrations', 'wrong'), env)).status, 401);

  const list = (await (await handleAdmin(get('/api/admin/registrations', 'organiser-token-with-at-least-32-characters'), env)).json()) as { registrations: { id: string }[] };
  assert.equal(list.registrations.length, 1);

  const csv = await (await handleAdmin(get('/api/admin/registrations?format=csv', 'organiser-token-with-at-least-32-characters'), env)).text();
  assert.match(csv.split('\n')[0], /^id,registered,name,email/);
  assert.match(csv, /'=HYPERLINK\(""x""\)/); // formula neutralised and quotes escaped
  assert.match(csv, /,\+358401234567,/); // phone numbers stay clean

  const id = list.registrations[0].id;
  const upd = await handleAdmin(post(`/api/admin/registrations/${id}`, { review_status: 'accepted', note: 'Checked on FIDE' }, { authorization: 'Bearer organiser-token-with-at-least-32-characters' }), env);
  assert.equal(upd.status, 200);
  assert.equal(rows()[0].review_status, 'accepted');
  assert.equal(rows()[0].note, 'Checked on FIDE');
  const renamed = await handleAdmin(post(`/api/admin/registrations/${id}`, { review_status: 'accepted', note: 'Checked', name: 'Preferred Name' }, { authorization: 'Bearer organiser-token-with-at-least-32-characters' }), env);
  assert.equal(renamed.status, 200);
  assert.equal(rows()[0].name, 'Preferred Name');
  assert.match(String(rows()[0].note), /Name changed by organiser, was "=HYPERLINK/);
  const bad = await handleAdmin(post(`/api/admin/registrations/${id}`, { review_status: 'whatever' }, { authorization: 'Bearer organiser-token-with-at-least-32-characters' }), env);
  assert.equal(bad.status, 400);
});

test('pending registrations are hidden from the organiser list unless asked for', async () => {
  await handleRegister(post('/api/register', person()), env, NOW);
  const get = (path: string) => new Request(`https://nordicchess.fi${path}`, { headers: { authorization: 'Bearer organiser-token-with-at-least-32-characters' } });
  const hidden = (await (await handleAdmin(get('/api/admin/registrations'), env)).json()) as { registrations: unknown[] };
  const all = (await (await handleAdmin(get('/api/admin/registrations?include=all'), env)).json()) as { registrations: unknown[] };
  assert.equal(hidden.registrations.length, 0);
  assert.equal(all.registrations.length, 1);
});

test('registration from another origin is refused', async () => {
  const res = await handleRegister(post('/api/register', person(), { origin: 'https://evil.example' }), env, NOW);
  assert.equal(res.status, 403);
  assert.equal(rows().length, 0);
});

test('a short admin token disables the admin interface', async () => {
  const weak = { ...env, ADMIN_TOKEN: 'short' };
  const res = await handleAdmin(new Request('https://nordicchess.fi/api/admin/registrations', { headers: { authorization: 'Bearer short' } }), weak);
  assert.equal(res.status, 503);
});

test('Turnstile is enforced once its secret is set', async () => {
  globalThis.fetch = (async (url: string) =>
    String(url).includes('turnstile')
      ? new Response(JSON.stringify({ success: String(url).includes('ok') }))
      : new Response(JSON.stringify({ id: 'cs_t', url: 'https://checkout.stripe.test/x' }))) as typeof fetch;
  const guarded = { ...env, TURNSTILE_SECRET: 's', TURNSTILE_API_BASE: 'https://ts.test/bad' };
  assert.equal((await handleRegister(post('/api/register', person()), guarded, NOW)).status, 400);
  assert.equal((await handleRegister(post('/api/register', person({ turnstile: 'tok' })), guarded, NOW)).status, 400);
  const pass = { ...guarded, TURNSTILE_API_BASE: 'https://ts.test/ok' };
  assert.equal((await handleRegister(post('/api/register', person({ turnstile: 'tok' })), pass, NOW)).status, 200);
});

test('stale unpaid registrations are purged, paid ones stay', async () => {
  const { purgeStalePending } = await import('../worker/handlers.ts');
  await handleRegister(post('/api/register', person()), env, NOW);
  await handleRegister(post('/api/register', person({ fideId: '100014', email: 'b@example.com' })), env, NOW);
  env.DB.raw.prepare(`UPDATE registrations SET payment_status = 'paid' WHERE email = 'b@example.com'`).run();
  await purgeStalePending(env, new Date(NOW.getTime() + 49 * 3_600_000));
  assert.deepEqual(rows().map((r) => r.email), ['b@example.com']);
});

// --- FIDE list: IDs are required and checked against it ---

test('the FIDE list gives name, federation, title, rating and birth year; the browser values are ignored', async () => {
  const res = await handleRegister(post('/api/register', person({ fideId: '100001', name: 'Not My Name', federation: 'SWE', title: 'GM', rating: '2800', birthYear: '2015' })), env, NOW);
  assert.equal(res.status, 200);
  const [row] = rows();
  assert.equal(row.name, 'Testi Example');
  assert.equal(row.federation, 'FIN');
  assert.equal(row.title, 'FM');
  assert.equal(row.rating, 2216);
  assert.equal(row.birth_year, 1964);
  assert.equal(row.band, 'fm');
  assert.match(String(row.note), /FIDE list 2027-03/);
});

test('a GM from the list registers for free', async () => {
  const res = (await (await handleRegister(post('/api/register', person({ fideId: '700001' })), env, NOW)).json()) as { free?: boolean };
  assert.equal(res.free, true);
});

test('a FIDE ID is required', async () => {
  for (const fideId of ['', undefined, 'abc']) {
    const res = await handleRegister(post('/api/register', person({ fideId })), env, NOW);
    assert.equal(res.status, 422);
  }
  assert.equal(rows().length, 0);
});

test('an ID that is not in our list is refused, with the list month and the next update', async () => {
  const res = await handleRegister(post('/api/register', person({ fideId: '123456', title: 'GM', rating: '2700' })), env, NOW);
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { error: 'fide_not_found', month: '2027-03', nextUpdate: '2027-04-01' });
  assert.equal(rows().length, 0);
  assert.equal(stripeCalls.length, 0);
});

test('when FIDE has no birth year the player supplies it', async () => {
  const missing = await handleRegister(post('/api/register', person({ fideId: '100015' })), env, NOW);
  assert.equal(missing.status, 422);
  assert.equal(((await missing.json()) as { errors: Record<string, string> }).errors.birthYear, 'required');
  const ok = await handleRegister(post('/api/register', person({ fideId: '100015', birthYear: '1985' })), env, NOW);
  assert.equal(ok.status, 200);
  assert.equal(rows()[0].birth_year, 1985);
});

test('without the FIDE list nobody can register', async () => {
  const res = await handleRegister(post('/api/register', person()), { ...env, FIDE_LIST: undefined }, NOW);
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { error: string }).error, 'fide_unavailable');
  assert.equal(rows().length, 0);
});

test('the lookup endpoint answers found (unrated included), not found, and refuses anything else', async () => {
  const get = (p: string) => worker.fetch(new Request(`https://nordicchess.fi${p}`), env);
  const found = (await (await get('/api/fide/100001')).json()) as Record<string, unknown>;
  assert.equal(found.status, 'found');
  assert.equal(found.name, 'Testi Example');
  assert.equal(found.month, '2027-03');
  const unrated = (await (await get('/api/fide/100014')).json()) as Record<string, unknown>;
  assert.equal(unrated.status, 'found');
  assert.equal(unrated.rating, 0);
  const missing = (await (await get('/api/fide/123456')).json()) as Record<string, unknown>;
  assert.equal(missing.status, 'not_found');
  assert.equal(missing.nextUpdate, '2027-04-01');
  assert.equal((await get('/api/fide/12.json')).status, 400);
  assert.equal((await get('/api/fide/meta.json')).status, 400);
  clearFideCache();
  const bare = await worker.fetch(new Request('https://nordicchess.fi/api/fide/100001'), { ...env, FIDE_LIST: undefined });
  assert.equal(((await bare.json()) as { status: string }).status, 'unavailable');
});

test('the next update is the 1st after the list month, or the 1st of next month when the list is late', () => {
  assert.equal(nextUpdateOf('2026-11', '2026-11-02'), '2026-12-01');
  assert.equal(nextUpdateOf('2026-12', '2026-12-15'), '2027-01-01');
  assert.equal(nextUpdateOf('2026-10', '2026-11-05'), '2026-12-01'); // stale list: the 1st of November has passed
});

test('removed registrations are left out of the CSV unless everything is asked for, and can register again', async () => {
  const auth = { authorization: 'Bearer organiser-token-with-at-least-32-characters' };
  const get = (path: string) => new Request(`https://nordicchess.fi${path}`, { headers: auth });
  await handleRegister(post('/api/register', person()), env, NOW);
  await webhook('checkout.session.completed', { id: 'cs_test_1', payment_status: 'paid', payment_intent: 'pi_1' });
  const id = rows()[0].id as string;
  assert.equal((await handleAdmin(post(`/api/admin/registrations/${id}`, { review_status: 'rejected' }, auth), env)).status, 200);
  assert.ok(!(await (await handleAdmin(get('/api/admin/registrations?format=csv'), env)).text()).includes('Anna Test'));
  assert.ok((await (await handleAdmin(get('/api/admin/registrations?format=csv&include=all'), env)).text()).includes('Anna Test'));
  assert.equal((await handleRegister(post('/api/register', person()), env, NOW)).status, 200);
});

test('players from Russia and Belarus cannot register', async () => {
  for (const id of ['700002', '700003']) {
    const res = await handleRegister(post('/api/register', person({ fideId: id })), env, NOW);
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { error: string }).error, 'federation_blocked');
  }
  assert.equal(rows().length, 0);
  const lookup = (await (await worker.fetch(new Request('https://nordicchess.fi/api/fide/700002'), env)).json()) as { blocked: boolean };
  assert.equal(lookup.blocked, true);
});

test('the federation list offered to unrated players leaves out Russia and Belarus', async () => {
  const { federationOptions } = await import('../src/data/federations.ts');
  const codes = federationOptions('en').map((f) => f.code);
  assert.ok(codes.includes('FIN') && codes.includes('UKR'));
  assert.ok(!codes.includes('RUS') && !codes.includes('BLR'));
});
