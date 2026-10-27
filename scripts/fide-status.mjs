// Decides whether the monthly refresh job has anything to do. Prints and sets the GitHub Actions output "refresh".
//
//   refresh=true   FIDE has published this month's list and the live site does not have it yet
//   refresh=false  the live site is already up to date, or FIDE has not published yet
//
// If FIDE still has not published by the 3rd of the month the job fails on purpose, so that GitHub emails the owner.
// Usage: SITE_URL=https://example.com node scripts/fide-status.mjs

import { appendFileSync } from 'node:fs';
import { listMonth } from './fide-list.mjs';

const site = (process.env.SITE_URL ?? '').replace(/\/$/, '');
const now = new Date();
const current = now.toISOString().slice(0, 7);

async function liveMonth() {
  if (!site) return null;
  try {
    const res = await fetch(`${site}/api/health`, { signal: AbortSignal.timeout(20_000), headers: { 'cache-control': 'no-cache' } });
    const body = await res.json();
    return typeof body.fideMonth === 'string' ? body.fideMonth : null;
  } catch {
    return null;
  }
}

const live = await liveMonth();
const published = await listMonth();
console.log(`current month ${current}, live site list ${live ?? 'unknown'}, FIDE offers ${published ?? 'unknown'}`);

let refresh = false;
if (live && live >= current) {
  console.log('The live site already has this month\'s list.');
} else if (published && published >= current) {
  refresh = true;
  console.log('FIDE has published this month\'s list: refreshing.');
} else if (now.getUTCDate() >= 3) {
  console.error('FIDE has not published this month\'s list by the 3rd. Check https://ratings.fide.com/download_lists.phtml');
  process.exit(1);
} else {
  console.log('FIDE has not published this month\'s list yet. Trying again later.');
}

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `refresh=${refresh}\n`);
