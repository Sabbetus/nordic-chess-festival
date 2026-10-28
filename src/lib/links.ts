// Links inside plain content strings: "[text](/path/)". Site paths are turned into links for the page's language.
import { localePath, type Locale } from '../i18n/utils';

export interface Part { text: string; href?: string }

export function linkParts(text: string, lang: Locale): Part[] {
  return text.split(/(\[[^\]]+\]\([^)]+\))/).filter(Boolean).map((chunk) => {
    const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(chunk);
    if (!m) return { text: chunk };
    const [, label, target] = m;
    return { text: label, href: target.startsWith('/') ? localePath(lang, target) : target };
  });
}

/** The same string without link markup, for search engines and structured data. */
export const plainText = (text: string) => text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
