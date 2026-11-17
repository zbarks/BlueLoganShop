# Hepple patterns (read from heppledev2, 16 Nov 2026)

Read only. Nothing in the Hepple repo, Supabase project, Stripe account or Vercel project was changed.

**Framework.** No framework and no build step. Plain HTML, CSS and vanilla JS served as static files, plus Vercel serverless functions (zero-config Node 18+) in `/api`. Only dependency: `stripe`. `vercel.json` sets `cleanUrls: true`, `trailingSlash: false`, long cache headers on assets and basic security headers. Local dev is `npx vercel dev`.

**Folder layout.** `index.html`, `app.js`, `styles.css` at the root; `assets/`; `api/` with underscore-prefixed helper modules (`_catalogue.js`, `_email.js`, `_promo.js`) that Vercel does not route; `supabase-schema.sql` and `migrations/`; `tools/` for small Node build scripts (`build-seo.js` writes static product pages).

**How checkout is created.** `POST /api/checkout` receives `{ items: [{slug, qty}], promo_code, ph_id }`. The server ignores any browser price, looks each slug up in its own catalogue, clamps qty to 1 to 99, validates the promo code through a Supabase RPC (`validate_discount_code`, fails closed), bakes a percentage discount into each line's `price_data` (or uses a Stripe coupon if one is attached), adds one fixed shipping rate, sets `shipping_address_collection: { allowed_countries: ['GB'] }`, phone collection, and builds `success_url`/`cancel_url` from `SITE_URL` (falls back to the Host header, which the security review flagged). Cart summary, promo and PostHog id go in session metadata.

**How the webhook is verified.** `api/stripe-webhook.js` exports `config = { api: { bodyParser: false } }`, reads the raw body, and calls `stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET)`. Handles `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Returns 200 even on downstream errors (logged) so Stripe stops retrying.

**How orders are stored.** Upsert into `public.orders` via Supabase REST with `on_conflict=stripe_session_id` and `Prefer: resolution=merge-duplicates`. Line items come from `stripe.checkout.sessions.listLineItems`. RLS is on with no anon policies; the server uses the service role key. A `site_settings` table (key, value jsonb) holds switches such as `gift_enabled`, read by `/api/settings` and by checkout. Discount codes live in `public.discount_codes` and are managed from the portal.

**How refunds work from the portal.** The portal code is not in this folder (it is a separate app). From the project notes: refunds are issued from the admin portal through the Stripe API against the order's `stripe_payment_intent`, and the order is marked in Supabase. Blue's build does the same: `stripe.refunds.create({ payment_intent })`, server side, admin only, then sets `refunded_at` and status `refunded`.

**How emails are sent.** `api/_email.js` posts straight to `https://api.resend.com/emails` with `fetch` (no SDK). Gated by `EMAILS_ENABLED=true`. Sender from `EMAIL_FROM`, replies to `EMAIL_REPLY_TO`. A shared HTML shell keeps confirmation and shipped emails consistent. The confirmation email is sent at most once by atomically flipping `confirmation_email_sent_at` from null to now. Shipped email with tracking is triggered from the portal.

**How admin auth works.** Portal login is Supabase Auth (email and password), one admin. Server routes use the service role key and must check the caller's Supabase access token before acting.

**PostHog.** Browser snippet in `index.html` with a public `phc_` key, `opt_out_capturing_by_default: true` until the cookie banner is accepted, session recording off. Server sends `order_completed` from the webhook with `$insert_id` = session id so retries are deduplicated.

## Two known Hepple bugs, and how Blue's build avoids them

1. **Webhook failing on a 308 redirect.** Stripe does not follow redirects. When the endpoint was registered on a host that redirects (apex to www, http to https, or a trailing slash), every delivery got a 308 and failed. Blue's build: the README tells you to register `${SITE_URL}/api/stripe-webhook` using the final canonical host, the portal Settings page shows that exact URL, and `npm run check:webhook` requests the URL with redirects disabled and fails loudly on any 3xx.
2. **Shipping address null on some orders.** Newer Stripe API versions moved the address from `session.shipping_details` to `session.collected_information.shipping_details`. Blue's build reads `collected_information.shipping_details` first, then `shipping_details`, then `customer_details.address`, stores `null` safely if none exist, and the portal shows a clear "No address on this order, check Stripe" warning instead of crashing. The confirmation email handles a missing address too.
