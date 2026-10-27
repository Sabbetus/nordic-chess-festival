// Turns the official FIDE standard rating list (XML) into the shards served by the Worker.
import { inflateRawSync } from 'node:zlib';

const SHARDS = 256;
const order = ['GM', 'WGM', 'IM', 'WIM', 'FM', 'WFM', 'CM', 'WCM'];

/** Extracts the first file of a zip archive (deflate or stored). The FIDE download holds exactly one file. */
export function unzipFirst(buf) {
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
  const data = buf.subarray(start, start + compSize);
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data);
  throw new Error(`Unsupported zip method ${method}`);
}

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1].trim() : '';
};
const unescapeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** "Surname, Given" becomes "Given Surname". */
function displayName(fideName) {
  const i = fideName.indexOf(',');
  const n = i < 0 ? fideName : `${fideName.slice(i + 1).trim()} ${fideName.slice(0, i).trim()}`;
  return n.replace(/\s+/g, ' ').trim();
}

/** Parses the XML into an array of shards: shards[n] = { u, p: { fideId: [name, fed, title, rating, birthYear] } }. */
export function buildShards(xml, updated) {
  const shards = Array.from({ length: SHARDS }, () => ({ u: updated, p: {} }));
  let count = 0;
  for (const m of xml.matchAll(/<player>([\s\S]*?)<\/player>/g)) {
    const b = m[1];
    const id = tag(b, 'fideid');
    const rating = Number(tag(b, 'rating'));
    if (!/^\d{1,10}$/.test(id) || !(rating >= 100 && rating <= 3000)) continue;
    const t = [tag(b, 'title'), tag(b, 'w_title')];
    const title = order.find((x) => t.includes(x)) ?? '';
    shards[Number(id) % SHARDS].p[id] = [displayName(unescapeXml(tag(b, 'name'))), tag(b, 'country'), title, rating, Number(tag(b, 'birthday')) || 0];
    count++;
  }
  return { shards, count };
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
