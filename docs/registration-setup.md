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

Repeat step 2–3 with live-mode keys and a webhook for the final domain. Test in test mode first (card 4242 4242 4242 4242): every price band, early bird (before/after 31 Jan), junior/senior, no FIDE ID, bus, GM free, MobilePay, cancelled payment, a partial refund.

## FIDE rating list (automatic)

Players type only their FIDE ID. Name, federation, title, rating and birth year come from FIDE's official monthly rating list, which is built into every deployment as small data files (`scripts/build-fide.mjs`, written to `dist/api/fide/`). The Worker looks players up there; nothing is typed in or trusted from the browser for those fields. IDs that are not in the list register as unrated (name, federation and birth year are then typed). Organisers can change a name afterwards in `/admin/` (the FIDE name is kept in the note).

Every build downloads the current list, so every normal deploy also refreshes it. In addition, `.github/workflows/fide-refresh.yml` makes sure each new month's list is picked up by itself:

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
