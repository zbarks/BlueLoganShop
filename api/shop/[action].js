// =============================================================
//  Public shop API. One function, several small actions, to stay well
//  inside Vercel's function limits.
//
//   GET  /api/shop/config            public config for the browser
//   GET  /api/shop/products          published products (+ variants)
//   GET  /api/shop/product?slug=     one published product
//   POST /api/shop/quote             price a basket (sales are off; kept for later)
//   GET  /api/shop/order?session_id= order confirmation (sales are off; kept for later)
//   POST /api/shop/enquiry           product enquiry form
//   POST /api/shop/contact           contact form
//  Designed by Barker Digital
// =============================================================

import { env } from '../_lib/env.js';
import { json, readJson, methodNotAllowed, queryOf, clampText, isEmail } from '../_lib/http.js';
import { publicProducts, publicProduct, publicSettings, insertEnquiry, isDemo } from '../_lib/db.js';
import { priceBasket } from '../_lib/basket.js';
import { sendEnquiryAlert } from '../_lib/email.js';
import { stripe } from '../_lib/stripe.js';

// Fields the public is allowed to see. The shop is enquiry only, so no
// prices or stock numbers leave the server; a piece is just "sold" or not.
const point = (h) => (h && Number.isFinite(+h.x) && Number.isFinite(+h.y) ? { x: +h.x, y: +h.y } : null);
const publicView = (p) => ({
  id: p.id, slug: p.slug, title: p.title, description: p.description,
  images: p.images || [], sold: p.stock === 0, hotspot: point(p.hotspot),
});
const shopText = (s) => ({ shop_title: s.shop_title || '', intro_text: s.intro_text || '', hero_image: s.hero_image || '' });

async function handleForm(req, res, source) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  const b = await readJson(req);
  if (b.website) return json(res, 200, { ok: true });           // honeypot: bots fill hidden fields
  const row = {
    source,
    name: clampText(b.name, 120),
    email: clampText(b.email, 200),
    message: clampText(b.message, 4000),
    product_id: source === 'product' && typeof b.product_id === 'string' ? b.product_id.slice(0, 64) : null,
  };
  const errors = {};
  if (!row.name) errors.name = 'Please enter your name.';
  if (!isEmail(row.email)) errors.email = 'Please enter a valid email address.';
  if (row.message.length < 2) errors.message = 'Please enter a message.';
  if (Object.keys(errors).length) return json(res, 400, { error: 'Please check the form.', errors });
  if (isDemo()) return json(res, 503, { error: 'Messages are not switched on for this preview yet.' });

  let productTitle = null;
  if (row.product_id) {
    const all = await publicProducts();
    const p = all.find((x) => x.id === row.product_id);
    if (!p) row.product_id = null; else productTitle = p.title;
  }
  try {
    const saved = await insertEnquiry(row);
    const r = await sendEnquiryAlert(saved, productTitle);
    if (r && r.error) console.error('[enquiry] email failed:', r.error);
    return json(res, 200, { ok: true });
  } catch (e) {
    console.error('[enquiry] save failed:', e.message, e.detail || '');
    return json(res, 502, { error: 'Your message could not be sent just now. Please try again.' });
  }
}

export default async function handler(req, res) {
  const { action, ...q } = queryOf(req);
  try {
    switch (action) {
      case 'config':
        res.setHeader('Cache-Control', 'public, max-age=300');
        return json(res, 200, {
          mainSiteUrl: env.mainSiteUrl,
          posthog: env.posthogEnabled ? { key: env.posthogKey, host: env.posthogHost } : null,
          demo: isDemo(),
        });

      case 'products': {
        const [products, settings] = await Promise.all([publicProducts(), publicSettings()]);
        return json(res, 200, { products: products.filter((p) => p.is_published !== false).map(publicView), ...shopText(settings) });
      }

      case 'product': {
        const slug = String(q.slug || '').slice(0, 120);
        const p = slug && await publicProduct(slug);
        if (!p || p.is_published === false) return json(res, 404, { error: 'Not found' });
        const settings = await publicSettings();
        return json(res, 200, { product: publicView(p), ...shopText(settings) });
      }

      case 'quote': {
        if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
        const b = await readJson(req);
        return json(res, 200, await priceBasket(b.items, b.discount_code));
      }

      case 'order': {
        // Only reveals the order number and first name, and only to someone
        // holding the Stripe session id from the redirect.
        const sid = String(q.session_id || '');
        const s = stripe();
        if (!/^cs_[A-Za-z0-9_]+$/.test(sid) || !s) return json(res, 200, { found: false });
        try {
          const session = await s.checkout.sessions.retrieve(sid);
          return json(res, 200, {
            found: true,
            paid: session.payment_status === 'paid',
            first_name: ((session.customer_details && session.customer_details.name) || '').split(' ')[0],
            email: (session.customer_details && session.customer_details.email) || null,
          });
        } catch { return json(res, 200, { found: false }); }
      }

      case 'enquiry': return handleForm(req, res, 'product');
      case 'contact': return handleForm(req, res, 'contact');

      default: return json(res, 404, { error: 'Not found' });
    }
  } catch (e) {
    console.error(`[shop/${action}]`, e.message, e.detail || '');
    return json(res, 502, { error: 'Something went wrong. Please try again.' });
  }
}
