# Nordic Chess Festival website

Source for [nordicchess.fi](https://nordicchess.fi): an Astro static site, English and Finnish.

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
npm run check    # type check
```

Requires Node 22.12 or newer.

## Where things live

| What | Where |
| --- | --- |
| Entry fees, discount rules, fee calculator | `src/data/fees.ts` (single source of truth) |
| Site text, one file per language | `src/i18n/en.ts`, `src/i18n/fi.ts` |
| Adding a language | add `src/i18n/<code>.ts`, register it in `src/i18n/utils.ts` and `astro.config.mjs` |
| Guest profiles (GMs, streamers) | `src/content/guests/*.yaml`, photos in `src/assets/guests/` |
| News | `src/content/news/<lang>/<slug>.md` (same slug in each language) |
| FAQ, side events | `src/content/faq/`, `src/content/side-events/` |
| Registered players (synced from chess-results) | `src/data/registered-players.json` |
| Pages | `src/pages/[...locale]/` (English at `/`, Finnish at `/fi/`) |
| Design tokens, global styles | `src/styles/global.css` |
| The old teaser | `teaser/index.html` (not part of the build) |

Entries with `placeholder: true` are dummy content. They are marked `noindex` and left out of the sitemap; replace them before launch.

## Hosting

The site is built and hosted on Cloudflare Pages.

- Framework preset: Astro
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `NODE_VERSION=22`

`public/_headers` keeps `*.pages.dev` and `test.nordicchess.fi` out of search engines.
