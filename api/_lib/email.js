// =============================================================
//  Transactional email via Resend (same approach as Hepple: plain
//  fetch, no SDK, off unless EMAILS_ENABLED=true).
//
//  TODO(Zach): verify the sender domain in Resend before launch and
//  set EMAIL_FROM to an address on it.
//  Designed by Barker Digital
// =============================================================

import { env } from './env.js';

const C = { ground: '#F7F1E6', ink: '#1E1B16', muted: '#6E665B', green: '#13A35A', line: '#E6DDCC' };

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const money = (pence) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format((Number(pence) || 0) / 100);

export async function sendEmail({ to, subject, html, replyTo }) {
  if (!env.emailsEnabled) return { skipped: 'emails-disabled' };
  if (!to) return { skipped: 'no-recipient' };
  try {
    const payload = { from: env.emailFrom, to: [to], subject, html };
    const rt = replyTo || env.emailReplyTo;
    if (rt) payload.reply_to = rt;
    const r = await fetch(`${env.resendApiBase}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) return { error: `resend ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}` };
    return { ok: true };
  } catch (err) {
    return { error: String(err && err.message || err) };
  }
}

function shell(inner, preheader) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blue Logan</title></head>
<body style="margin:0;padding:0;background:${C.ground};">
<span style="display:none;opacity:0;font-size:1px;color:${C.ground};">${esc(preheader || '')}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ground};"><tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:2px solid ${C.ink};font-family:Helvetica,Arial,sans-serif;color:${C.ink};">
<tr><td style="padding:20px 28px;border-bottom:2px solid ${C.ink};background:${C.green};">
<div style="font-size:20px;font-weight:800;letter-spacing:.06em;color:#ffffff;white-space:nowrap;">BLUE LOGAN</div></td></tr>
${inner}
<tr><td style="padding:18px 28px;background:${C.ground};color:${C.muted};font-size:12px;line-height:1.6;">Blue Logan. Prints, lampshades and original pieces, made in small numbers.</td></tr>
</table></td></tr></table></body></html>`;
}

const block = (html) => `<tr><td style="padding:18px 28px 0;font-size:15px;line-height:1.6;">${html}</td></tr>`;
const label = (t) => `<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${C.muted};margin-bottom:6px;">${esc(t)}</div>`;

function itemsTable(order) {
  const rows = (order.items || []).map((it) => `<tr>
<td style="padding:8px 0;border-bottom:1px solid ${C.line};font-size:14px;">${esc(it.qty)} x ${esc(it.title)}${it.variant_label ? `, ${esc(it.variant_label)}` : ''}</td>
<td style="padding:8px 0;border-bottom:1px solid ${C.line};font-size:14px;text-align:right;white-space:nowrap;">${money(it.line_pence)}</td></tr>`).join('');
  const discount = order.discount_pence
    ? `<tr><td style="padding:8px 0 0;font-size:14px;color:${C.muted};">Discount${order.discount_code ? ` (${esc(order.discount_code)})` : ''}</td><td style="padding:8px 0 0;font-size:14px;text-align:right;">included above</td></tr>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}${discount}
<tr><td style="padding:8px 0 0;font-size:14px;color:${C.muted};">Delivery</td><td style="padding:8px 0 0;font-size:14px;text-align:right;">${order.shipping_pence ? money(order.shipping_pence) : 'Free'}</td></tr>
<tr><td style="padding:6px 0 0;font-size:16px;font-weight:700;">Total</td><td style="padding:6px 0 0;font-size:16px;font-weight:700;text-align:right;">${money(order.total_pence)}</td></tr></table>`;
}

export function addressHtml(a) {
  if (!a) return '';
  return [a.name, a.line1, a.line2, a.city, a.state, a.postal_code, a.country].filter(Boolean).map(esc).join('<br>');
}

export function sendOrderConfirmation(order) {
  const first = (order.customer_name || '').split(' ')[0];
  const addr = addressHtml(order.shipping_address);
  const inner =
    block(`<div style="font-size:19px;font-weight:700;">Thank you${first ? `, ${esc(first)}` : ''}. Your order is confirmed.</div>
<div style="margin-top:6px;color:${C.muted};">Order number ${esc(order.id)}. We will email you again with tracking details once it has been sent.</div>`) +
    block(itemsTable(order)) +
    block(`${label('Delivering to')}${addr || `<span style="color:#B3261E;">We do not have a delivery address for this order. We will be in touch.</span>`}`) +
    block(`<div style="padding-bottom:22px;color:${C.muted};font-size:13px;">If anything looks wrong, simply reply to this email.</div>`);
  return sendEmail({ to: order.customer_email, subject: `Your Blue Logan order ${order.id} is confirmed`, html: shell(inner, 'Your order is confirmed.') });
}

export function sendNewOrderAlert(order, portalUrl) {
  const addr = addressHtml(order.shipping_address);
  const inner =
    block(`<div style="font-size:19px;font-weight:700;">New order ${esc(order.id)}</div>
<div style="margin-top:6px;">${esc(order.customer_name || '')} ${order.customer_email ? `(${esc(order.customer_email)})` : ''}</div>`) +
    block(itemsTable(order)) +
    block(`${label('Send to')}${addr || '<b style="color:#B3261E;">No address on this order. Check Stripe before sending.</b>'}`) +
    block(`<div style="padding-bottom:22px;"><a href="${esc(portalUrl)}" style="display:inline-block;background:${C.ink};color:#fff;padding:12px 18px;text-decoration:none;font-weight:700;">Open the order</a></div>`);
  return sendEmail({ to: env.adminEmail, subject: `New order ${order.id}: ${money(order.total_pence)}`, html: shell(inner, 'You have a new order.') });
}

export function sendShippedEmail(order) {
  const first = (order.customer_name || '').split(' ')[0];
  const inner =
    block(`<div style="font-size:19px;font-weight:700;">Your order is on its way${first ? `, ${esc(first)}` : ''}.</div>
<div style="margin-top:6px;color:${C.muted};">Order number ${esc(order.id)} has been sent.</div>`) +
    block(`${label('Tracking number')}<div style="font-size:18px;font-weight:700;letter-spacing:.04em;">${esc(order.tracking_number)}</div>
${order.tracking_carrier ? `<div style="color:${C.muted};margin-top:4px;">Sent with ${esc(order.tracking_carrier)}</div>` : ''}`) +
    block(itemsTable(order)) +
    block(`<div style="padding-bottom:22px;color:${C.muted};font-size:13px;">If you have any questions about your delivery, reply to this email.</div>`);
  return sendEmail({ to: order.customer_email, subject: `Your Blue Logan order ${order.id} has been sent`, html: shell(inner, 'Your order is on its way.') });
}

export function sendEnquiryAlert(enq, productTitle) {
  const inner =
    block(`<div style="font-size:19px;font-weight:700;">${productTitle ? `Enquiry about ${esc(productTitle)}` : 'New message from the shop'}</div>`) +
    block(`${label('From')}${esc(enq.name)} (${esc(enq.email)})`) +
    block(`${label('Message')}<div style="white-space:pre-wrap;padding-bottom:22px;">${esc(enq.message)}</div>`);
  return sendEmail({
    to: env.adminEmail,
    subject: productTitle ? `Shop enquiry: ${productTitle}` : `Shop message from ${enq.name}`,
    html: shell(inner, 'New message from the shop.'),
    replyTo: enq.email,
  });
}
