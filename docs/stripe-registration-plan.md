# Registration and payments plan (Stripe)

Status: planning. The Stripe account is activated; payment methods enabled: cards, Apple Pay, Google Pay,
MobilePay, Klarna. Nothing is implemented yet. No secret keys belong in this repository or in chat.

## What has to happen

1. A player enters their details and pays the right entry fee for their rating, age group and payment date.
2. The organiser gets a clean list of who registered (name, email, FIDE ID, birth year, bus yes/no) to enter into
   Swiss-Manager and chess-results. Chess-results stays the official entry list.
3. Refunds: 75 % until 2 June 2027 (partial refunds, done in the Stripe dashboard).
4. Grandmasters (GM, WGM) play free and confirm by email, so they need no payment.

Fee rules live in `src/data/fees.ts` (single source of truth, tested in `tests/fees.test.ts`; run `npm test`): 8 paying
bands, two prices each, early bird until 31 Jan 2027, junior (born 2009 or later) and senior (born 1962 or
earlier) discount, discounts never stack, IM / WIM exception.

| Band | Regular € | Discounted € (early bird, junior, senior) |
| --- | --- | --- |
| IM / WIM | 70 | 50 |
| FM & 2300+ | 130 | 100 |
| 2150–2299 | 170 | 130 |
| 2000–2149 | 190 | 145 |
| 1800–1999 | 215 | 165 |
| 1600–1799 | 240 | 180 |
| 1400–1599 | 270 | 205 |
| Unrated | 300 | 225 |

Optional bus transfer from Tampere: a fixed, subsidised amount (details and price to come), added only if the
player wants it. Hotels are booked directly between players and hotels and are not part of the payment.

## What Stripe supports (from Stripe's documentation)

- **Payment Links** support MobilePay, Klarna, cards, Apple Pay and Google Pay (product support table:
  <https://docs.stripe.com/payments/payment-methods/payment-method-support>). MobilePay needs a business in
  Denmark or Finland (we are in Finland) and works in EUR.
- **Optional items:** up to 10 per link, shown at checkout as extra products the customer can add
  (<https://docs.stripe.com/payment-links/promotions>). This can carry the bus add-on.
- **Custom fields:** text (up to 255 characters), numbers only, dropdown (10 options in the dashboard). Answers
  appear on the payment in the dashboard and in the `checkout.session.completed` event
  (<https://docs.stripe.com/payment-links/customize>). I believe the limit is three custom fields per link; this
  is not stated on that page and must be verified.
- **Names, email, phone, terms-of-service checkbox** can be collected; the terms checkbox needs a terms URL in the
  account's public details (the regulations page could be that).
- **URL parameters:** `client_reference_id`, `prefilled_email`, `locale`
  (<https://docs.stripe.com/payment-links/url-parameters>).
- **After payment:** confirmation message or redirect (the redirect can include `{CHECKOUT_SESSION_ID}`),
  automatic email receipts, full and partial refunds in the dashboard
  (<https://docs.stripe.com/payment-links/post-payment>).
- Links can be limited to a number of payments and deactivated; there is no scheduled expiry.

## Option 1: Payment Links only (no server code)

- 16 payment links (8 bands x regular / discounted); 24 if early-bird links are kept separate so they can be
  switched off by hand on 1 Feb.
- Custom fields: FIDE ID, birth year. Name and email collected by Stripe. Bus as an optional item.
- The site helps the player find the right link (a calculator in the browser using `fees.ts`) and switches from
  early-bird to regular links on the deadline.
- No secrets, fastest to launch, works with the current hosting.
- Weaknesses: the player can still pick the wrong link; rating and birth year are only self-declared, so the
  organiser checks them; registration data sits in the Stripe dashboard payment by payment (I could not confirm
  that the dashboard export includes custom field answers); every price change means editing links.

## Option 2: Cloudflare Worker + Stripe Checkout Sessions + webhook (small server code)

- The registration form on the site posts to a Worker; the Worker calculates the price with `fees.ts` (including
  the early-bird date by server clock and the birth-year discounts), creates a Checkout Session and redirects to
  Stripe. The bus is a checkbox in our form.
- A webhook (`checkout.session.completed`) stores the registration (Cloudflare D1 or KV) and can send a
  confirmation email. The registered-players page and an organiser export (CSV) read from that.
- Needs secrets set in Cloudflare (a restricted Stripe API key and the webhook signing secret), which the owner
  adds directly in the Cloudflare dashboard. Developed and tested in the Stripe sandbox first.
- Strengths: one source of truth for prices, no wrong-band mistakes, automatic registration list, one flow for
  bus and early bird, free entries for GM / WGM can use the same form without payment.
- Costs: more code to write, test and maintain, and we become responsible for storing personal data.

## Recommendation

Option 2 if the goal is a smooth process for about 400 registrations. The real cost of Option 1 is reading and
reconciling hundreds of registrations by hand. Option 1 remains a sound fallback if time gets short.

## Needed either way

- A privacy policy (the site page is a placeholder today). Required before collecting any personal data.
- Terms for registration: regulations, refund policy, data protection (regulation section 9).
- Decide which details to collect: name, email, FIDE ID, birth year, federation, club?, phone? (collect only
  what is needed).
- Bus transfer details and price.
- Who receives payment notifications; the receipt wording and branding in Stripe.
- Test plan in the sandbox: every band, early bird and after, junior, senior, bus yes / no, MobilePay, Klarna,
  card, a partial refund.
- VAT: assume none (non-profit association, to be confirmed by an accountant). Prices shown are final prices.

## Open questions

1. Option 1 or Option 2?
2. Bus details (price, one way or return, times, pickup points).
3. Which registration details to collect.
4. How should GM / WGM confirm: email (as in the regulations) or a free registration through the same form?
