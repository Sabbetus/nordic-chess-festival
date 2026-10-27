# Launch checklist

Tick these off before nordicchess.fi goes live. Details for the registration items are in `registration-setup.md`.

## Site

- [ ] **Remove `noindex`.** The test site hides itself from search engines through `PUBLIC_NOINDEX=true`. Remove it (or set it to `false`) in all three places:
  - Cloudflare build variables (Worker settings, Build)
  - `.github/workflows/deploy.yml` (the `PUBLIC_NOINDEX: 'true'` line)
  - `.github/workflows/fide-refresh.yml` (the `PUBLIC_NOINDEX` variable default; also the repository variable if one was set)
  Then check a live page: its source must not contain `<meta name="robots" content="noindex">`, and PageSpeed's "Page is blocked from indexing" warning is gone.
- [ ] Merge to `main`, switch Cloudflare's production branch back to `main`, and point nordicchess.fi at Cloudflare (see `README.md`).
- [ ] Replace or remove all `placeholder: true` content (news, guests, side events). Placeholders are already `noindex` and out of the sitemap, but should not be public.
- [ ] Travel & stay: final content, hotel details and bus times.
- [ ] Intro text and the guest list (replacement for the removed streamer, "more guests" slot).
- [ ] Check `sitemap-index.xml` and the hreflang links on the live domain, and submit the sitemap in Google Search Console.

## Registration and payments

- [ ] Replace the Stripe sandbox keys with live ones: `STRIPE_SECRET_KEY` (restricted key, Checkout Sessions: Write only) and a new webhook endpoint for the final domain with its `STRIPE_WEBHOOK_SECRET`.
- [ ] Enable the payment methods in live mode (cards, Apple Pay, Google Pay, MobilePay, Klarna).
- [ ] Delete the test registrations: `DELETE FROM registrations;` in the D1 console.
- [ ] Put `/admin/*` and `/api/admin/*` behind Cloudflare Access (named organiser emails only).
- [ ] Turn on the Turnstile bot check (`TURNSTILE_SECRET` secret and `PUBLIC_TURNSTILE_SITEKEY` build variable) and add the rate-limit rule for `/api/fide/*`.
- [ ] Set `ADMIN_TOKEN` to a fresh long random value and keep it in the organisers' password manager.
- [ ] Automatic FIDE list refresh: GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, variables `SITE_URL` and `DEPLOY_BRANCH`, and `fide-refresh.yml` merged to `main`. Run it once by hand (Actions, "Refresh FIDE rating list", Run workflow) and check that `/admin/` shows a fresh list date.
- [ ] Privacy policy: confirm the retention periods (12 months, 6 years for accounting) and the note about minors, then set `draft: false` in `src/content/privacy/*.md`.
- [ ] Accountant: confirm the non-VAT assumption and the refund and receipt handling.
- [ ] Full test round on the live site with a real small payment, then refund it.
- [ ] Check that the Stripe webhook shows 200 responses in the event deliveries.

## After launch

- [ ] chess-results: add the link (`chessResultsUrl` in `src/data/site.ts`).
- [ ] Watch the `/admin/` FIDE-list banner each month (it turns red after 40 days).
