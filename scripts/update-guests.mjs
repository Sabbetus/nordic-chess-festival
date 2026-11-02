// Updates the ratings of the guest players (src/content/guests/*.yaml) from the FIDE list the site is using.
//
//   node scripts/update-guests.mjs                 update the files
//   node scripts/update-guests.mjs --check         only report
//   node scripts/update-guests.mjs --month 2026-12 fail unless the site's list is this month's (or later)
//
// The ratings come from the site's own lookup (/api/fide/<id>), so they are exactly the numbers the registration form
// shows. Run it after the monthly list has been uploaded; the Worker picks up a new list within about 5 minutes.
// Environment: SITE_URL (default: the test site).

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { applyRating, readGuest } from './guest-ratings.mjs';

const DIR = new URL('../src/content/guests/', import.meta.url);
const site = (process.env.SITE_URL || 'https://nordic-chess-festival.henry-b55.workers.dev').replace(/\/$/, '');
const checkOnly = process.argv.includes('--check');
const mi = process.argv.indexOf('--month');
const wantMonth = mi > 0 ? process.argv[mi + 1] : null;

async function lookup(id) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${site}/api/fide/${id}`, { signal: AbortSignal.timeout(20_000), headers: { 'cache-control': 'no-cache' } });
      if (res.ok) return await res.json();
    } catch {
      /* try again */
    }
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  return null;
}

const files = (await readdir(DIR)).filter((f) => f.endsWith('.yaml')).sort();
let changed = 0;
let failed = 0;
for (const f of files) {
  const url = new URL(f, DIR);
  const text = await readFile(url, 'utf8');
  const g = readGuest(text);
  if (!g) {
    console.warn(`${f}: skipped, not a guest file`);
    continue;
  }
  const list = await lookup(g.fideId);
  if (!list) {
    console.error(`${f}: could not reach ${site}/api/fide/${g.fideId}`);
    failed++;
    continue;
  }
  if (wantMonth && list.month < wantMonth) {
    console.error(`${f}: the site's list is ${list.month}, not ${wantMonth} yet. Try again in a few minutes.`);
    failed++;
    continue;
  }
  const r = applyRating(text, list);
  console.log(`${f}: ${r.note}`);
  if (r.changed) {
    changed++;
    if (!checkOnly) await writeFile(url, r.text);
  }
}
console.log(`${changed} guest file(s) ${checkOnly ? 'would change' : 'updated'}${failed ? `, ${failed} failed` : ''}.`);
process.exit(failed ? 1 : 0);
