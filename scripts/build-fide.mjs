// Downloads the monthly FIDE standard rating list and writes it to dist/api/fide/ as JSON shards.
// Runs after "astro build" (see package.json). The Worker serves the shards only through /api/fide/<id>.
//
//   node scripts/build-fide.mjs            warn and continue if FIDE cannot be reached (registration then
//                                          falls back to the rating the player declares)
//   node scripts/build-fide.mjs --require  fail instead (used by the monthly refresh job)
//   --min-month 2026-11                    fail unless FIDE's download page offers that month's list or a later one
//
// FIDE_ZIP_PATH can point at a local copy of the zip (tests and offline work).

import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { buildShards, listMonth, unzipFirst } from './fide-list.mjs';

const URL_ZIP = 'https://ratings.fide.com/download/standard_rating_list_xml.zip';
const OUT = new URL('../dist/api/fide/', import.meta.url);
const required = process.argv.includes('--require');
const MIN_PLAYERS = 400_000;
const minMonth = process.argv.includes('--min-month') ? process.argv[process.argv.indexOf('--min-month') + 1] : null;

async function download() {
  if (process.env.FIDE_ZIP_PATH) {
    const file = await readFile(process.env.FIDE_ZIP_PATH);
    return { buf: file, updated: (await stat(process.env.FIDE_ZIP_PATH)).mtime.toISOString().slice(0, 10) };
  }
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(URL_ZIP, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const modified = res.headers.get('last-modified');
      return { buf: Buffer.from(await res.arrayBuffer()), updated: (modified ? new Date(modified) : new Date()).toISOString().slice(0, 10) };
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
  throw lastError;
}

try {
  const month = process.env.FIDE_ZIP_PATH ? null : await listMonth();
  if (minMonth && (!month || month < minMonth)) throw new Error(`FIDE has not published the ${minMonth} list yet (its page offers ${month ?? 'an unknown month'})`);
  const { buf, updated } = await download();
  const xml = unzipFirst(buf).toString('utf8');
  const { shards, count } = buildShards(xml, updated);
  if (count < MIN_PLAYERS) throw new Error(`Only ${count} players in the list, expected more than ${MIN_PLAYERS}`);
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await Promise.all(shards.map((s, n) => writeFile(new URL(`${n}.json`, OUT), JSON.stringify(s))));
  await writeFile(new URL('meta.json', OUT), JSON.stringify({ updated, month, players: count }));
  console.log(`FIDE list ${updated}: ${count} players in ${shards.length} shards`);
} catch (err) {
  const msg = `FIDE rating list not built: ${err instanceof Error ? err.message : err}`;
  if (required) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`::warning::${msg}. Registration will use the ratings players declare.`);
}
