// =============================================================
//  Supabase access over its REST API (same raw-fetch style as Hepple).
//
//  Two keys:
//   - anon:    used for everything the public sees. Row level security
//              means it can only ever read published products, their
//              variants and the public settings, even if code here has
//              a bug.
//   - service: used for orders, enquiries, the portal and the webhook.
//              Server only. Never sent to the browser.
//
//  When Supabase is not configured (a design preview), the public reads
//  fall back to data/demo.json so the shop can still be reviewed.
//  Designed by Barker Digital
// =============================================================

import { readFile } from 'node:fs/promises';
import { env } from './env.js';

export const BUCKET = 'blue-logan-images';

export class DbError extends Error {
  constructor(msg, status, detail) { super(msg); this.status = status; this.detail = detail; }
}

async function rest(path, { method = 'GET', body, role = 'service', prefer } = {}) {
  if (!env.dbConfigured) throw new DbError('Database not configured', 503);
  const key = role === 'anon' ? env.supabaseAnon : env.supabaseService;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const resp = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) throw new DbError(`Supabase ${method} ${path.split('?')[0]} failed`, resp.status, text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

const enc = encodeURIComponent;
const inList = (ids) => `in.(${ids.map((x) => `"${String(x).replace(/"/g, '')}"`).join(',')})`;

// ---------- demo data (no database) ----------
let demoCache = null;
async function demo() {
  if (!demoCache) {
    const raw = await readFile(new URL('../../data/demo.json', import.meta.url), 'utf8');
    demoCache = JSON.parse(raw);
  }
  return demoCache;
}
export const isDemo = () => !env.dbConfigured;

function attachVariants(products, variants) {
  const by = {};
  for (const v of variants) (by[v.product_id] ||= []).push(v);
  for (const p of products) p.variants = (by[p.id] || []).sort((a, b) => a.sort_order - b.sort_order);
  return products;
}

// ---------- public reads (anon key, RLS enforced) ----------
export async function publicProducts() {
  if (isDemo()) { const d = await demo(); return attachVariants(structuredClone(d.products), d.variants); }
  const products = await rest('bl_products?select=*&order=sort_order.asc,created_at.asc', { role: 'anon' });
  if (!products.length) return [];
  const variants = await rest(`bl_product_variants?select=*&product_id=${inList(products.map((p) => p.id))}`, { role: 'anon' });
  return attachVariants(products, variants);
}

export async function publicProduct(slug) {
  if (isDemo()) return (await publicProducts()).find((p) => p.slug === slug) || null;
  const rows = await rest(`bl_products?select=*&slug=eq.${enc(slug)}&limit=1`, { role: 'anon' });
  if (!rows.length) return null;
  const variants = await rest(`bl_product_variants?select=*&product_id=eq.${rows[0].id}`, { role: 'anon' });
  return attachVariants(rows, variants)[0];
}

const SETTING_DEFAULTS = {
  shop_open: true,
  shop_title: 'Blue Logan Shop',   // TODO(Blue): placeholder, he will write this
  intro_text: '',                  // TODO(Blue): placeholder, he will write this
  hero_image: '',                  // main picture with the clickable points
  delivery_note: 'UK delivery only.',
  delivery_fee_pence: 500,          // TODO(Blue): real delivery charges
  free_delivery_over_pence: 15000,  // TODO(Blue): confirm or remove
};

export async function publicSettings() {
  if (isDemo()) return { ...SETTING_DEFAULTS, ...(await demo()).settings };
  const rows = await rest('bl_site_settings?select=key,value', { role: 'anon' });
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

// ---------- checkout (service key, but still published only) ----------
export async function productsForCheckout(ids) {
  if (!ids.length) return [];
  if (isDemo()) return (await publicProducts()).filter((p) => ids.includes(p.id) && p.is_published);
  const products = await rest(`bl_products?select=*&is_published=eq.true&id=${inList(ids)}`);
  const variants = products.length
    ? await rest(`bl_product_variants?select=*&product_id=${inList(products.map((p) => p.id))}`)
    : [];
  return attachVariants(products, variants);
}

export async function findDiscount(code) {
  if (!code) return null;
  const c = String(code).trim().toUpperCase().slice(0, 40);
  if (!c) return null;
  if (isDemo()) return ((await demo()).discounts || []).find((d) => d.code === c && d.active) || null;
  const rows = await rest(`bl_discount_codes?select=*&code=eq.${enc(c)}&active=eq.true&limit=1`);
  return rows[0] || null;
}

// ---------- orders ----------
export async function createOrder(payload) {
  const rows = await rest('rpc/bl_create_order', { method: 'POST', body: { p: payload } });
  const r = Array.isArray(rows) ? rows[0] : rows;
  return { orderId: r.order_id, isNew: !!r.is_new };
}

// Flip a "sent_at" column from null to now. Returns the row only if we won,
// so an email is sent at most once even if two requests race.
export async function claimEmail(orderId, column) {
  const rows = await rest(`bl_orders?id=eq.${Number(orderId)}&${column}=is.null`, {
    method: 'PATCH', body: { [column]: new Date().toISOString() }, prefer: 'return=representation',
  });
  return rows && rows.length ? rows[0] : null;
}

export const getOrder = async (id) =>
  (await rest(`bl_orders?select=*&id=eq.${Number(id)}&limit=1`))[0] || null;

export function listOrders(status) {
  const f = ['paid', 'shipped', 'refunded'].includes(status) ? `&status=eq.${status}` : '';
  return rest(`bl_orders?select=*&order=created_at.desc&limit=200${f}`);
}

export async function updateOrder(id, patch) {
  const rows = await rest(`bl_orders?id=eq.${Number(id)}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
  return rows[0] || null;
}

// ---------- enquiries ----------
export async function insertEnquiry(row) {
  const rows = await rest('bl_enquiries', { method: 'POST', body: row, prefer: 'return=representation' });
  return rows[0];
}
export const listEnquiries = () => rest('bl_enquiries?select=*&order=created_at.desc&limit=300');
export const markEnquiryRead = (id, isRead) =>
  rest(`bl_enquiries?id=eq.${Number(id)}`, { method: 'PATCH', body: { is_read: !!isRead } });

// ---------- portal: products ----------
export async function allProducts() {
  const products = await rest('bl_products?select=*&order=sort_order.asc,created_at.asc');
  const variants = products.length ? await rest('bl_product_variants?select=*&order=sort_order.asc') : [];
  return attachVariants(products, variants);
}
export async function getProduct(id) {
  const rows = await rest(`bl_products?select=*&id=eq.${enc(id)}&limit=1`);
  if (!rows.length) return null;
  const variants = await rest(`bl_product_variants?select=*&product_id=eq.${enc(id)}&order=sort_order.asc`);
  return attachVariants(rows, variants)[0];
}
export async function insertProduct(row) {
  return (await rest('bl_products', { method: 'POST', body: row, prefer: 'return=representation' }))[0];
}
export async function updateProduct(id, patch) {
  return (await rest(`bl_products?id=eq.${enc(id)}`, { method: 'PATCH', body: patch, prefer: 'return=representation' }))[0];
}
export async function replaceVariants(productId, variants) {
  await rest(`bl_product_variants?product_id=eq.${enc(productId)}`, { method: 'DELETE' });
  if (variants.length) {
    await rest('bl_product_variants', { method: 'POST', body: variants.map((v, i) => ({ ...v, product_id: productId, sort_order: (i + 1) * 10 })) });
  }
}
export const setProductOrder = (ids) => rest('rpc/bl_set_product_order', { method: 'POST', body: { ids } });
export async function maxSortOrder() {
  const r = await rest('bl_products?select=sort_order&order=sort_order.desc&limit=1');
  return r.length ? r[0].sort_order : 0;
}

// ---------- portal: settings + discount codes ----------
export async function allSettings() {
  const rows = await rest('bl_site_settings?select=key,value');
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}
export const saveSettings = (obj) => rest('bl_site_settings?on_conflict=key', {
  method: 'POST',
  body: Object.entries(obj).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() })),
  prefer: 'resolution=merge-duplicates',
});
export const listDiscounts = () => rest('bl_discount_codes?select=*&order=created_at.desc');
export const upsertDiscount = (row) => rest('bl_discount_codes?on_conflict=code', {
  method: 'POST', body: [row], prefer: 'resolution=merge-duplicates',
});

export async function counts() {
  const [orders, enquiries] = await Promise.all([
    rest('bl_orders?select=id,status'),
    rest('bl_enquiries?select=id,is_read'),
  ]);
  return {
    toShip: orders.filter((o) => o.status === 'paid').length,
    orders: orders.length,
    unreadEnquiries: enquiries.filter((e) => !e.is_read).length,
  };
}

// ---------- storage ----------
// Signed upload URL so the portal can send a photo straight to Supabase
// Storage without ever holding the service key.
export async function signedUpload(path) {
  const resp = await fetch(`${env.supabaseUrl}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: env.supabaseService, Authorization: `Bearer ${env.supabaseService}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!resp.ok) throw new DbError('Could not prepare upload', resp.status, (await resp.text()).slice(0, 200));
  const { url } = await resp.json();   // "/object/upload/sign/${BUCKET}/...?token=..."
  return {
    uploadUrl: `${env.supabaseUrl}/storage/v1${url}`,
    publicUrl: `${env.supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`,
  };
}

// ---------- portal access (shared Clientside pattern) ----------
export async function isPortalMember(userId, business = 'bluelogan') {
  if (!userId) return false;
  const rows = await rest(`portal_members?select=user_id&user_id=eq.${enc(userId)}&business=eq.${enc(business)}&limit=1`);
  return rows.length > 0;
}
