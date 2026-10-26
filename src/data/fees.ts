// Single source of truth for entry fees. The fee page, the price calculator
// and anything else that shows prices must read from here.

export const festival = {
  name: 'Nordic Chess Festival',
  year: 2027,
  startDate: '2027-06-12',
  endDate: '2027-06-20',
  rounds: 9,
  email: 'info@nordicchess.fi',
} as const;

export const rules = {
  // Early bird applies to payments made up to and including this day (Finnish time).
  earlyBirdDeadline: '2027-01-31',
  // Juniors: born in this year or later. Seniors: born in this year or earlier.
  juniorBornFrom: 2009,
  seniorBornUntil: 1962,
  // Withdrawals up to this many days before the start get a partial refund.
  refundDaysBefore: 10,
  refundPercent: 75,
  refundDeadline: '2027-06-02',
} as const;

export type BandId =
  | 'gm'
  | 'im'
  | 'fm'
  | 'r2150'
  | 'r2000'
  | 'r1800'
  | 'r1600'
  | 'r1400'
  | 'unrated';

export interface FeeBand {
  id: BandId;
  /** Label shown in the table, not translated (titles and rating ranges). */
  label: string;
  /** Regular entry fee in euros. */
  regular: number;
  /** Fee for early bird payments and for juniors and seniors. */
  discounted: number;
}

// Discounted fees are 25 % off, rounded up to the nearest 5 €.
// IM / WIM is a deliberate exception (70 € -> 50 €).
export const bands: readonly FeeBand[] = [
  { id: 'gm', label: 'GM / WGM', regular: 0, discounted: 0 },
  { id: 'im', label: 'IM / WIM', regular: 70, discounted: 50 },
  { id: 'fm', label: 'FM & 2300+', regular: 130, discounted: 100 },
  { id: 'r2150', label: '2150–2299', regular: 170, discounted: 130 },
  { id: 'r2000', label: '2000–2149', regular: 190, discounted: 145 },
  { id: 'r1800', label: '1800–1999', regular: 215, discounted: 165 },
  { id: 'r1600', label: '1600–1799', regular: 240, discounted: 180 },
  { id: 'r1400', label: '1400–1599', regular: 270, discounted: 205 },
  { id: 'unrated', label: 'Unrated', regular: 300, discounted: 225 },
];

export type Title = 'GM' | 'WGM' | 'IM' | 'WIM' | 'FM' | 'WFM' | 'CM' | 'WCM';

export interface FeeInput {
  title?: Title | null;
  /** FIDE rating on the day of payment, or null / undefined if unrated. */
  rating?: number | null;
  birthYear: number;
  /** Day of payment as YYYY-MM-DD in Finnish time. */
  paidOn: string;
}

export type DiscountReason = 'none' | 'early-bird' | 'junior' | 'senior';

export interface FeeResult {
  band: FeeBand;
  amount: number;
  discount: DiscountReason;
}

export function bandFor(title: Title | null | undefined, rating: number | null | undefined): FeeBand {
  const pick = (id: BandId) => bands.find((b) => b.id === id)!;
  if (title === 'GM' || title === 'WGM') return pick('gm');
  if (title === 'IM' || title === 'WIM') return pick('im');
  if (title === 'FM') return pick('fm');
  if (!rating) return pick('unrated');
  if (rating >= 2300) return pick('fm');
  if (rating >= 2150) return pick('r2150');
  if (rating >= 2000) return pick('r2000');
  if (rating >= 1800) return pick('r1800');
  if (rating >= 1600) return pick('r1600');
  if (rating >= 1400) return pick('r1400');
  return pick('unrated');
}

/** The one discount a player gets (discounts never stack), or 'none'. */
export function discountFor(birthYear: number, paidOn: string): DiscountReason {
  if (birthYear >= rules.juniorBornFrom) return 'junior';
  if (birthYear <= rules.seniorBornUntil) return 'senior';
  if (paidOn <= rules.earlyBirdDeadline) return 'early-bird';
  return 'none';
}

export function calculateFee(input: FeeInput): FeeResult {
  const band = bandFor(input.title, input.rating);
  const discount = discountFor(input.birthYear, input.paidOn);
  const amount = discount === 'none' ? band.regular : band.discounted;
  return { band, amount, discount };
}

/** Prices are written "300 €" with a non-breaking space. */
export function formatEuro(amount: number): string {
  return `${amount} €`;
}
