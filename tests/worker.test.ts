import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../worker/index.ts';
import { handleAdmin, handleRegister, handleStripeWebhook } from '../worker/handlers.ts';
import type { Env } from '../worker/types.ts';
import { makeDb } from './helpers/d1.ts';

const NOW = new Date('2027-03-01T10:00:00Z');
const SECRETS = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test', ADMIN_TOKEN: 'organiser-token-with-at-least-32-characters' };

const person = (over: Record<string, unknown> = {}) => ({
  name: 'Anna Test', email: 'anna@example.com', phoneCountry: 'FI', phoneNumber: '040 123 4567', fideId: '100001', title: '', rating: '1850',
  birthYear: '1990', federation: 'FIN', bus: false, accept: true, locale: 'en', ...over,
});
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://nordicchess.fi${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers });

let stripeCalls: { url: string; auth: string | null; body: URLSearchParams }[] = [];
const realFetch = globalThis.fetch;
let env: Env & { DB: ReturnType<typeof makeDb> };

beforeEach(() => {
  stripeCalls = [];
  env = { DB: makeDb(), ...SECRETS };
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
  const res = await handleRegister(post('/api/register', person({ title: 'GM', rating: '2600', fideId: '1503014' })), env, NOW);
  assert.deepEqual(await res.json().then((b: { free: boolean }) => b.free), true);
  assert.equal(stripeCalls.length, 0);
  const [row] = rows();
  assert.equal(row.payment_status, 'not_required');
  assert.equal(row.review_status, 'accepted');
  assert.equal(row.entry_cents, 0);
});

test('a grandmaster who wants the bus pays only for the bus', async () => {
  await handleRegister(post('/api/register', person({ title: 'GM', rating: '2600', fideId: '1503014', bus: true })), env, NOW);
  assert.equal(stripeCalls.length, 1);
  assert.equal(stripeCalls[0].body.get('line_items[0][price_data][unit_amount]'), '5000');
  assert.equal(stripeCalls[0].body.get('line_items[1][price_data][unit_amount]'), null);
});

test('a player without a FIDE ID pays the unrated price', async () => {
  await handleRegister(post('/api/register', person({ noFideId: true, fideId: '', title: '', rating: '' })), env, NOW);
  assert.equal(stripeCalls[0].body.get('line_items[0][price_data][unit_amount]'), '30000');
  assert.equal(rows()[0].fide_id, null);
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
  assert.deepEqual(await health.json(), { ok: true, registration: false, turnstile: false, fideList: null, fideMonth: null });
  const ready = await worker.fetch(new Request('https://nordicchess.fi/api/health'), env);
  assert.deepEqual(await ready.json(), { ok: true, registration: true, turnstile: false, fideList: null, fideMonth: null });
});

test('organiser endpoints need the token, list registrations, export CSV safely and record verification', async () => {
  await handleRegister(post('/api/register', person({ name: '=HYPERLINK("x")' })), env, NOW);
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
  await handleRegister(post('/api/register', person({ fideId: '', noFideId: true, email: 'b@example.com', name: 'Bo Test' })), env, NOW);
  env.DB.raw.prepare(`UPDATE registrations SET payment_status = 'paid' WHERE email = 'b@example.com'`).run();
  await purgeStalePending(env, new Date(NOW.getTime() + 49 * 3_600_000));
  assert.deepEqual(rows().map((r) => r.email), ['b@example.com']);
});

// --- FIDE rating list ---
import { clearFideCache } from '../worker/fide.ts';
import { buildShards } from '../scripts/fide-list.mjs';

const XML = `<playerslist>
<player><fideid>100001</fideid><name>Example, Testi</name><country>FIN</country><title>FM</title><w_title></w_title><rating>2216</rating><birthday>1964</birthday></player>
<player><fideid>100002</fideid><name>Sample, Anna</name><country>FIN</country><title></title><w_title></w_title><rating>1722</rating><birthday>1985</birthday></player>
<player><fideid>700001</fideid><name>Doe, Jane</name><country>ENG</country><title>GM</title><w_title>WGM</w_title><rating>2500</rating><birthday>2012</birthday></player>
</playerslist>`;

function withFide(): Env & { DB: ReturnType<typeof makeDb> } {
  clearFideCache();
  const { shards } = buildShards(XML, '2027-03-01');
  const assets = { fetch: async (r: Request) => {
    const n = Number(/\/api\/fide\/(\d+)\.json/.exec(r.url)?.[1]);
    return Number.isInteger(n) && shards[n] ? new Response(JSON.stringify(shards[n])) : new Response('no', { status: 404 });
  } };
  return { ...env, ASSETS: assets };
}

test('the FIDE list gives name, federation, title, rating and birth year; the browser values are ignored', async () => {
  const e = withFide();
  const res = await handleRegister(post('/api/register', person({ fideId: '100001', name: 'Not My Name', federation: 'SWE', title: 'GM', rating: '2800', birthYear: '2015' })), e, NOW);
  assert.equal(res.status, 200);
  const [row] = e.DB.raw.prepare('SELECT * FROM registrations').all() as Record<string, unknown>[];
  assert.equal(row.name, 'Testi Example');
  assert.equal(row.federation, 'FIN');
  assert.equal(row.title, 'FM');
  assert.equal(row.rating, 2216);
  assert.equal(row.birth_year, 1964);
  assert.equal(row.band, 'fm'.length ? row.band : '');
  assert.match(String(row.note), /FIDE list 2027-03-01/);
});

test('name, federation and birth year need not be sent when the FIDE ID is found', async () => {
  const e = withFide();
  const res = await handleRegister(post('/api/register', person({ fideId: '100002', name: '', federation: '', birthYear: '', title: '', rating: '' })), e, NOW);
  assert.equal(res.status, 200);
  const [row] = e.DB.raw.prepare('SELECT name, rating, birth_year FROM registrations').all() as Record<string, unknown>[];
  assert.deepEqual({ ...row }, { name: 'Anna Sample', rating: 1722, birth_year: 1985 });
});

test('a GM from the list registers for free', async () => {
  const e = withFide();
  const res = (await (await handleRegister(post('/api/register', person({ fideId: '700001', title: '', rating: '' })), e, NOW)).json()) as { free?: boolean };
  assert.equal(res.free, true);
});

test('an ID missing from the list is registered unrated, whatever the browser claims', async () => {
  const e = withFide();
  const res = await handleRegister(post('/api/register', person({ fideId: '123456', title: 'GM', rating: '2700' })), e, NOW);
  assert.equal(res.status, 200);
  const [row] = e.DB.raw.prepare('SELECT title, rating, band, note FROM registrations').all() as Record<string, unknown>[];
  assert.equal(row.title, null);
  assert.equal(row.rating, null);
  assert.equal(row.band, 'unrated');
  assert.match(String(row.note), /not in the standard rating list/);
});

test('the lookup endpoint answers found, not found, and refuses anything else', async () => {
  const e = withFide();
  const get = (p: string) => worker.fetch(new Request(`https://nordicchess.fi${p}`), e);
  const found = (await (await get('/api/fide/100001')).json()) as Record<string, unknown>;
  assert.equal(found.status, 'found');
  assert.equal(found.name, 'Testi Example');
  assert.equal(((await (await get('/api/fide/123456')).json()) as { status: string }).status, 'not_found');
  assert.equal((await get('/api/fide/12.json')).status, 400);
  assert.equal((await get('/api/fide/meta.json')).status, 400);
  clearFideCache();
  const bare = await worker.fetch(new Request('https://nordicchess.fi/api/fide/100001'), { ...env, ASSETS: undefined });
  assert.equal(((await bare.json()) as { status: string }).status, 'unavailable');
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
