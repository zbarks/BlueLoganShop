// =============================================================
//  Price a basket from the database. Used by both the basket page
//  (to show totals) and checkout (to charge), so the two always agree.
//  The browser only ever sends { product_id, variant_id, qty }.
// =============================================================

import { productsForCheckout, findDiscount, publicSettings } from './db.js';

export const MAX_QTY = 20;

export async function priceBasket(rawItems, discountCode) {
  const items = (Array.isArray(rawItems) ? rawItems : []).slice(0, 50)
    .filter((it) => it && typeof it.product_id === 'string')
    .map((it) => ({
      product_id: it.product_id.slice(0, 64),
      variant_id: typeof it.variant_id === 'string' && it.variant_id ? it.variant_id.slice(0, 64) : null,
      qty: Math.max(1, Math.min(MAX_QTY, parseInt(it.qty, 10) || 1)),
    }));

  // Merge duplicate lines.
  const merged = new Map();
  for (const it of items) {
    const k = `${it.product_id}|${it.variant_id || ''}`;
    const prev = merged.get(k);
    merged.set(k, prev ? { ...prev, qty: Math.min(MAX_QTY, prev.qty + it.qty) } : it);
  }

  const [products, settings, discount] = await Promise.all([
    productsForCheckout([...new Set([...merged.values()].map((i) => i.product_id))]),
    publicSettings(),
    findDiscount(discountCode),
  ]);
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));

  const lines = [];
  const problems = [];
  for (const it of merged.values()) {
    const p = byId[it.product_id];
    if (!p) { problems.push({ ...it, reason: 'This item is no longer available.' }); continue; }
    if (p.mode !== 'buy') { problems.push({ ...it, reason: `${p.title} is available by enquiry only.` }); continue; }

    let v = null;
    if (p.variants.length) {
      v = p.variants.find((x) => x.id === it.variant_id);
      if (!v) { problems.push({ ...it, reason: `Please choose an option for ${p.title}.` }); continue; }
    }
    const stock = v ? v.stock : p.stock;
    if (stock === 0) { problems.push({ ...it, reason: `${p.title}${v ? `, ${v.label}` : ''} has sold out.` }); continue; }
    let qty = it.qty;
    if (stock != null && qty > stock) {
      problems.push({ ...it, reason: `Only ${stock} left of ${p.title}${v ? `, ${v.label}` : ''}. Your basket has been updated.`, adjusted_qty: stock });
      qty = stock;
    }
    const unit = v && v.price_pence != null ? v.price_pence : p.price_pence;
    if (unit == null) { problems.push({ ...it, reason: `${p.title} has no price set.` }); continue; }
    lines.push({
      product_id: p.id, variant_id: v ? v.id : null, qty,
      title: p.title, slug: p.slug, variant_label: v ? v.label : null,
      image: (p.images && p.images[0]) || null,
      unit_pence: unit,
    });
  }

  const pct = discount ? discount.percent_off : 0;
  let subtotal = 0; let discounted = 0;
  for (const l of lines) {
    l.charged_unit_pence = pct ? Math.round(l.unit_pence * (100 - pct) / 100) : l.unit_pence;
    l.line_pence = l.charged_unit_pence * l.qty;
    subtotal += l.unit_pence * l.qty;
    discounted += l.line_pence;
  }
  const fee = Number(settings.delivery_fee_pence) || 0;
  const freeOver = Number(settings.free_delivery_over_pence) || 0;
  const shipping = lines.length && !(freeOver > 0 && subtotal >= freeOver) ? fee : 0;

  return {
    lines, problems,
    discount: discount ? { code: discount.code, percent_off: discount.percent_off } : null,
    discount_rejected: !!(discountCode && String(discountCode).trim() && !discount),
    subtotal_pence: subtotal,
    discount_pence: subtotal - discounted,
    shipping_pence: shipping,
    total_pence: discounted + shipping,
    shop_open: settings.shop_open !== false,
    delivery_note: settings.delivery_note || '',
  };
}
