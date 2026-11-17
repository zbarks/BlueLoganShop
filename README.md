# Blue Logan Shop and Portal

The shop (customer side) and the portal (Blue's side) for Blue Logan. **Enquiry only: no prices, no basket.** Each piece has its own page with an enquiry form. The top of the shop is one main picture with clickable points; each point opens a piece. The look follows Blue's own site: white, small spaced capitals, nothing loud.

The shop name, the intro line, the main picture, titles, descriptions and photos are all placeholders for Blue to supply, and he can change every one of them in the portal. The "Blue Logan" menu link points at `MAIN_SITE_URL` (the main site is still to be built).

Sales code (Stripe Checkout, webhook, orders, refunds, discount codes) is kept in `api/` and tested, but nothing on the shop or in the portal uses it. It is there in case Blue ever wants to sell directly.

Designed and built by Barker Digital. Same stack and patterns as the Hepple site (see `HEPPLE_PATTERNS.md`).

## Stack

- Plain HTML, CSS and JS. No framework, no build step on Vercel.
- Vercel functions in `/api` (Node 20+, ES modules). Helpers live in `api/_lib/` and are not routed.
- `middleware.js` keeps every `/portal` page behind login.
- Stripe Checkout (hosted), GBP, UK only: built and tested, switched off.
- Supabase: Postgres with row level security, Auth for the one admin login, Storage for product photos.
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
2. **Supabase.** Create a NEW project for Blue (never use or change Hepple's). In SQL Editor, run the three files in `supabase/migrations/` in order. Every file is safe to run twice.
3. **Admin login.** Supabase > Authentication > Users > Add user, with Blue's email and a password. Then Authentication > Sign In / Providers: turn OFF "Allow new users to sign up". Put the same email in `ADMIN_EMAIL`. Only that email can open the portal.
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

- API: public data never includes prices or stock, points on the main picture, enquiries and contact (saved, emailed, validated, honeypot), row level security, portal login (only the admin email, HttpOnly cookies, refresh), every portal page locked without login, adding a piece (photo upload, outside image links dropped, always enquiry, sold, point clamped to the picture), hidden pieces never public, reorder, settings. Plus the switched-off sales code: server pricing, Stripe session, signed and idempotent webhook, forged webhook, missing address, stock, refunds.
- Browser journey (Playwright, 390px): shop, clicking a point opens the piece, enquiry, contact, portal login, add a piece and place it on the main picture, hide it, edit the shop name and intro, log out.
- Screen widths: every page at 360, 390, 768 and 1440px for wrapping and sideways overflow.

Python 3 with Playwright (`pip install playwright && playwright install chromium`) is needed for the browser parts.

## Editing pages

The header and footer are shared. Edit `src/layout.html` or a body in `src/pages/`, then run `npm run build:pages` and commit the generated `.html` files.

## Rules kept in this build

- Enquiry only. No prices anywhere.
- No icons or drawings in placeholder images: plain grey with "Image to come".
- The shop name stays on one line at every width (it scales down to fit).
- Separate pages, no one-page anchor navigation. The menu (Shop, Contact, Blue Logan) is on every page.
- Copy: no em dashes, plain words.
- Photos are uploaded as they are. Very large files are scaled down in proportion; nothing is cropped, skewed or warped.

## TODO for Blue or Zach

- Shop name or lettering (Blue). Placeholder: "Blue Logan Shop" in small capitals.
- Intro line under the main picture (Blue). Placeholder until written.
- The main picture (Blue), then a point placed for each piece.
- Real pieces: titles, descriptions, photos (from Blue's shared album, not bluelogan.net).
- Blue's font, if he has one, to replace Helvetica.
- Final shop domain (`SITE_URL`) and the main site address (`MAIN_SITE_URL`).
- Resend sender domain verification.
