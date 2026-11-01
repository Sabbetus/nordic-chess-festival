// Downloads FIDE's combined player list (every FIDE ID, rated or not) and turns it into 1024 small JSON shards in
// .cache/fide/. scripts/upload-fide.mjs then puts them in the R2 bucket that the Worker reads. The site build
// ("astro build") does not need the list at all.
//
//   node scripts/build-fide.mjs            warn and exit normally if FIDE cannot be reached
//   node scripts/build-fide.mjs --require  fail instead (used by the monthly refresh job)
//   --min-month 2026-11                    fail unless FIDE's download page offers that month's list or a later one
//
// The list is big (51 MB to download, 863 MB to read), so it is downloaded only when it is needed: as long as
// .cache/fide/ holds a list for the current month or later, nothing is downloaded. A new download happens only when the
// cache is missing or its month is older than the current month (FIDE publishes each month's list at the end of the
// month before). In CI the cache folder is kept between runs (see the workflows). --refresh forces a download.
//
// FIDE_ZIP_PATH can point at a local copy of the zip (tests and offline work); it bypasses the cache.

import { access, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { buildShardFiles, listMonth, unzipFirstStream } from './fide-list.mjs';

const URL_ZIP = 'https://ratings.fide.com/download/players_list_xml.zip';
const CACHE = new URL(process.env.FIDE_OUT_DIR ? `file://${process.env.FIDE_OUT_DIR.replace(/\/?$/, '/')}` : '../.cache/fide/', import.meta.url);
const required = process.argv.includes('--require');
const refresh = process.argv.includes('--refresh');
const MIN_PLAYERS = 1_500_000;
const minMonth = process.argv.includes('--min-month') ? process.argv[process.argv.indexOf('--min-month') + 1] : null;

/**
 * Fallback when FIDE's page does not name the month: FIDE publishes a month's list in the last days of the month before,
 * so a file dated the 28th or later belongs to the next month (31 October 2026 is the November list).
 */
function monthFromFileDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (d.getUTCDate() >= 28) d.setUTCMonth(d.getUTCMonth() + 1, 1);
  return d.toISOString().slice(0, 7);
}

/** This month in Finland, as YYYY-MM. */
const thisMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit' }).format(new Date());

/** The cached list's meta (month, file date, player count), or null if there is no complete cache. */
async function readCache() {
  try {
    const meta = JSON.parse(await readFile(new URL('meta.json', CACHE), 'utf8'));
    await access(new URL('0.json', CACHE));
    await access(new URL('1023.json', CACHE));
    return typeof meta.month === 'string' && meta.players >= MIN_PLAYERS ? meta : null;
  } catch {
    return null;
  }
}

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
  // 1. A cached list for this month (or later) is used as it is: no download, no request to FIDE.
  const cached = process.env.FIDE_ZIP_PATH || refresh ? null : await readCache();
  if (cached && cached.month >= thisMonth() && (!minMonth || cached.month >= minMonth)) {
    console.log(`FIDE list ${cached.month} (file of ${cached.updated}): ${cached.players} players, already in the local cache, nothing downloaded`);
    process.exit(0);
  }

  // 2. Otherwise download it, once.
  const month = process.env.FIDE_ZIP_PATH ? null : await listMonth();
  if (minMonth && (!month || month < minMonth)) throw new Error(`FIDE has not published the ${minMonth} list yet (its page offers ${month ?? 'an unknown month'})`);
  const { buf, updated } = await download();
  const listMonthLabel = month ?? monthFromFileDate(updated);
  const { files, count } = await buildShardFiles(unzipFirstStream(buf), updated, listMonthLabel);
  if (count < MIN_PLAYERS) throw new Error(`Only ${count} players in the list, expected more than ${MIN_PLAYERS}`);
  await rm(CACHE, { recursive: true, force: true });
  await mkdir(CACHE, { recursive: true });
  await Promise.all(files.map((content, n) => writeFile(new URL(`${n}.json`, CACHE), content)));
  await writeFile(new URL('meta.json', CACHE), JSON.stringify({ updated, month: listMonthLabel, players: count }));
  console.log(`FIDE list ${listMonthLabel} (file of ${updated}): ${count} players in ${files.length} shards`);
} catch (err) {
  const msg = `FIDE rating list not built: ${err instanceof Error ? err.message : err}`;
  if (required) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`::warning::${msg}. Registration stays closed until a list has been uploaded.`);
}
