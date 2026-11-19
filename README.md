# Blue Logan Shop and Portal

Blue's Shop: an illustrated shopfront by Blue on the home page (door, window and shelves are clickable), and behind it a normal, easy online shop with categories, prices, search, basket and Stripe Checkout. Any product can be set to "Enquire" instead of "Buy". Blue runs everything from the portal: products, prices, stock, photos, categories, the shop window, orders, refunds and messages.

Until Blue's illustration is uploaded, the home page shows the framework as a wireframe. The plan he draws to is in `ILLUSTRATION_FRAMEWORK.md`; the clickable areas live in `assets/shopfront/zones.json`.

Design: textured paper background, hand-lettered headings, Blue's turquoise and red used sparingly. "Permanent Marker" stands in for Blue's handwriting until his own font is made (swap the file in `assets/fonts` and `--hand` in `assets/css/shop.css`).

On this platform rather than Shopify: it is already built and tested, has no monthly platform fee, and the illustrated shopfront is simpler to control here. Shopify remains an option if Blue ever needs its app ecosystem.

## Stack

- Plain HTML, CSS and JS. No framework, no build step on Vercel.
- Vercel functions in `/api` (Node 20+, ES modules). Helpers live in `api/_lib/` and are not routed.
- `middleware.js` keeps every `/portal` page behind the admin login (signed cookie).
- Stripe Checkout (hosted), GBP, UK delivery.
- Supabase (shared Clientside project, `bl_` tables): Postgres with row level security, and Storage for photos.
- Resend for email. PostHog for analytics, off until switched on and until the visitor accepts.

```
shop.html, product.html, contact.html,     customer pages (generated from src/, see below)
404.html
assets/css/shop.css, assets/js/shop.js     shop look and behaviour
portal/                                    portal pages, portal.css, portal.js
api/shop/[action].js                       public: pieces, enquiry, contact, config
api/admin/[action].js                      portal: login, pieces, photos, messages, settings
api/checkout.js, api/stripe-webhook.js     sales code, switched off
api/_lib/                                  database, email, Stripe, auth helpers
supabase/migrations/                       0001 schema + RLS, 0002 storage, 0003 placeholder seed
data/demo.json                             placeholder data for a preview with no database
images/placeholders/                       labelled placeholder images
src/                                       page layout and page bodies; run `npm run build:pages`
tests/                                     local mocks + full test suite (`npm test`)
tools/                                     page builder, webhook redirect check
```

## Setup, in order

1. **Install.** `npm install` (Node 20 or newer).
2. **Supabase.** Blue's shop lives in the shared "BarkerDigtial Clientside" project (with Brioche and Cleanway). Run `supabase/migrations/0001`, `0002` and `0003` in its SQL Editor, in order. Everything is prefixed `bl_` (bucket `blue-logan-images`), so nothing of the other clients is touched. Safe to run twice.
3. **Portal login.** One admin login, not Supabase Auth. Set `PORTAL_USERNAME`, `PORTAL_PASSWORD` and `SESSION_SECRET` (32+ random characters) in Vercel. The password is never in the code.
4. **Vercel.** Create a new project from this folder (Framework: Other). Add every variable from `.env.example` in Settings > Environment Variables. Set `SITE_URL` to the exact final address of the shop (the one that does not redirect).
5. **Resend.** Verify the sender domain, set `EMAIL_FROM` on that domain, `EMAIL_REPLY_TO` to Blue's inbox, then `EMAILS_ENABLED=true`.
6. **PostHog (optional).** Set `POSTHOG_KEY`, then `POSTHOG_ENABLED=true`. Nothing is tracked until a visitor presses Accept.
7. **In the portal:** upload the main picture (Settings), add the pieces and click where each one sits on the main picture, then write the shop name and intro.
8. **Only if sales are ever switched on:** add Stripe keys, register `${SITE_URL}/api/stripe-webhook` in Stripe (events `checkout.session.completed` and `checkout.session.async_payment_succeeded`), and run `SITE_URL=https://your-shop-domain npm run check:webhook`. It must say OK; a redirect is what broke the Hepple webhook.

## Run locally

```
cp .env.example .env.local      # fill in test keys
npx vercel dev                  # shop on http://localhost:3000/shop, portal on /portal
```

Without Supabase keys the shop runs as a design preview with the placeholder pieces from `data/demo.json`; forms and the portal stay off and a small banner says so.

## Tests

`npm test` runs everything against local stand-ins (real Postgres via PGlite running the real migrations and RLS, plus mock Stripe and Resend), so no keys are needed:

- API: public data never includes prices or stock, points on the main picture, enquiries and contact (saved, emailed, validated, honeypot), row level security, portal login (wrong details refused, forged cookies refused, HttpOnly signed cookie), every portal page locked without login, adding a piece (photo upload, outside image links dropped, always enquiry, sold, point clamped to the picture), hidden pieces never public, reorder, settings. Plus the switched-off sales code: server pricing, Stripe session, signed and idempotent webhook, forged webhook, missing address, stock, refunds.
- Browser journey (Playwright, 390px): shop, clicking a point opens the piece, enquiry, contact, portal login, add a piece and place it on the main picture, hide it, edit the shop name and intro, log out.
- Screen widths: every page at 360, 390, 768 and 1440px for wrapping and sideways overflow.

Python 3 with Playwright (`pip install playwright && playwright install chromium`) is needed for the browser parts.

## Editing pages

The header and footer are shared. Edit `src/layout.html` or a body in `src/pages/`, then run `npm run build:pages` and commit the generated `.html` files.

## Rules kept in this build

- "Shop all" is visible at the top of every page. Every clickable part of the shopfront is also reachable from the menu and category links. No intro animation.
- Photos sit on a paper mount and are never cropped, skewed or warped; very large uploads are only scaled down.
- The shop name and page titles stay on one line at every width.
- Separate pages, no one-page anchor navigation.
- Copy: no em dashes, plain words.

## TODO for Blue or Zach

- Blue: the shopfront illustration (computer and phone versions), to `ILLUSTRATION_FRAMEWORK.md`.
- Blue: his handwriting as a font, his shop name lettering, a drawn basket icon.
- Blue: real products, descriptions and prices (current prices are placeholders), and the delivery and returns wording.
- Zach: final domain (`SITE_URL`), main site address (`MAIN_SITE_URL`), Stripe account and live keys, Resend sender domain.
