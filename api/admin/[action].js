// =============================================================
//  Portal API. Everything except login/refresh/logout/status requires
//  the admin session cookie (see _lib/auth.js).
//  Designed by Barker Digital
// =============================================================

import { randomUUID } from 'node:crypto';
import { env } from '../_lib/env.js';
import { json, readJson, methodNotAllowed, queryOf, clampText } from '../_lib/http.js';
import {
  userFromToken, passwordGrant, refreshGrant, setSessionCookies, clearSessionCookies, accessToken, refreshToken,
} from '../_lib/auth.js';
import * as db from '../_lib/db.js';
import { stripe } from '../_lib/stripe.js';
import { sendShippedEmail } from '../_lib/email.js';
import { createLabel } from '../_lib/extras.js';

export const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

function validImage(u) {
  if (typeof u !== 'string' || u.length > 500) return false;
  if (u.startsWith('/images/')) return true;
  return !!env.supabaseUrl && u.startsWith(`${env.supabaseUrl}/storage/v1/object/public/${db.BUCKET}/`);
}

// The shop is enquiry only: no price, no stock count. A piece is either
// available or sold (stock 0). Mode is always "enquire".
function cleanHotspot(h) {
  if (!h || h.x === undefined || h.y === undefined) return null;
  const x = Number(h.x), y = Number(h.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const c = (n) => Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;
  return { x: c(x), y: c(y) };
}

function cleanProduct(b) {
  const errors = {};
  const row = {
    title: clampText(b.title, 120),
    description: clampText(b.description, 5000),
    mode: 'enquire',
    price_pence: null,
    stock: b.sold ? 0 : null,
    images: Array.isArray(b.images) ? b.images.filter(validImage).slice(0, 8) : [],
    is_published: !!b.is_published,
    hotspot: cleanHotspot(b.hotspot),
  };
  row.slug = slugify(b.slug || row.title);
  if (!row.title) errors.title = 'Please give the piece a name.';
  if (!row.slug) errors.slug = 'The web address needs at least one letter or number.';
  if (row.is_published && !row.images.length) errors.images = 'Add at least one photo before showing it in the shop.';
  return { row, variants: [], errors };
}

async function requireAdmin(req, res) {
  if (!env.dbConfigured) { json(res, 503, { error: 'The portal is not connected to its database yet.' }); return null; }
  const user = await userFromToken(accessToken(req));
  if (!user) { json(res, 401, { error: 'Please log in again.' }); return null; }
  return user;
}

export default async function handler(req, res) {
  const { action, ...q } = queryOf(req);
  const post = req.method === 'POST';

  try {
    // ---------- no session needed ----------
    if (action === 'status') return json(res, 200, { configured: env.dbConfigured });

    if (action === 'login') {
      if (!post) return methodNotAllowed(res, 'POST');
      if (!env.dbConfigured) return json(res, 503, { error: 'The portal is not connected to its database yet.' });
      const b = await readJson(req);
      const email = clampText(b.email, 200).toLowerCase();
      const session = email ? await passwordGrant(email, String(b.password || '').slice(0, 200)) : null;
      // Right password but not a Blue Logan portal member (e.g. another client's login): same answer.
      if (!session || !(await userFromToken(session.access_token))) return json(res, 401, { error: 'That email and password did not match.' });
      setSessionCookies(res, session);
      return json(res, 200, { ok: true });
    }

    if (action === 'refresh') {
      if (!post) return methodNotAllowed(res, 'POST');
      const rt = refreshToken(req);
      const session = rt && env.dbConfigured ? await refreshGrant(rt) : null;
      if (!session || !(await userFromToken(session.access_token))) { clearSessionCookies(res); return json(res, 401, { error: 'Please log in.' }); }
      setSessionCookies(res, session);
      return json(res, 200, { ok: true });
    }

    if (action === 'logout') { clearSessionCookies(res); return json(res, 200, { ok: true }); }

    // ---------- everything below needs the admin ----------
    const user = await requireAdmin(req, res);
    if (!user) return;

    switch (action) {
      case 'me': return json(res, 200, { email: user.email });

      case 'home': return json(res, 200, { ...(await db.counts()), webhookUrl: `${env.siteUrl}/api/stripe-webhook` });

      // ----- products -----
      case 'products': return json(res, 200, { products: await db.allProducts() });

      case 'product': {
        const p = await db.getProduct(String(q.id || ''));
        return p ? json(res, 200, { product: p }) : json(res, 404, { error: 'Product not found.' });
      }

      case 'product-save': {
        if (!post) return methodNotAllowed(res, 'POST');
        const b = await readJson(req);
        const { row, variants, errors } = cleanProduct(b);
        if (Object.keys(errors).length) return json(res, 400, { error: 'Please check the highlighted fields.', errors });
        let saved;
        try {
          if (b.id) saved = await db.updateProduct(String(b.id), row);
          else saved = await db.insertProduct({ ...row, currency: 'gbp', sort_order: (await db.maxSortOrder()) + 10 });
        } catch (e) {
          if (e.status === 409 || /duplicate|unique/i.test(e.detail || '')) {
            return json(res, 409, { error: 'Another product already uses that web address.', errors: { slug: 'Already in use. Try a different one.' } });
          }
          throw e;
        }
        if (!saved) return json(res, 404, { error: 'Product not found.' });
        await db.replaceVariants(saved.id, variants);
        return json(res, 200, { product: await db.getProduct(saved.id) });
      }

      case 'product-publish': {
        if (!post) return methodNotAllowed(res, 'POST');
        const b = await readJson(req);
        const p = await db.getProduct(String(b.id || ''));
        if (!p) return json(res, 404, { error: 'Product not found.' });
        if (b.is_published && !p.images.length) return json(res, 400, { error: 'Add at least one photo before publishing.' });
        return json(res, 200, { product: await db.updateProduct(p.id, { is_published: !!b.is_published }) });
      }

      case 'product-reorder': {
        if (!post) return methodNotAllowed(res, 'POST');
        const b = await readJson(req);
        const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x) => typeof x === 'string').slice(0, 500);
        await db.setProductOrder(ids);
        return json(res, 200, { ok: true });
      }

      case 'upload-url': {
        if (!post) return methodNotAllowed(res, 'POST');
        const b = await readJson(req);
        const types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
        const ext = types[b.content_type];
        if (!ext) return json(res, 400, { error: 'Please use a JPG, PNG or WebP photo.' });
        const path = `${new Date().getFullYear()}/${randomUUID()}.${ext}`;
        return json(res, 200, await db.signedUpload(path));
      }

      // ----- orders -----
      case 'orders': return json(res, 200, { orders: await db.listOrders(q.status) });

      case 'order': {
        const o = await db.getOrder(q.id);
        return o ? json(res, 200, { order: o }) : json(res, 404, { error: 'Order not found.' });
      }

      case 'order-ship': {
        if (!post) return methodNotAllowed(res, 'POST');
        const b = await readJson(req);
        const o = await db.getOrder(b.id);
        if (!o) return json(res, 404, { error: 'Order not found.' });
        if (o.status === 'refunded') return json(res, 409, { error: 'This order has been refunded.' });

        // Later phase: automatic label. Falls back to the number Blue typed.
        const label = await createLabel(o);
        const tracking = (label && label.tracking_number) || clampText(b.tracking_number, 60);
        const carrier = (label && label.carrier) || clampText(b.carrier, 40) || null;
        if (!tracking) return json(res, 400, { error: 'Please enter the tracking number.', errors: { tracking_number: 'Required' } });

        const updated = await db.updateOrder(o.id, {
          status: 'shipped', tracking_number: tracking, tracking_carrier: carrier,
          shipped_at: o.shipped_at || new Date().toISOString(),
        });
        let emailed = false; let emailError = null;
        if (updated.customer_email && env.emailsEnabled && await db.claimEmail(o.id, 'shipped_email_sent_at')) {
          const r = await sendShippedEmail(updated);
          emailed = !!(r && r.ok);
          if (r && r.error) emailError = r.error;
        }
        return json(res, 200, { order: await db.getOrder(o.id), emailed, alreadyEmailed: !!o.shipped_email_sent_at, emailError });
      }

      case 'order-refund': {
        if (!post) return methodNotAllowed(res, 'POST');
        const b = await readJson(req);
        const o = await db.getOrder(b.id);
        if (!o) return json(res, 404, { error: 'Order not found.' });
        if (o.status === 'refunded') return json(res, 409, { error: 'This order has already been refunded.' });
        if (!o.stripe_payment_intent) return json(res, 409, { error: 'No Stripe payment found on this order. Refund it in the Stripe dashboard.' });
        const s = stripe();
        if (!s) return json(res, 503, { error: 'Stripe is not set up.' });
        try {
          // Same approach as the Hepple portal: full refund of the payment intent.
          // The idempotency key means a double click can only refund once.
          await s.refunds.create({ payment_intent: o.stripe_payment_intent }, { idempotencyKey: `refund-order-${o.id}` });
        } catch (e) {
          if (!/already been refunded/i.test(e.message || '')) {
            console.error('[refund]', e.message);
            return json(res, 502, { error: `Stripe did not accept the refund: ${e.message}` });
          }
        }
        return json(res, 200, { order: await db.updateOrder(o.id, { status: 'refunded', refunded_at: new Date().toISOString() }) });
      }

      // ----- enquiries -----
      case 'enquiries': {
        const [enquiries, products] = await Promise.all([db.listEnquiries(), db.allProducts()]);
        const titles = Object.fromEntries(products.map((p) => [p.id, p.title]));
        return json(res, 200, { enquiries: enquiries.map((e) => ({ ...e, product_title: titles[e.product_id] || null })) });
      }
      case 'enquiry-read': {
        if (!post) return methodNotAllowed(res, 'POST');
        const b = await readJson(req);
        await db.markEnquiryRead(b.id, b.is_read !== false);
        return json(res, 200, { ok: true });
      }

      // ----- settings + discount codes -----
      case 'settings': return json(res, 200, { settings: await db.allSettings(), discounts: await db.listDiscounts(), webhookUrl: `${env.siteUrl}/api/stripe-webhook` });

      case 'settings-save': {
        if (!post) return methodNotAllowed(res, 'POST');
        const b = await readJson(req);
        const hero = typeof b.hero_image === 'string' && (b.hero_image === '' || validImage(b.hero_image)) ? b.hero_image : null;
        if (hero === null) return json(res, 400, { error: 'That picture could not be used. Please upload it again.' });
        await db.saveSettings({
          shop_title: clampText(b.shop_title, 80),
          intro_text: clampText(b.intro_text, 600),
          hero_image: hero,
        });
        return json(res, 200, { settings: await db.allSettings() });
      }

      case 'discount-save': {
        if (!post) return methodNotAllowed(res, 'POST');
        const b = await readJson(req);
        const code = String(b.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30);
        const pct = Number(b.percent_off);
        if (!code) return json(res, 400, { error: 'Please enter a code, using letters and numbers.' });
        if (!Number.isInteger(pct) || pct < 1 || pct > 100) return json(res, 400, { error: 'The discount must be a whole number from 1 to 100.' });
        await db.upsertDiscount({ code, percent_off: pct, active: b.active !== false });
        return json(res, 200, { discounts: await db.listDiscounts() });
      }

      default: return json(res, 404, { error: 'Not found' });
    }
  } catch (e) {
    console.error(`[admin/${action}]`, e.message, e.detail || '');
    return json(res, 502, { error: 'Something went wrong. Please try again, and tell Zach if it keeps happening.' });
  }
}
