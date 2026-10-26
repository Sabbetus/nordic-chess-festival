import en from './en';
import fi from './fi';
import type { Messages } from './en';

export const locales = ['en', 'fi'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export const messages: Record<Locale, Messages> = { en, fi };

/** Shown in the language switcher, in the language itself. */
export const localeNames: Record<Locale, string> = { en: 'English', fi: 'Suomi' };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/** Prefix a site path (always starting with "/") with the locale, e.g. /tournament/ -> /fi/tournament/. */
export function localePath(lang: Locale, path = '/'): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return lang === defaultLocale ? p : `/${lang}${p}`;
}

/** Strip the locale prefix from a pathname: /fi/tournament/ -> /tournament/. */
export function stripLocale(pathname: string): string {
  for (const l of locales) {
    if (l === defaultLocale) continue;
    if (pathname === `/${l}` || pathname === `/${l}/`) return '/';
    if (pathname.startsWith(`/${l}/`)) return pathname.slice(l.length + 1);
  }
  return pathname;
}

/** Locale from a pathname. */
export function localeFromPath(pathname: string): Locale {
  for (const l of locales) {
    if (l !== defaultLocale && (pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return l;
  }
  return defaultLocale;
}

/**
 * getStaticPaths helper for pages under src/pages/[...locale]/.
 * The default locale has no prefix, so its param is undefined.
 */
export function localeStaticPaths() {
  return locales.map((lang) => ({
    params: { locale: lang === defaultLocale ? undefined : lang },
    props: { lang },
  }));
}

const dateFormats: Record<Locale, string> = { en: 'en-GB', fi: 'fi-FI' };

export function formatDate(lang: Locale, date: Date): string {
  return new Intl.DateTimeFormat(dateFormats[lang], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Helsinki',
  }).format(date);
}

/** "Sat 12 Jun" in English, "la 12.6." in Finnish. */
export function formatDayShort(lang: Locale, isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00+03:00`);
  const parts = new Intl.DateTimeFormat(dateFormats[lang], {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Helsinki',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  if (lang === 'fi') return `${get('weekday')} ${get('day')}.${d.getUTCMonth() + 1}.`;
  return `${get('weekday')} ${get('day')} ${get('month')}`;
}

/** "Saturday 12 June" in English, "lauantai 12. kesäkuuta" in Finnish. */
export function formatDayLong(lang: Locale, isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00+03:00`);
  return new Intl.DateTimeFormat(dateFormats[lang], {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Helsinki',
  }).format(d);
}
