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

## FIDE list (automatic)

Every registrant needs a FIDE ID, unrated players too (the head arbiter requires it; a player without one asks their national chess federation). Players type only the ID. Name, federation, title, rating and birth year come from FIDE's official **combined player list** (`players_list_xml`, about 51 MB zipped, 863 MB unzipped, roughly 1.95 million players). Unlike FIDE's standard rating list, it also contains players with an ID but no standard rating (rating 0): they are unrated and pay the unrated fee. The list is built into every deployment as small data files (`scripts/build-fide.mjs`, written to `dist/api/fide/`, 1024 files of about 100 KB). The Worker looks players up there; nothing is typed in or trusted from the browser for those fields.

- An ID that is not in our list (a typo, or an ID created after the list was published) is refused. The message gives the month of our list and the date of the next update.
- Registration is closed on a deployment that has no list (the build could not download it), because IDs cannot be checked. `/api/health` shows `registration: false` then.
- The year of birth is asked for only when FIDE does not have it (about 1.7 % of players).
- Organisers can change a name afterwards in `/admin/` (the FIDE name is kept in the note).

The list is big, so it is downloaded only when it is needed (about 3 minutes, mostly waiting for FIDE): the finished list is kept in `.cache/fide/`, and while the cached list is for the current month or later, a build just copies it and does not touch the network (1 second). A new download happens only when there is no cache or its month is older than the current month, which in practice means once, on or after the 1st of each month. `node scripts/build-fide.mjs --refresh` forces a download. The GitHub workflows keep the cache between runs with `actions/cache`, keyed by the month.

Cloudflare's own git builds start from an empty container each time, so on those every deploy downloads the list. Deploying through GitHub Actions (`deploy.yml`, needs the two Cloudflare secrets) avoids that; if the repeated download on Cloudflare builds becomes a nuisance, Cloudflare's build cache or an R2 bucket holding the finished list are the options to look at. In addition, `.github/workflows/fide-refresh.yml` makes sure each new month's list is picked up by itself:

- On the 1st it checks every 30 minutes, on the 2nd and 3rd every hour. If FIDE has published the new month and the live site does not have it yet, it rebuilds and redeploys. Otherwise it stops after a few seconds.
- If FIDE has not published by the 3rd, the job fails so GitHub emails you.
- `/admin/` shows the age of the list and turns red if it is older than 40 days.

To enable it, in GitHub (Settings, Secrets and variables, Actions): secrets `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers") and `CLOUDFLARE_ACCOUNT_ID`; variables `SITE_URL` (the live address) and `DEPLOY_BRANCH` (the branch Cloudflare deploys). GitHub runs scheduled jobs only from the default branch, so the workflow file has to be on `main`.

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
