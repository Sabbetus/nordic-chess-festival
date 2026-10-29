// Competition schedule from the preliminary regulations. All times are Finnish local time
// (EEST, UTC+3 in June). Update here and the Main Event page, home page and countdown follow.

export const venue = {
  name: 'Kangasala Areena',
  street: 'Finnentie 37',
  city: 'Kangasala',
  country: 'Finland',
  countryCode: 'FI',
  mapUrl: 'https://maps.app.goo.gl/v6PUZcjyR2sazAJW6',
} as const;

export type ScheduleKind = 'confirmation' | 'opening' | 'round' | 'prizegiving';

export interface ScheduleItem {
  kind: ScheduleKind;
  /** Round number, for kind "round". */
  round?: number;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, or the deadline for "confirmation". */
  time: string;
}

export const schedule: readonly ScheduleItem[] = [
  { kind: 'confirmation', date: '2027-06-12', time: '14:00' },
  { kind: 'opening', date: '2027-06-12', time: '15:30' },
  { kind: 'round', round: 1, date: '2027-06-12', time: '16:00' },
  { kind: 'round', round: 2, date: '2027-06-13', time: '14:00' },
  { kind: 'round', round: 3, date: '2027-06-14', time: '14:00' },
  { kind: 'round', round: 4, date: '2027-06-15', time: '14:00' },
  { kind: 'round', round: 5, date: '2027-06-16', time: '14:00' },
  { kind: 'round', round: 6, date: '2027-06-17', time: '14:00' },
  { kind: 'round', round: 7, date: '2027-06-18', time: '14:00' },
  { kind: 'round', round: 8, date: '2027-06-19', time: '14:00' },
  { kind: 'round', round: 9, date: '2027-06-20', time: '11:00' },
  { kind: 'prizegiving', date: '2027-06-20', time: '17:00' },
];

export const rounds = schedule.filter((i) => i.kind === 'round');

/** Start of round 1 as an ISO timestamp, used by the countdown. */
export const firstRoundStart = `${rounds[0].date}T${rounds[0].time}:00+03:00`;
