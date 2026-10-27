// The FIDE rating list as we store it: 256 small JSON shards, one per (FIDE ID mod 256), served by the Worker.
// Shared by the build script (writes the shards) and the Worker (reads them).

import type { Title } from '../data/fees.ts';

export const SHARDS = 256;

/** One player, as stored: [name, federation, title, rating, birth year]. Title is '' and birth year 0 when unknown. */
export type FideRecord = [name: string, federation: string, title: string, rating: number, birthYear: number];

export interface FideShard {
  /** Date of the rating list file (YYYY-MM-DD). */
  u: string;
  p: Record<string, FideRecord>;
}

export const shardOf = (fideId: string | number) => Number(fideId) % SHARDS;
export const shardPath = (n: number) => `/api/fide/${n}.json`;

/** FIDE writes "Surname, Given names". We use "Given names Surname". */
export function displayName(fideName: string): string {
  const i = fideName.indexOf(',');
  const name = i < 0 ? fideName : `${fideName.slice(i + 1).trim()} ${fideName.slice(0, i).trim()}`;
  return name.replace(/\s+/g, ' ').trim();
}

/** Highest of the open and women's titles, in the order that matters for the fee. */
const order: Title[] = ['GM', 'WGM', 'IM', 'WIM', 'FM', 'WFM', 'CM', 'WCM'];
export function bestTitle(...titles: string[]): Title | '' {
  return order.find((t) => titles.includes(t)) ?? '';
}
