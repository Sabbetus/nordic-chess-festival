// Looks players up in the FIDE rating list shards that the build writes next to the site (dist/api/fide/).
import { isBlockedFederation } from '../src/data/federations.ts';
import { shardOf, shardPath, type FideRecord, type FideShard } from '../src/lib/fide.ts';
import type { Env } from './types.ts';

export type FideLookup =
  | { status: 'found'; fideId: string; name: string; federation: string; title: string; rating: number; birthYear: number; updated: string; blocked: boolean }
  | { status: 'not_found'; updated: string }
  | { status: 'unavailable' };

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

export async function lookupFide(env: Env, fideId: string): Promise<FideLookup> {
  if (!/^\d{1,10}$/.test(fideId)) return { status: 'not_found', updated: '' };
  const shard = await loadShard(env, shardOf(fideId));
  if (!shard) return { status: 'unavailable' };
  const r: FideRecord | undefined = shard.p[fideId];
  if (!r) return { status: 'not_found', updated: shard.u };
  const [name, federation, title, rating, birthYear] = r;
  return { status: 'found', fideId, name, federation, title, rating, birthYear, updated: shard.u, blocked: isBlockedFederation(federation) };
}

/** Date and month (YYYY-MM, as FIDE labels it) of the list in this deployment, for the health check and the organiser page. */
export async function fideListInfo(env: Env): Promise<{ updated: string | null; month: string | null }> {
  const l = await lookupFide(env, '0');
  if (l.status !== 'not_found') return { updated: null, month: null };
  let month: string | null = null;
  try {
    const res = await env.ASSETS?.fetch(new Request('https://assets.local/api/fide/meta.json'));
    if (res?.ok) month = ((await res.json()) as { month?: string | null }).month ?? null;
  } catch {
    /* no meta file */
  }
  return { updated: l.updated, month: month ?? (l.updated ? l.updated.slice(0, 7) : null) };
}

/** Test helper: forget cached shards. */
export const clearFideCache = () => cache.clear();
