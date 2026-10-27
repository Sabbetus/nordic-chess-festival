// Registration rules shared by the form (browser) and the Worker (server).
// The server never trusts the browser: it validates again and recalculates the price.

import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';
import type { Title } from '../data/fees.ts';
import { isBlockedFederation, isFederation } from '../data/federations.ts';

export const titles: readonly Title[] = ['GM', 'WGM', 'IM', 'WIM', 'FM', 'WFM', 'CM', 'WCM'];
export const locales = ['en', 'fi'] as const;
export type RegLocale = (typeof locales)[number];

/** What the registration form sends. All values are strings or booleans, as typed by the player. */
export interface RegistrationInput {
  name?: string;
  email?: string;
  phoneCountry?: string;
  phoneNumber?: string;
  noFideId?: boolean;
  fideId?: string;
  title?: string;
  rating?: string | number | null;
  birthYear?: string | number;
  federation?: string;
  bus?: boolean;
  accept?: boolean;
  locale?: string;
  /** Honeypot: real players never fill this in. */
  website?: string;
}

/** A validated registration. */
export interface Registration {
  name: string;
  email: string;
  /** E.164, e.g. +358401234567 */
  phone: string;
  fideId: string | null;
  title: Title | null;
  rating: number | null;
  birthYear: number;
  federation: string;
  bus: boolean;
  locale: RegLocale;
}

export type Field = 'name' | 'email' | 'phone' | 'fideId' | 'title' | 'rating' | 'birthYear' | 'federation' | 'accept';
export type FieldErrors = Partial<Record<Field, 'required' | 'invalid'>>;

const MAX_BIRTH_YEAR = 2022;
const MIN_BIRTH_YEAR = 1900;

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function validateRegistration(input: unknown):
  | { ok: true; value: Registration }
  | { ok: false; errors: FieldErrors } {
  const i = (input && typeof input === 'object' ? input : {}) as RegistrationInput;
  const errors: FieldErrors = {};

  const name = text(i.name).replace(/\s+/g, ' ');
  if (!name) errors.name = 'required';
  else if (name.length < 2 || name.length > 100) errors.name = 'invalid';

  const email = text(i.email).toLowerCase();
  if (!email) errors.email = 'required';
  else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'invalid';

  let phone = '';
  const national = text(i.phoneNumber);
  if (!national) errors.phone = 'required';
  else {
    const parsed = parsePhoneNumberFromString(national, text(i.phoneCountry).toUpperCase() as CountryCode);
    if (parsed && parsed.isValid()) phone = parsed.number;
    else errors.phone = 'invalid';
  }

  const noFideId = i.noFideId === true;
  let fideId: string | null = null;
  let title: Title | null = null;
  let rating: number | null = null;
  if (!noFideId) {
    const id = text(i.fideId);
    if (!id) errors.fideId = 'required';
    else if (!/^\d{3,10}$/.test(id)) errors.fideId = 'invalid';
    else fideId = id;

    const t = text(i.title);
    if (t) {
      if ((titles as readonly string[]).includes(t)) title = t as Title;
      else errors.title = 'invalid';
    }

    const r = typeof i.rating === 'number' ? String(i.rating) : text(i.rating);
    if (r) {
      const n = Number(r);
      if (!/^\d{3,4}$/.test(r) || n < 1000 || n > 3000) errors.rating = 'invalid';
      else rating = n;
    }
  }

  const by = text(String(i.birthYear ?? ''));
  let birthYear = 0;
  if (!by) errors.birthYear = 'required';
  else {
    birthYear = Number(by);
    if (!/^\d{4}$/.test(by) || birthYear < MIN_BIRTH_YEAR || birthYear > MAX_BIRTH_YEAR) errors.birthYear = 'invalid';
  }

  const federation = text(i.federation).toUpperCase();
  if (!federation) errors.federation = 'required';
  else if (!isFederation(federation) || isBlockedFederation(federation)) errors.federation = 'invalid';

  if (i.accept !== true) errors.accept = 'required';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const locale: RegLocale = i.locale === 'fi' ? 'fi' : 'en';
  return { ok: true, value: { name, email, phone, fideId, title, rating, birthYear, federation, bus: i.bus === true, locale } };
}

export { quote, helsinkiToday, type Quote } from './pricing.ts';
