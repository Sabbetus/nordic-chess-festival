# Launch checklist

Tick these off before nordicchess.fi goes live. Details for the registration items are in `registration-setup.md`.

## Site

- [ ] **Remove `noindex`.** The test site hides itself from search engines through `PUBLIC_NOINDEX=true`. Remove it (or set it to `false`) in both places:
  - Cloudflare build variables (Worker settings, Build)
  - `.github/workflows/deploy.yml` (the `PUBLIC_NOINDEX: 'true'` line)
  Then check a live page: its source must not contain `<meta name="robots" content="noindex">`, and PageSpeed's "Page is blocked from indexing" warning is gone.
- [ ] Merge to `main`, switch Cloudflare's production branch back to `main`, and point nordicchess.fi at Cloudflare (see `README.md`).
- [ ] Replace or remove all `placeholder: true` content (news, guests, side events). Placeholders are already `noindex` and out of the sitemap, but should not be public.
- [ ] Travel & stay: final content, hotel details and bus times.
- [ ] December: add the online booking code of Hotel H28 and Hotelli Kuohu to the Travel & stay page (it currently says the code is coming in December and that booking is by email or phone) and remove the "coming in December" notice. Also revisit the bus pick-up wording once the stops are known.
- [ ] Intro text and the guest list (replacement for the removed streamer, "more guests" slot).
- [ ] Check `sitemap-index.xml` and the hreflang links on the live domain, and submit the sitemap in Google Search Console.

## Registration and payments

- [ ] Replace the Stripe sandbox keys with live ones: `STRIPE_SECRET_KEY` (restricted key, Checkout Sessions: Write only) and a new webhook endpoint for the final domain with its `STRIPE_WEBHOOK_SECRET`.
- [ ] Turn on Stripe's receipt emails for live payments (Settings, Customer emails, successful payments). Sandbox payments never send emails, so this can only be checked with a real payment.
- [ ] Enable the payment methods in live mode (cards, Apple Pay, Google Pay, MobilePay, Klarna).
- [ ] Check the order of the payment methods in the live Stripe Checkout (the sandbox list is different, so this can only be judged in live mode). Klarna is the most expensive method (about 2.99 % + €0.40, against about 1.5 % + €0.25–0.36 for cards and MobilePay, see Stripe's Finland pricing), so keep it as the last option. The code does not set the methods or their order: they come from the Stripe dashboard (Settings, Payment methods). If the dashboard cannot make Klarna last, the order has to be set in the Checkout Session code instead.
- [ ] Delete the test registrations: `DELETE FROM registrations;` in the D1 console.
- [ ] Put `/admin/*` and `/api/admin/*` behind Cloudflare Access (named organiser emails only).
- [ ] Turn on the Turnstile bot check (`TURNSTILE_SECRET` secret and `PUBLIC_TURNSTILE_SITEKEY` build variable) and add the rate-limit rule for `/api/fide/*`.
- [ ] Set `ADMIN_TOKEN` to a fresh long random value and keep it in the organisers' password manager.
- [ ] FIDE list in R2 (list 2026-11 uploaded by hand, `/api/health` shows `registration: true`; still open: GitHub secrets, `SITE_URL`, merge to `main`)
  Setup details (docs/registration-setup.md, "FIDE list"): bucket `ncf-fide`, GitHub secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, variable `SITE_URL`, and `fide-refresh.yml` merged to `main` (the monthly schedule only runs from there). Check that `/api/health` shows `registration: true` and the current `fideMonth`.
- [ ] Privacy policy: confirm the retention periods (12 months, 6 years for accounting) and the note about minors, then set `draft: false` in `src/content/privacy/*.md`.
- [ ] Accountant: confirm the non-VAT assumption and the refund and receipt handling.
- [ ] Russia and Belarus block (decision of the Finnish Chess Federation): confirm the wording with the Federation. Players with the neutral FIDE federation code (`FID`) are allowed to play (decided). Test with a Russian or Belarusian FIDE ID on the live site.
- [ ] Full test round on the live site with a real small payment, then refund it.
- [ ] Check that the Stripe webhook shows 200 responses in the event deliveries.

## After launch

- [ ] chess-results: add the link (`chessResultsUrl` in `src/data/site.ts`).
- [ ] Watch the `/admin/` FIDE-list banner each month (it turns red after 40 days).
  `fideMonth` on the live site should be the current month; the monthly job keeps it so, and keeps trying after the 3rd without failing; FIDE usually blocks GitHub's runners, so a scheduled task in the Claude session checks `/api/health` every hour on the 1st and uploads the list from there if it is old. The list must be live on the 1st.
