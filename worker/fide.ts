// Looks players up in FIDE's player list, kept as small JSON shards in an R2 bucket (written monthly by scripts/upload-fide.mjs).
import { isBlockedFederation } from '../src/data/federations.ts';
import { helsinkiToday } from '../src/lib/pricing.ts';
import { shardOf, type FideRecord, type FideShard } from '../src/lib/fide.ts';
import type { Env } from './types.ts';

export type FideLookup =
  | {
      status: 'found';
      fideId: string;
      name: string;
      federation: string;
      title: string;
      /** Standard rating; 0 for a player with a FIDE ID but no standard rating (unrated). */
      rating: number;
      birthYear: number;
      updated: string;
      month: string;
      nextUpdate: string;
      blocked: boolean;
    }
  | { status: 'not_found'; updated: string; month: string; nextUpdate: string }
  | { status: 'unavailable' };

/**
 * When the list is next refreshed: FIDE publishes a new list for each month, so the day after the month of our list ends,
 * or the 1st of next month if that day has already passed (the list is late). Both YYYY-MM-DD.
 */
export function nextUpdateOf(month: string, today: string): string {
  const first = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10);
  const [y, m] = month.split('-').map(Number);
  let next = first(y, m); // m is 1-based, so this is the 1st of the following month
  if (next <= today) {
    const [ty, tm] = today.slice(0, 7).split('-').map(Number);
    next = first(ty, tm);
  }
  return next;
}

// The bucket holds one folder per list ("2026-11/<shard>.json") and current.json, which names the folder in use. The
// uploader writes current.json last, so a lookup never sees a half-uploaded list. Both are kept in memory for a while:
// shards of a folder never change, and the pointer is re-read every few minutes so a new month is picked up quickly.
const POINTER_TTL_MS = 5 * 60_000;
const cache = new Map<string, FideShard>();
type Pointer = { prefix: string; month: string; updated: string };
let pointer: { at: number; value: Pointer } | null = null;

async function currentList(env: Env): Promise<Pointer | null> {
  if (!env.FIDE_LIST) return null;
  if (pointer && Date.now() - pointer.at < POINTER_TTL_MS) return pointer.value;
  try {
    const obj = await env.FIDE_LIST.get('current.json');
    const p = obj ? await obj.json<Partial<Pointer>>() : null;
    if (!p || typeof p.prefix !== 'string' || !/^[\w-]{1,32}$/.test(p.prefix) || typeof p.month !== 'string' || typeof p.updated !== 'string') return null;
    pointer = { at: Date.now(), value: { prefix: p.prefix, month: p.month, updated: p.updated } };
    return pointer.value;
  } catch {
    return null;
  }
}

async function loadShard(env: Env, n: number): Promise<FideShard | null> {
  if (!env.FIDE_LIST) return null;
  try {
    const list = await currentList(env);
    if (!list) return null;
    const key = `${list.prefix}/${n}.json`;
    const hit = cache.get(key);
    if (hit) return hit;
    const obj = await env.FIDE_LIST.get(key);
    if (!obj) return null;
    const shard = await obj.json<FideShard>();
    if (cache.size > 64) cache.clear();
    cache.set(key, shard);
    return shard;
  } catch {
    return null;
  }
}

export async function lookupFide(env: Env, fideId: string, now: Date = new Date()): Promise<FideLookup> {
  if (!/^\d{1,10}$/.test(fideId)) return { status: 'unavailable' };
  const shard = await loadShard(env, shardOf(fideId));
  if (!shard) return { status: 'unavailable' };
  const month = shard.m ?? shard.u.slice(0, 7); // shards built by the script always carry the month
  const nextUpdate = nextUpdateOf(month, helsinkiToday(now));
  const r: FideRecord | undefined = shard.p[fideId];
  if (!r) return { status: 'not_found', updated: shard.u, month, nextUpdate };
  const [name, federation, title, rating, birthYear] = r;
  return { status: 'found', fideId, name, federation, title, rating, birthYear, updated: shard.u, month, nextUpdate, blocked: isBlockedFederation(federation) };
}

/** Date, month (YYYY-MM, as FIDE labels it) and next refresh of the list in use, or null if there is none. */
export async function fideListInfo(env: Env, now: Date = new Date()): Promise<{ updated: string; month: string; nextUpdate: string } | null> {
  const list = await currentList(env);
  return list ? { updated: list.updated, month: list.month, nextUpdate: nextUpdateOf(list.month, helsinkiToday(now)) } : null;
}

/** Test helper: forget cached shards. */
export const clearFideCache = () => {
  cache.clear();
  pointer = null;
};
