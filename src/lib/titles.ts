// FIDE titles as the Finnish site shows them: the Finnish chess federation's abbreviations (SM, KvM, FM ...).
export const titlesFi: Record<string, string> = { GM: 'SM', WGM: 'NSM', IM: 'KvM', WIM: 'NKvM', FM: 'FM', WFM: 'NFM', CM: 'CM', WCM: 'NCM' };

export const titleLabel = (lang: string, title: string): string => (lang === 'fi' ? titlesFi[title] ?? title : title);

/** Replaces title abbreviations inside a text, e.g. "GM / WGM" becomes "SM / NSM" on the Finnish site. */
export const localizeTitles = (lang: string, text: string): string =>
  lang === 'fi' ? text.replace(/\b(WGM|WIM|WFM|WCM|GM|IM|FM|CM)\b/g, (m) => titlesFi[m] ?? m) : text;
