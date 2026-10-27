// Price of a registration. Kept apart from registration.ts so the browser can use it without the phone-number library.

import { busTransfer, calculateFee, type FeeResult, type Title } from '../data/fees.ts';

export interface Quote {
  fee: FeeResult;
  entryCents: number;
  busCents: number;
  totalCents: number;
  /** True when the player owes nothing (grandmasters without the bus). */
  free: boolean;
}

/** Price of a registration on a given day (YYYY-MM-DD, Finnish time). Players without a FIDE ID are unrated. */
export function quote(reg: { title: Title | null; rating: number | null; birthYear: number; bus: boolean }, paidOn: string): Quote {
  const fee = calculateFee({ title: reg.title, rating: reg.rating, birthYear: reg.birthYear, paidOn });
  const entryCents = fee.amount * 100;
  const busCents = reg.bus ? busTransfer.price * 100 : 0;
  const totalCents = entryCents + busCents;
  return { fee, entryCents, busCents, totalCents, free: totalCents === 0 };
}

/** Today's date in Finland as YYYY-MM-DD. The early bird deadline and all prices use Finnish dates. */
export function helsinkiToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
