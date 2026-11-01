// Turns FIDE's combined player list (XML: every FIDE ID, rated or not) into the shards served by the Worker.
import { createInflateRaw, inflateRawSync } from 'node:zlib';
import { Readable } from 'node:stream';

/** Keep in sync with SHARDS in src/lib/fide.ts. */
export const SHARDS = 1024;
const order = ['GM', 'WGM', 'IM', 'WIM', 'FM', 'WFM', 'CM', 'WCM'];

/** Finds the first file of a zip archive. The FIDE download holds exactly one file. */
function zipEntry(buf) {
  // Find the end-of-central-directory record, then the first central directory entry.
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a zip file');
  const cd = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error('Bad zip directory');
  const method = buf.readUInt16LE(cd + 10);
  const compSize = buf.readUInt32LE(cd + 20);
  const local = buf.readUInt32LE(cd + 42);
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  return { method, data: buf.subarray(start, start + compSize) };
}

/** The first file of a zip archive as one buffer (fine for small files). */
export function unzipFirst(buf) {
  const { method, data } = zipEntry(buf);
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data);
  throw new Error(`Unsupported zip method ${method}`);
}

/** The first file of a zip archive as a text stream: the combined list is far too large to hold as one string. */
export function unzipFirstStream(buf) {
  const { method, data } = zipEntry(buf);
  const source = Readable.from([data]);
  const out = method === 0 ? source : method === 8 ? source.pipe(createInflateRaw()) : null;
  if (!out) throw new Error(`Unsupported zip method ${method}`);
  out.setEncoding('utf8');
  return out;
}

const unescapeXml = (s) => (s.includes('&') ? s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&') : s);

/** The text of one tag inside a player block ('' when absent). */
function field(block, name) {
  const open = `<${name}>`;
  const i = block.indexOf(open);
  if (i < 0) return '';
  const j = block.indexOf(`</${name}>`, i);
  return j < 0 ? '' : block.slice(i + open.length, j).trim();
}

/** "Surname, Given" becomes "Given Surname". */
function displayName(fideName) {
  const i = fideName.indexOf(',');
  const n = i < 0 ? fideName : `${fideName.slice(i + 1).trim()} ${fideName.slice(0, i).trim()}`;
  return n.replace(/\s+/g, ' ').trim();
}

/**
 * One player block to [id, record], or null. The record is [name, federation, title, standard rating, birth year].
 * The standard rating is 0 for players who have a FIDE ID but no standard rating (new players, or rapid/blitz only).
 */
function parsePlayer(block) {
  const id = field(block, 'fideid');
  const name = displayName(unescapeXml(field(block, 'name')));
  const rating = Number(field(block, 'rating') || 0);
  if (!/^\d{1,10}$/.test(id) || !name || !(rating === 0 || (rating >= 100 && rating <= 3000))) return null;
  const titles = [field(block, 'title'), field(block, 'w_title')];
  const title = order.find((x) => titles.includes(x)) ?? '';
  return [id, [name, field(block, 'country'), title, rating, Number(field(block, 'birthday')) || 0]];
}

/** Calls onPlayer(id, record) for every <player> block in the text from position 0; returns the unprocessed rest. */
function eachPlayer(text, onPlayer) {
  let pos = 0;
  for (;;) {
    const end = text.indexOf('</player>', pos);
    if (end < 0) break;
    const start = text.lastIndexOf('<player>', end);
    if (start >= pos) {
      const parsed = parsePlayer(text.slice(start + 8, end));
      if (parsed) onPlayer(parsed[0], parsed[1]);
    }
    pos = end + 9;
  }
  return text.slice(pos);
}

/** Small inputs (tests): shards[n] = { u, m, p: { fideId: record } }. */
export function buildShards(xml, updated, month = null) {
  const shards = Array.from({ length: SHARDS }, () => ({ u: updated, m: month, p: {} }));
  let count = 0;
  eachPlayer(xml, (id, record) => {
    shards[Number(id) % SHARDS].p[id] = record;
    count++;
  });
  return { shards, count };
}

/**
 * The real list: reads the text stream chunk by chunk and keeps each player as a ready-made JSON fragment, so memory
 * stays modest for about two million players. Returns the file contents of every shard.
 */
export async function buildShardFiles(stream, updated, month) {
  const parts = Array.from({ length: SHARDS }, () => []);
  let count = 0;
  let rest = '';
  for await (const chunk of stream) {
    rest = eachPlayer(rest + chunk, (id, record) => {
      parts[Number(id) % SHARDS].push(`${JSON.stringify(id)}:${JSON.stringify(record)}`);
      count++;
    });
  }
  const head = `{"u":${JSON.stringify(updated)},"m":${JSON.stringify(month)},"p":{`;
  return { files: parts.map((p) => `${head}${p.join(',')}}}`), count };
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** The month FIDE labels its current list with ("Download October 2026 FRL" on the download page), as YYYY-MM, or null. */
export async function listMonth() {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch('https://ratings.fide.com/download_lists.phtml', { signal: AbortSignal.timeout(30_000) });
      if (res.ok) {
        const text = (await res.text()).replace(/<[^>]*>/g, ' ');
        const m = text.match(/Download\s+([A-Za-z]+)\s+(\d{4})\s+FRL/);
        const i = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
        return i >= 0 ? `${m[2]}-${String(i + 1).padStart(2, '0')}` : null;
      }
    } catch {
      /* try again: FIDE's site answers 503 now and then */
    }
    await new Promise((r) => setTimeout(r, attempt * 3000));
  }
  return null;
}
