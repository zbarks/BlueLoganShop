// =============================================================
//  POST /api/stripe-webhook
//
//  Register in Stripe as:  ${SITE_URL}/api/stripe-webhook
//  It MUST be the final canonical URL. Stripe does not follow redirects,
//  and a 308 (apex to www, http to https, trailing slash) was the cause of
//  the Hepple webhook failures. Run `npm run check:webhook` to confirm.
//
//  Events: checkout.session.completed, checkout.session.async_payment_succeeded
//
//  Steps:
//   1. Verify the Stripe signature against the raw body.
//   2. create_order() in one database transaction: insert keyed on the
//      session id, and reduce stock only if the order is new. A repeated
//      event therefore never creates a second order or double-counts stock.
//   3. Only for a new order: confirmation email to the customer, new order
//      alert to Blue, PostHog event. Each email is claimed once.
//
//  If the database write fails we return 500 so Stripe retries later
//  (safe, because step 2 is idempotent). Hepple returned 200 here, which
//  could lose an order on a database blip.
//  Designed by Barker Digital
// =============================================================

import { env } from './_lib/env.js';
import { json, readRawBody, methodNotAllowed } from './_lib/http.js';
import { stripe, extractShippingAddress } from './_lib/stripe.js';
import { createOrder, getOrder, claimEmail } from './_lib/db.js';
import { sendOrderConfirmation, sendNewOrderAlert } from './_lib/email.js';
import { capturePostHog } from './_lib/extras.js';

export const config = { api: { bodyParser: false } };

export function buildOrderPayload(s, lineItems) {
  const md = s.metadata || {};
  const items = lineItems.map((l) => {
    const prod = l.price && typeof l.price.product === 'object' ? l.price.product : null;
    const meta = (prod && prod.metadata) || {};
    return {
      product_id: meta.product_id || null,
      variant_id: meta.variant_id || null,
      title: meta.title || l.description || (prod && prod.name) || 'Item',
      variant_label: meta.variant_label || null,
      qty: l.quantity || 1,
      unit_pence: l.price && l.price.unit_amount != null ? l.price.unit_amount : Math.round((l.amount_total || 0) / (l.quantity || 1)),
      line_pence: l.amount_total || 0,
    };
  });
  const cd = s.customer_details || {};
  return {
    stripe_session_id: s.id,
    stripe_payment_intent: typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent && s.payment_intent.id) || null,
    customer_email: cd.email || s.customer_email || null,
    customer_name: cd.name || null,
    customer_phone: cd.phone || null,
    shipping_address: extractShippingAddress(s),
    items,
    subtotal_pence: parseInt(md.subtotal_before_pence, 10) || s.amount_subtotal || 0,
    discount_code: md.discount_code || null,
    discount_pence: parseInt(md.discount_pence, 10) || (s.total_details && s.total_details.amount_discount) || 0,
    shipping_pence: (s.total_details && s.total_details.amount_shipping) || 0,
    total_pence: s.amount_total || 0,
    currency: (s.currency || 'gbp').toLowerCase(),
    posthog_distinct_id: md.ph_id || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

  const s = stripe();
  if (!s || !env.stripeWebhookSecret) return json(res, 500, { error: 'Webhook not configured.' });

  const raw = await readRawBody(req);
  let event;
  try {
    event = s.webhooks.constructEvent(raw, req.headers['stripe-signature'], env.stripeWebhookSecret);
  } catch (err) {
    console.error('[webhook] signature check failed:', err && err.message);
    return json(res, 400, { error: 'Invalid signature' });
  }

  const isCompleted = event.type === 'checkout.session.completed';
  const isAsyncPaid = event.type === 'checkout.session.async_payment_succeeded';
  if (!isCompleted && !isAsyncPaid) return json(res, 200, { received: true, ignored: event.type });

  const session = event.data.object;
  // Delayed payment methods complete as "unpaid" first; the order is created
  // when async_payment_succeeded arrives instead.
  if (isCompleted && session.payment_status !== 'paid') return json(res, 200, { received: true, pending: true });

  let orderId; let isNew;
  try {
    const li = await s.checkout.sessions.listLineItems(session.id, { limit: 100, expand: ['data.price.product'] });
    ({ orderId, isNew } = await createOrder(buildOrderPayload(session, li.data)));
  } catch (err) {
    console.error('[webhook] could not record order:', err && err.message, err && err.detail);
    return json(res, 500, { error: 'Could not record order. Stripe will retry.' });
  }

  if (!isNew) return json(res, 200, { received: true, duplicate: true, order_id: orderId });

  // Side effects only for a brand new order. Failures are logged, not retried,
  // so a Resend outage can never cause a duplicate order.
  try {
    const order = await getOrder(orderId);
    const portalUrl = `${env.siteUrl}/portal/orders/${orderId}`;
    const jobs = [
      sendNewOrderAlert(order, portalUrl),
      capturePostHog('order_completed', order.posthog_distinct_id || order.customer_email || session.id, {
        $insert_id: session.id, revenue: order.total_pence / 100, currency: 'GBP',
        item_count: order.items.reduce((n, i) => n + i.qty, 0), order_id: orderId, source: 'stripe-webhook',
      }),
    ];
    if (order.customer_email && env.emailsEnabled && await claimEmail(orderId, 'confirmation_email_sent_at')) {
      jobs.push(sendOrderConfirmation(order));
    }
    const results = await Promise.allSettled(jobs);
    results.forEach((r) => {
      const v = r.status === 'fulfilled' ? r.value : { error: r.reason && r.reason.message };
      if (v && v.error) console.error('[webhook] side effect failed:', v.error);
    });
  } catch (err) {
    console.error('[webhook] after-order step failed:', err && err.message);
  }

  return json(res, 200, { received: true, order_id: orderId });
}
