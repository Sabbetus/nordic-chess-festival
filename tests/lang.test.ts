import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.ts';
import { prefersFinnish, finnishRedirect } from '../worker/lang.ts';
import type { Env } from '../worker/types.ts';

const env = { ASSETS: { fetch: async () => new Response('page', { headers: { 'content-type': 'text/html' } }) } } as unknown as Env;
const req = (path: string, headers: Record<string, string> = {}, method = 'GET') => new Request(`https://nordicchess.fi${path}`, { method, headers });
const FI = { 'accept-language': 'fi-FI,fi;q=0.9,en;q=0.8' };

test('Accept-Language: Finnish must rank above English', () => {
  assert.equal(prefersFinnish('fi-FI,fi;q=0.9,en;q=0.8'), true);
  assert.equal(prefersFinnish('fi'), true);
  assert.equal(prefersFinnish('sv,fi;q=0.5'), true);
  assert.equal(prefersFinnish('en-US,en;q=0.9,fi;q=0.5'), false);
  assert.equal(prefersFinnish('fi;q=0.8,en;q=0.8'), false);
  assert.equal(prefersFinnish('sv,de'), false);
  assert.equal(prefersFinnish('fi;q=0'), false);
  assert.equal(prefersFinnish(null), false);
  assert.equal(prefersFinnish(''), false);
});

test('a Finnish-speaking visitor is sent to the Finnish version of any English page', async () => {
  for (const [from, to] of [['/', '/fi/'], ['/travel/', '/fi/travel/'], ['/register/thanks/', '/fi/register/thanks/'], ['/guests/nigel-short/', '/fi/guests/nigel-short/']]) {
    const res = await worker.fetch(req(from, FI), env);
    assert.equal(res.status, 302, from);
    assert.equal(res.headers.get('location'), `https://nordicchess.fi${to}`);
    assert.match(res.headers.get('vary') ?? '', /Accept-Language/);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
  }
});

test('the query string and a HEAD request are kept', () => {
  assert.equal(finnishRedirect(req('/register/?cancelled=1', FI)), 'https://nordicchess.fi/fi/register/?cancelled=1');
  assert.equal(finnishRedirect(req('/travel/', FI, 'HEAD')), 'https://nordicchess.fi/fi/travel/');
});

test('the language cookie turns the automatic redirect off', async () => {
  for (const cookie of ['lang=en', 'lang=fi', 'a=b; lang=en; c=d']) {
    const res = await worker.fetch(req('/travel/', { ...FI, cookie }), env);
    assert.equal(res.status, 200, cookie);
  }
  // An unrelated cookie does not
  assert.equal((await worker.fetch(req('/travel/', { ...FI, cookie: 'language=en' }), env)).status, 302);
});

test('English-speaking visitors, and visitors without a language, get the English page', async () => {
  for (const headers of [{ 'accept-language': 'en-US,en;q=0.9' }, { 'accept-language': 'de,fi;q=0.5,en;q=0.9' }, {}]) {
    const res = await worker.fetch(req('/', headers), env);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('vary') ?? '', /Accept-Language/);
  }
});

test('Finnish pages, the API, the admin page, assets and files are never redirected', () => {
  for (const path of ['/fi/', '/fi/travel/', '/fi', '/api/health', '/admin/', '/_astro/x.abc.css', '/fonts/a.woff2', '/favicon.svg', '/sitemap-index.xml', '/robots.txt', '/preview.jpg']) {
    assert.equal(finnishRedirect(req(path, FI)), null, path);
  }
  assert.equal(finnishRedirect(req('/travel/', FI, 'POST')), null);
});

test('a path that only starts like /fi is still an English page', () => {
  assert.equal(finnishRedirect(req('/fidelity/', FI)), 'https://nordicchess.fi/fi/fidelity/');
});
