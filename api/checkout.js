// =============================================================
//  POST /api/checkout
//  Builds a Stripe Checkout Session from the basket and returns its URL.
//
//  Request:  { items: [{ product_id, variant_id, qty }], discount_code, ph_id }
//  Response: { url } or { error, problems }
//
//  Prices are re-read from the database. Anything the browser says about
//  price is ignored. UK delivery only. GBP.
//  Designed by Barker Digital
// =============================================================

import { env } from './_lib/env.js';
import { json, readJson, methodNotAllowed } from './_lib/http.js';
import { stripe } from './_lib/stripe.js';
import { priceBasket } from './_lib/basket.js';
import { isDemo } from './_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

  const s = stripe();
  if (!s || isDemo()) {
    return json(res, 503, { error: 'Payments are not switched on for this preview yet.' });
  }
  if (!env.siteUrl) {
    // Hepple's security review: never build redirect URLs from the Host header.
    return json(res, 500, { error: 'The shop is not fully set up yet (SITE_URL missing).' });
  }

  const body = await readJson(req);
  let quote;
  try {
    quote = await priceBasket(body.items, body.discount_code);
  } catch (e) {
    console.error('[checkout] pricing failed:', e.message, e.detail || '');
    return json(res, 502, { error: 'We could not check your basket just now. Please try again.' });
  }

  if (!quote.shop_open) return json(res, 409, { error: 'The shop is closed at the moment. Please check back soon.' });
  // Any change (sold out, stock reduced, unavailable) goes back to the basket
  // so the customer sees it before paying, rather than being silently changed.
  if (quote.problems.length) return json(res, 409, { error: 'Your basket needs a quick check.', problems: quote.problems });
  if (!quote.lines.length) return json(res, 400, { error: 'Your basket is empty.' });

  const phId = typeof body.ph_id === 'string' ? body.ph_id.slice(0, 120) : '';
  const abs = (u) => (u && /^https:\/\//.test(u) ? u : u && env.siteUrl.startsWith('https://') ? env.siteUrl + u : null);

  const line_items = quote.lines.map((l) => {
    const img = abs(l.image);
    return {
      quantity: l.qty,
      price_data: {
        currency: 'gbp',
        unit_amount: l.charged_unit_pence,
        product_data: {
          name: l.variant_label ? `${l.title}, ${l.variant_label}` : l.title,
          // Stripe cannot show SVG placeholders; only real photos are passed.
          ...(img && !/\.svg$/i.test(img) ? { images: [img] } : {}),
          metadata: { product_id: l.product_id, variant_id: l.variant_id || '', title: l.title.slice(0, 200), variant_label: l.variant_label || '' },
        },
      },
    };
  });

  const params = {
    mode: 'payment',
    line_items,
    shipping_address_collection: { allowed_countries: ['GB'] },
    phone_number_collection: { enabled: true },
    shipping_options: [{
      shipping_rate_data: {
        type: 'fixed_amount',
        display_name: quote.shipping_pence ? 'UK delivery' : 'UK delivery (free)',
        fixed_amount: { amount: quote.shipping_pence, currency: 'gbp' },
      },
    }],
    success_url: `${env.siteUrl}/order/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.siteUrl}/basket`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    metadata: {
      source: 'blue-logan-shop',
      discount_code: quote.discount ? quote.discount.code : '',
      discount_pence: String(quote.discount_pence),
      subtotal_before_pence: String(quote.subtotal_pence),
      ph_id: phId,
    },
  };

  try {
    const session = await s.checkout.sessions.create(params);
    return json(res, 200, { url: session.url });
  } catch (err) {
    console.error('[checkout] Stripe error:', err && err.message);
    return json(res, 502, { error: 'We could not start the payment page. Please try again.' });
  }
}
