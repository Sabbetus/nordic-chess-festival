// Sends visitors whose browser prefers Finnish to the Finnish version of the page they asked for.
//
// Rules:
//  - only page requests (GET/HEAD) for English paths are considered; /fi/..., /api/..., /admin/..., assets and files are not;
//  - if the visitor has chosen a language with the language switch (cookie "lang"), nothing is redirected;
//  - otherwise the browser's Accept-Language decides: Finnish must rank above English (ties and no header: stay).
// The redirect is a 302, so it is never cached as the page's permanent address.

const SKIP_PREFIXES = ['/fi', '/api', '/admin', '/_astro', '/fonts'];

/** True if Finnish ranks strictly above English in an Accept-Language header. */
export function prefersFinnish(header: string | null): boolean {
  if (!header) return false;
  let fi = -1;
  let en = -1;
  for (const part of header.split(',')) {
    const [tag, ...params] = part.trim().split(';');
    const lang = tag.trim().toLowerCase().split('-')[0];
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (!Number.isFinite(q) || q <= 0) continue;
    if (lang === 'fi') fi = Math.max(fi, q);
    else if (lang === 'en') en = Math.max(en, q);
  }
  return fi > 0 && fi > en;
}

export function hasLanguageCookie(cookie: string | null): boolean {
  return !!cookie && /(?:^|;\s*)lang=(?:en|fi)(?:;|$)/.test(cookie);
}

/** Where to send this request, or null to serve the page as it is. */
export function finnishRedirect(request: Request): string | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  const path = url.pathname;
  if (SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  if (/\.[A-Za-z0-9]+$/.test(path)) return null; // files: favicon.svg, sitemap, images
  if (hasLanguageCookie(request.headers.get('cookie'))) return null;
  if (!prefersFinnish(request.headers.get('accept-language'))) return null;
  return new URL(`/fi${path === '/' ? '/' : path}${url.search}`, url).href;
}

/** True for English page requests, whose answer depends on the visitor's language headers. */
export function isEnglishPage(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return !SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) && !/\.[A-Za-z0-9]+$/.test(path);
}
