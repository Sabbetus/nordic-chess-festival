# Registration and payments: setup

How it works: the registration form (`/register/`) posts to the Worker (`worker/`), which validates the data, recalculates the price from `src/data/fees.ts`, stores a row in the D1 database and creates a Stripe Checkout Session. Stripe tells the Worker about the payment through a signed webhook. Organisers read the registrations at `/admin/` (or as CSV). Until the setup below is done the form stays hidden and the page shows "registration opens soon".

Nothing secret is in the repository. Secrets live only in the Cloudflare dashboard.

## 1. Create the database

Cloudflare dashboard → Storage & databases → D1 → Create database, name `ncf-registrations`. Open it → Console, paste the contents of `migrations/0001_init.sql` and run it. Then add to `wrangler.jsonc`:

```jsonc
"d1_databases": [{ "binding": "DB", "database_name": "ncf-registrations", "database_id": "<id from the dashboard>" }]
```

## 2. Stripe

1. Start in **test mode** (sandbox). Create a **restricted key** (Developers → API keys → Create restricted key) with only: Checkout Sessions: Write. Nothing else.
2. Developers → Webhooks → Add endpoint: `https://<site>/api/stripe/webhook`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`. Copy the signing secret (`whsec_…`).
3. Enable payment methods under Settings → Payment methods: cards, Apple Pay, Google Pay, MobilePay, Klarna (as available for the account).

## 3. Secrets (Worker → Settings → Variables and secrets, type "Secret")

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | the restricted key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `ADMIN_TOKEN` | at least 32 random characters (e.g. from a password manager); shared only with the few organisers who need it. Shorter tokens are refused. |
| `TURNSTILE_SECRET` (optional, recommended before launch) | Cloudflare Turnstile secret; also set build variable `PUBLIC_TURNSTILE_SITEKEY` to its site key |

## 4. Protect the organiser page

Besides the access key, put `/admin/*` behind **Cloudflare Access** (Zero Trust → Access → Applications, self-hosted, one-time PIN to named organiser emails; free for up to 50 users). Also cover `/api/admin/*` in the same application so the API needs a login too. Two independent locks.

## 5. Go live

Repeat step 2–3 with live-mode keys and a webhook for the final domain. Test in test mode first (card 4242 4242 4242 4242): every price band, early bird (before/after 31 Jan), junior/senior, an ID without a rating, an ID that is not in the list, bus, GM free, MobilePay, cancelled payment, a partial refund.

## FIDE list (automatic, stored in R2)

Every registrant needs a FIDE ID, unrated players too (the head arbiter requires it; a player without one asks their national chess federation). Players type only the ID. Name, federation, title, rating and birth year come from FIDE's official **combined player list** (`players_list_xml`, about 51 MB zipped, 863 MB unzipped, roughly 1.95 million players). Unlike FIDE's standard rating list, it also contains players with an ID but no standard rating (rating 0): they are unrated and pay the unrated fee. Nothing is typed in or trusted from the browser for those fields.

The list is **not part of the site**. It is turned into 1024 small JSON files (about 100 KB each, 94 MB in all) and kept in a Cloudflare **R2 bucket** (`ncf-fide`, binding `FIDE_LIST` in `wrangler.jsonc`). The Worker reads one file per lookup. Deploying the site therefore never touches FIDE and takes seconds, and a new month's list needs no deploy. R2's free tier (10 GB storage, 1 million writes and 10 million reads a month) is far above what this uses.

- An ID that is not in our list (a typo, or an ID created after the list was published) is refused. The message gives the month of our list and the date of the next update.
- Registration is closed while the bucket has no list, because IDs cannot be checked. `/api/health` shows `registration: false` then.
- The year of birth is asked for only when FIDE does not have it (about 1.7 % of players).
- Organisers can change a name afterwards in `/admin/` (the FIDE name is kept in the note).

How the list gets there (`.github/workflows/fide-refresh.yml`):

- `scripts/build-fide.mjs` downloads FIDE's list and writes the files to `.cache/fide/`. It downloads **only when needed**: while the cached list is for the current month or later, nothing is downloaded. In practice that is once, on or after the 1st of each month (about 3 minutes, mostly waiting for FIDE). The workflow keeps the cache folder between runs, keyed by the month. `--refresh` forces a download.
- `scripts/upload-fide.mjs` puts the files in the bucket as `<month>/<n>.json` and writes `current.json` last, so the Worker switches to the new list only when all of it is there. If the bucket already holds the list, it uploads nothing.
- On the 1st the job checks every 30 minutes, on the 2nd and 3rd every hour. If FIDE has published the new month and the live site does not have it yet, it builds and uploads. Otherwise it stops after a few seconds. After the 3rd it keeps trying every 6 hours for the rest of the month. A refused connection or an unpublished list is only a warning, not a failed run (GitHub's runners are often blocked by FIDE); then the list is uploaded by hand (`npm run fide:build && npm run fide:upload` with the `R2_*` variables set) or, on the 1st, by the scheduled task in the Claude session: it checks `/api/health` every hour on the 1st and uploads the list from there if the site still has the old month, so the list is live on the 1st even though GitHub cannot reach FIDE.
- The Worker re-reads `current.json` every 5 minutes, so a new month shows up on the site within minutes. `/admin/` shows the age of the list and turns red if it is older than 40 days.
- **Guest ratings.** The ratings shown for the guests (`src/content/guests/*.yaml`) come from the same list: `npm run guests:update -- --month <YYYY-MM>` reads each guest's FIDE ID from the site's lookup (`/api/fide/<id>`), updates `rating` and its month, and raises `peakRating` if the new rating is higher (FIDE's monthly list has no peak rating). It changes the repository, so the result still has to be committed, pushed and deployed. The scheduled monthly check does this on the 1st.
- Old months stay in the bucket (about 94 MB each); delete old folders in the dashboard now and then if you like. They are harmless.

One-time setup:

1. Cloudflare dashboard, **Storage & databases, R2 object storage**, enable R2 (a payment method may be asked for; usage stays in the free tier) and **Create bucket** named `ncf-fide`, storage class **Standard**. Create it **before** the first deploy: `wrangler deploy` fails if the bucket in `wrangler.jsonc` does not exist.
2. On the R2 overview page, **Manage API tokens, Create API token**: permission **Object Read & Write**, scoped to the bucket `ncf-fide`. Copy the **Access Key ID** and **Secret Access Key** (shown once). The same page shows your **Account ID**.
3. In GitHub (Settings, Secrets and variables, Actions) add secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Optional variables: `SITE_URL` (the live address) and `R2_BUCKET` if you used another name.
4. The job runs by itself when the scripts change on the deploy branch (that is how the first list gets uploaded; or open the run in the Actions tab and choose "Re-run all jobs"). For the monthly schedule, the workflow file has to be on `main`, because GitHub runs scheduled jobs only from the default branch.

To load a list by hand from a computer: `npm run fide:build`, then `npm run fide:upload` with the three `R2_*` values set as environment variables.

Recommended: a Cloudflare rate-limiting rule for `/api/fide/*` (Security, WAF, Rate limiting rules) so the lookup cannot be used to scan IDs in bulk. The data is public on FIDE, but there is no reason to serve it in bulk.

## Security summary

- Server validates everything and recalculates the price; the browser is never trusted. Name, federation, title, rating and birth year of players with a FIDE ID come from the FIDE list on the server.
- Card and MobilePay details never reach us (Stripe Checkout); webhook is HMAC-verified with a 5-minute replay window.
- Same-origin check and honeypot on registration, optional Turnstile, duplicate checks.
- Organiser access: long secret token compared in constant time, plus Cloudflare Access; the key is kept only in page memory.
- CSV export guards against spreadsheet formula injection.
- Unpaid attempts are deleted after 48 h (daily cron); retention policy is in the privacy policy.
- API responses are `no-store`; no personal data in logs or in the repository; security headers in `public/_headers`.
- Stripe key is restricted to the minimum permission.

## Refunds

Done manually in the Stripe dashboard (75 % partial refund before the deadline); the webhook updates the registration status.

## Later (stage 2)

Automating chess-results entry: generate a Swiss-Manager import file from the registrations. Until then organisers copy players from the export.
