// Uploads the FIDE list built by scripts/build-fide.mjs (.cache/fide/) to the R2 bucket that the Worker reads.
//
//   node scripts/upload-fide.mjs
//
// Environment (GitHub secrets in the monthly job):
//   R2_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_ID   Cloudflare account id
//   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY   an R2 API token with "Object Read & Write" for the bucket
//   R2_BUCKET                                bucket name (default ncf-fide)
//   R2_ENDPOINT                              only for tests: replaces https://<account>.r2.cloudflarestorage.com
//
// Layout in the bucket: "<month>/<shard>.json" for the 1024 shards and "current.json" naming the month in use. The
// pointer is written last, so the Worker switches to the new list only when all of it is there. Nothing is uploaded if
// the bucket already holds this list, so running the job twice costs two reads, not 1,000 writes.

import { readFile } from 'node:fs/promises';
import { signRequest } from './sigv4.mjs';

const SHARDS = 1024;
const DIR = new URL(process.env.FIDE_OUT_DIR ? `file://${process.env.FIDE_OUT_DIR.replace(/\/?$/, '/')}` : '../.cache/fide/', import.meta.url);
const account = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKey = process.env.R2_ACCESS_KEY_ID;
const secretKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET || 'ncf-fide';
const endpoint = (process.env.R2_ENDPOINT || `https://${account}.r2.cloudflarestorage.com`).replace(/\/$/, '');

function fail(msg) {
  console.error(`FIDE list not uploaded: ${msg}`);
  process.exit(1);
}

if (!process.env.R2_ENDPOINT && !account) fail('R2_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID) is not set');
if (!accessKey || !secretKey) fail('R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not set');

async function s3(method, key, body) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const url = `${endpoint}/${bucket}/${key}`;
      const headers = body === undefined ? {} : { 'content-type': 'application/json' };
      const res = await fetch(url, { method, headers: signRequest({ method, url, headers, body, accessKey, secretKey }), body, signal: AbortSignal.timeout(30_000) });
      if (res.status === 404 && method === 'GET') return null;
      if (!res.ok) throw new Error(`${method} ${key}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      return method === 'GET' ? await res.text() : null;
    } catch (err) {
      lastError = err;
      if (/HTTP 40[0-3]/.test(String(err.message))) break; // wrong keys or bucket: retrying does not help
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  throw lastError;
}

let meta;
try {
  meta = JSON.parse(await readFile(new URL('meta.json', DIR), 'utf8'));
} catch {
  fail('no built list in .cache/fide/ (run node scripts/build-fide.mjs first)');
}
if (typeof meta.month !== 'string' || !/^\d{4}-\d{2}$/.test(meta.month)) fail('meta.json has no month');
const pointer = { prefix: meta.month, month: meta.month, updated: meta.updated, players: meta.players };

try {
  const live = await s3('GET', 'current.json');
  const liveMeta = live ? JSON.parse(live) : null;
  if (liveMeta && liveMeta.prefix === pointer.prefix && liveMeta.updated === pointer.updated && liveMeta.players === pointer.players) {
    console.log(`R2 already holds the FIDE list ${meta.month} (file of ${meta.updated}); nothing to upload.`);
    process.exit(0);
  }

  const queue = Array.from({ length: SHARDS }, (_, n) => n);
  let done = 0;
  await Promise.all(Array.from({ length: 16 }, async () => {
    for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
      await s3('PUT', `${pointer.prefix}/${n}.json`, await readFile(new URL(`${n}.json`, DIR)));
      done++;
    }
  }));
  await s3('PUT', 'current.json', JSON.stringify(pointer));
  console.log(`Uploaded the FIDE list ${meta.month} (file of ${meta.updated}, ${meta.players} players): ${done} shards to R2 bucket ${bucket}.`);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
