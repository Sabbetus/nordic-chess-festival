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

The site is built and hosted with Cloudflare Workers Builds (static assets). `wrangler.jsonc` serves `dist/`.

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Build variables: `NODE_VERSION=22`, and `PUBLIC_NOINDEX=true` on test and preview deployments
  (adds `noindex` to every page; remove it at launch)

Production branch is set in Cloudflare under Settings > Builds > Branch control.

Until launch the production branch is the development branch (`claude/stoic-franklin-e6jw9t`), so the
stable `workers.dev` address always shows the latest new site while `main` still holds the teaser.
At launch: merge to `main`, switch the production branch back to `main`, remove `PUBLIC_NOINDEX`,
and point nordicchess.fi at Cloudflare. The full list is in `docs/launch-checklist.md`.

## Image sources

Guest portraits come from Wikimedia Commons; author and licence are shown next to each photo (see
`photoCredit` and `photoSourceUrl` in `src/content/guests/*.yaml`). Kangasala images in `src/assets/`:

| File | Source |
| --- | --- |
| `kangasala-aerial.jpg` | Wikimedia Commons, "Kangasala aerial 4.jpg" |
| `kangasala-talo.jpg` | Wikimedia Commons, "Kangasala-talo kesäaamun valossa.jpg" (not used yet) |

Licences for the Kangasala images have not been checked. Replace them with images from the city of Kangasala
once the partnership is in place.
