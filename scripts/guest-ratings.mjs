// Pure helper for scripts/update-guests.mjs: brings the rating of one guest file (src/content/guests/*.yaml) up to date.
//
// A guest file holds the FIDE ID, the rating of a given list month and the peak rating:
//   fideId: 400025
//   rating:
//     value: 2594
//     month: '2026-10'
//   peakRating: 2712
// FIDE's monthly list has no peak rating, so the peak only moves up when the new rating is higher.

/** What the file says now, or null if the file does not look like a guest file. */
export function readGuest(text) {
  const id = /^fideId:\s*(\d+)\s*$/m.exec(text);
  const rating = /^rating:\s*\n\s+value:\s*(\d+)\s*\n\s+month:\s*'(\d{4}-\d{2})'\s*$/m.exec(text);
  const peak = /^peakRating:\s*(\d+)\s*$/m.exec(text);
  const title = /^title:\s*(\S+)\s*$/m.exec(text);
  if (!id || !rating || !peak) return null;
  return { fideId: id[1], value: Number(rating[1]), month: rating[2], peak: Number(peak[1]), title: title ? title[1] : '' };
}

/**
 * The file text with the rating of `list` (the site's lookup answer: { status, rating, month, title }) applied.
 * Returns { text, changed, note }; an answer that is not usable (not found, unrated, an older list) changes nothing.
 */
export function applyRating(text, list) {
  const g = readGuest(text);
  if (!g) return { text, changed: false, note: 'not a guest file' };
  if (!list || list.status !== 'found') return { text, changed: false, note: 'FIDE ID not found in the list' };
  if (!(list.rating > 0)) return { text, changed: false, note: 'no standard rating in the list' };
  if (list.month < g.month) return { text, changed: false, note: `the list (${list.month}) is older than the file (${g.month})` };
  const peak = Math.max(g.peak, list.rating);
  if (list.rating === g.value && list.month === g.month && peak === g.peak) return { text, changed: false, note: 'up to date' };
  const next = text
    .replace(/^(rating:\s*\n\s+value:\s*)\d+(\s*\n\s+month:\s*')\d{4}-\d{2}(')/m, `$1${list.rating}$2${list.month}$3`)
    .replace(/^(peakRating:\s*)\d+/m, `$1${peak}`);
  const titleNote = g.title && list.title && g.title !== list.title ? `; the title is now ${list.title} in the list (file says ${g.title}), please check` : '';
  return { text: next, changed: true, note: `${g.value} -> ${list.rating} (${list.month})${peak > g.peak ? `, new peak ${peak}` : ''}${titleNote}` };
}
