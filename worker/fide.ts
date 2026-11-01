// Looks players up in the FIDE rating list shards that the build writes next to the site (dist/api/fide/).
import { isBlockedFederation } from '../src/data/federations.ts';
import { helsinkiToday } from '../src/lib/pricing.ts';
import { shardOf, shardPath, type FideRecord, type FideShard } from '../src/lib/fide.ts';
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

// Shards are static for a deployment, so keep the few that were asked for in memory.
const cache = new Map<number, FideShard>();

async function loadShard(env: Env, n: number): Promise<FideShard | null> {
  const hit = cache.get(n);
  if (hit) return hit;
  if (!env.ASSETS) return null;
  try {
    const res = await env.ASSETS.fetch(new Request(`https://assets.local${shardPath(n)}`));
    if (!res.ok) return null;
    const shard = (await res.json()) as FideShard;
    if (cache.size > 64) cache.clear();
    cache.set(n, shard);
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

/** Date, month (YYYY-MM, as FIDE labels it) and next refresh of the list in this deployment, or null if there is none. */
export async function fideListInfo(env: Env, now: Date = new Date()): Promise<{ updated: string; month: string; nextUpdate: string } | null> {
  // Any ID works to reach a shard; an ID that is not in the list still reports the list's dates.
  const l = await lookupFide(env, '0', now);
  return l.status === 'unavailable' ? null : { updated: l.updated, month: l.month, nextUpdate: l.nextUpdate };
}

/** Test helper: forget cached shards. */
export const clearFideCache = () => cache.clear();
