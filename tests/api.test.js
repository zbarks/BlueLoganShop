// End-to-end API tests against tests/harness.js (Stripe test flow, webhook,
// idempotency, portal auth, shipping, refunds, enquiries, RLS).
import assert from 'node:assert/strict';

const SITE = 'http://localhost:4100', SUPA = 'http://localhost:4101', STRIPE = 'http://localhost:4102', RESEND = 'http://localhost:4103';
let passed = 0; const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok  ', name); }
  catch (e) { failures.push(name); console.log('  FAIL', name, '\n       ', e.message); }
}
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null), headers: r.headers });
const get = (p, h = {}) => fetch(SITE + p, { headers: h, redirect: 'manual' }).then(j);
const post = (p, b, h = {}) => fetch(SITE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b), redirect: 'manual' }).then(j);
const sql = (q) => fetch(`${SUPA}/__sql?q=${encodeURIComponent(q)}`).then((r) => r.json());
const emails = () => fetch(`${RESEND}/__emails`).then((r) => r.json());
const anon = (path, init = {}) => fetch(`${SUPA}/rest/v1/${path}`, { ...init, headers: { apikey: 'anon-key', Authorization: 'Bearer anon-key', 'Content-Type': 'application/json', ...(init.headers || {}) } });

let cookie = '';
const adminGet = (p) => get('/api/admin/' + p, { cookie });
const adminPost = (p, b) => post('/api/admin/' + p, b, { cookie });
const cookiesFrom = (h) => h.getSetCookie().map((c) => c.split(';')[0]).join('; ');

// Extra test products on top of the seeded five: stock limits, variants, and
// one enquiry-only piece.
await sql(`insert into bl_products (slug,title,mode,price_pence,stock,images,is_published,sort_order) values
  ('one-off-enquire','One-off to enquire about','enquire',null,1,'{/images/placeholders/image-1.svg}',true,140),
  ('placeholder-print-one','Placeholder Print One','buy',12000,25,'{/images/placeholders/image-1.svg}',true,100),
  ('placeholder-print-two','Placeholder Print Two','buy',9500,25,'{/images/placeholders/image-2.svg}',true,110),
  ('placeholder-lampshade-two','Placeholder Lampshade Two','buy',16000,null,'{/images/placeholders/image-3.svg}',true,120),
  ('placeholder-one-off-one','Placeholder One-off One','buy',65000,1,'{/images/placeholders/image-4.svg}',true,130)`);
await sql(`insert into bl_product_variants (product_id,label,price_pence,stock,sort_order) select id,v.l,v.p,v.s,v.o from bl_products,
  (values ('Small, 30 cm',16000,4,10),('Large, 45 cm',21000,3,20)) v(l,p,s,o) where slug='placeholder-lampshade-two'`);
await sql(`insert into bl_discount_codes (code,percent_off,active) values ('TEST10',10,true)`);
const [{ id: lampId }] = await sql(`select id from bl_products where slug='placeholder-lampshade-two'`);
const lampVariants = await sql(`select * from bl_product_variants where product_id='${lampId}'`);

const products = (await get('/api/shop/products')).body.products;
const P = Object.fromEntries(products.map((p) => [p.slug, p]));
const print1 = P['placeholder-print-one'], oneoff = P['placeholder-one-off-one'], enq = P['one-off-enquire'];
const lamp2 = { ...P['placeholder-lampshade-two'], variants: lampVariants };

console.log('\nShop data');
await test('five starting products (plus test products) are public', () => assert.equal(products.length, 10));
await test('the shop is enquiry only: no prices on Blue\'s products, no stock counts ever', () => {
  for (const slug of ['lampshade-faces', 'lampshade-party', 'vase', 'ritas', 'ritas-coaster']) {
    assert.equal(P[slug].mode, 'enquire', slug); assert.equal(P[slug].price_pence, null, slug);
  }
  for (const p of products) assert.ok(!('stock' in p), `${p.slug} leaks stock`);
});
await test('products carry their category; the five starting categories are public, in order', async () => {
  const d = (await get('/api/shop/products')).body;
  assert.deepEqual(d.categories.map((c) => c.name), ['Objects & Oddities', 'Little Treasures', 'Things to Wear', 'Paper Things', 'Special Editions']);
  assert.deepEqual(P['vase'].category, { slug: 'objects-and-oddities', name: 'Objects & Oddities' });
  assert.equal(P['ritas'].category.slug, 'paper-things');
});
await test('three products are in the shop window', () => assert.deepEqual(products.filter((p) => p.featured).map((p) => p.slug).sort(), ['lampshade-faces', 'lampshade-party', 'vase']));
await test('placeholder shop name and welcome line are served; no illustration yet', async () => {
  const d = (await get('/api/shop/products')).body;
  assert.equal(d.shop_title, "Blue's Shop"); assert.equal(d.intro_text, 'A curious little world of wonderful things.');
  assert.equal(d.hero_image, ''); assert.equal(d.hero_image_mobile, '');
});
await test('anyone can read categories, nobody public can write them', async () => {
  const rows = await (await anon('bl_categories?select=*')).json();
  assert.equal(rows.length, 5);
  const w = await anon('bl_categories', { method: 'POST', body: JSON.stringify({ slug: 'x', name: 'x' }) });
  assert.ok(w.status >= 400);
});

console.log('\nSales code (switched off, kept for later)');
await test('quote ignores any price sent by the browser', async () => {
  const q = (await post('/api/shop/quote', { items: [{ product_id: print1.id, qty: 2, price_pence: 1, unit_pence: 1 }] })).body;
  assert.equal(q.lines[0].unit_pence, 12000);
  assert.equal(q.subtotal_pence, 24000);
  assert.equal(q.shipping_pence, 0, 'free delivery over £150');
  assert.equal(q.total_pence, 24000);
});
await test('delivery fee applies under the threshold', async () => {
  const q = (await post('/api/shop/quote', { items: [{ product_id: P['placeholder-print-two'].id, qty: 1 }] })).body;
  assert.equal(q.shipping_pence, 500); assert.equal(q.total_pence, 10000);
});
await test('discount code TEST10 takes 10% off items', async () => {
  const q = (await post('/api/shop/quote', { items: [{ product_id: print1.id, qty: 1 }], discount_code: 'test10' })).body;
  assert.equal(q.discount.code, 'TEST10'); assert.equal(q.discount_pence, 1200); assert.equal(q.total_pence, 10800 + 500, 'items after discount plus £5 delivery');
});
await test('unknown discount code is rejected', async () => {
  const q = (await post('/api/shop/quote', { items: [{ product_id: print1.id, qty: 1 }], discount_code: 'NOPE' })).body;
  assert.equal(q.discount, null); assert.equal(q.discount_rejected, true);
});
await test('variant product needs an option and uses the option price', async () => {
  const q1 = (await post('/api/shop/quote', { items: [{ product_id: lamp2.id, qty: 1 }] })).body;
  assert.equal(q1.lines.length, 0); assert.match(q1.problems[0].reason, /choose an option/);
  const large = lamp2.variants.find((v) => /Large/.test(v.label));
  const q2 = (await post('/api/shop/quote', { items: [{ product_id: lamp2.id, variant_id: large.id, qty: 1 }] })).body;
  assert.equal(q2.lines[0].unit_pence, 21000);
});
await test('enquire-only product cannot be bought', async () => {
  const r = await post('/api/checkout', { items: [{ product_id: enq.id, qty: 1 }] });
  assert.equal(r.status, 409); assert.match(r.body.problems[0].reason, /enquiry only/);
});
await test('quantity over stock is reduced and flagged', async () => {
  const q = (await post('/api/shop/quote', { items: [{ product_id: oneoff.id, qty: 5 }] })).body;
  assert.equal(q.lines[0].qty, 1); assert.equal(q.problems[0].adjusted_qty, 1);
});

console.log('\nRow level security (public anon key)');
await test('anon cannot read orders, enquiries or discount codes', async () => {
  for (const t of ['bl_orders', 'bl_enquiries', 'bl_discount_codes']) {
    const rows = await (await anon(`${t}?select=*`)).json();
    assert.deepEqual(rows, [], `${t} visible to anon`);
  }
});
await test('anon cannot write products', async () => {
  const r = await anon('bl_products', { method: 'POST', body: JSON.stringify({ slug: 'hack', title: 'x', type: 'print', mode: 'enquire' }) });
  assert.ok(r.status >= 400);
});
await test('anon cannot read private settings', async () => {
  await sql(`insert into bl_site_settings(key,value) values ('secret_thing','"x"') on conflict do nothing`);
  const rows = await (await anon('bl_site_settings?select=*')).json();
  assert.ok(!rows.some((r) => r.key === 'secret_thing'));
});

await test('Brioche\'s enquiries table in the shared project is untouched', async () => {
  const [row] = await sql(`select name from enquiries where id = 1`);
  assert.equal(row.name, 'brioche booking');
  const [{ n }] = await sql(`select count(*)::int n from information_schema.columns where table_name = 'enquiries' and table_schema = 'public'`);
  assert.equal(n, 2);
});

console.log('\nCheckout and webhook');
let session;
await test('checkout creates a GBP, UK-only Stripe session with server prices', async () => {
  const large = lamp2.variants.find((v) => /Large/.test(v.label));
  const r = await post('/api/checkout', { items: [{ product_id: print1.id, qty: 1 }, { product_id: lamp2.id, variant_id: large.id, qty: 1 }], discount_code: 'TEST10', ph_id: 'ph_1' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const id = r.body.url.split('/pay/')[1];
  session = await fetch(`${STRIPE}/__session/${id}`).then((x) => x.json());
  assert.deepEqual(session.shipping_address_collection.allowed_countries, ['GB']);
  assert.equal(session.line_items[0].price_data.currency, 'gbp');
  assert.equal(+session.line_items[0].price_data.unit_amount, 10800);
  assert.equal(+session.line_items[1].price_data.unit_amount, 18900);
  assert.equal(session.success_url, `${SITE}/order/thanks?session_id={CHECKOUT_SESSION_ID}`);
  assert.equal(session.metadata.discount_code, 'TEST10');
});
let orderId;
await test('paid webhook creates the order, reduces stock and sends both emails', async () => {
  const before = (await emails()).length;
  const r = await fetch(`${STRIPE}/__complete/${session.id}`).then((x) => x.json());
  assert.equal(r.status, 200, JSON.stringify(r.body));
  orderId = r.body.order_id;
  const [o] = await sql(`select * from bl_orders where stripe_session_id='${session.id}'`);
  assert.equal(o.status, 'paid'); assert.equal(o.total_pence, 29700); assert.equal(o.discount_code, 'TEST10');
  assert.equal(o.shipping_address.postal_code, 'EH1 1AA');
  assert.equal(o.items.length, 2); assert.equal(o.items[1].variant_label, 'Large, 45 cm');
  const [s1] = await sql(`select stock from bl_products where slug='placeholder-print-one'`);
  assert.equal(s1.stock, 24);
  const [s2] = await sql(`select stock from bl_product_variants where label='Large, 45 cm'`);
  assert.equal(s2.stock, 2);
  const sent = (await emails()).slice(before);
  assert.ok(sent.some((e) => e.to[0] === 'customer@example.com' && /confirmed/.test(e.subject)), 'customer email');
  assert.ok(sent.some((e) => e.to[0] === 'blue@example.com' && /New order/.test(e.subject)), 'Blue alert');
});
await test('the same Stripe event twice does not create a second order', async () => {
  const before = (await emails()).length;
  const r = await fetch(`${STRIPE}/__replay/${session.id}`).then((x) => x.json());
  assert.equal(r.status, 200); assert.equal(r.body.duplicate, true);
  const [{ n }] = await sql(`select count(*)::int n from bl_orders where stripe_session_id='${session.id}'`);
  assert.equal(n, 1);
  const [s1] = await sql(`select stock from bl_products where slug='placeholder-print-one'`);
  assert.equal(s1.stock, 24, 'stock not reduced twice');
  assert.equal((await emails()).length, before, 'no repeat emails');
});
await test('a forged webhook is rejected', async () => {
  const r = await fetch(`${STRIPE}/__forged`).then((x) => x.json());
  assert.equal(r.status, 400);
});
await test('webhook URL answers directly with no redirect (Hepple 308 bug)', async () => {
  const r = await fetch(`${SITE}/api/stripe-webhook`, { method: 'POST', redirect: 'manual', body: '{}' });
  assert.equal(r.status, 400);
});
let noAddrOrder;
await test('an order with no shipping address is still recorded safely', async () => {
  const r = await post('/api/checkout', { items: [{ product_id: P['placeholder-print-two'].id, qty: 1 }] });
  const id = r.body.url.split('/pay/')[1];
  const w = await fetch(`${STRIPE}/__complete/${id}?noaddress=1`).then((x) => x.json());
  assert.equal(w.status, 200);
  noAddrOrder = w.body.order_id;
  const [o] = await sql(`select shipping_address from bl_orders where id=${noAddrOrder}`);
  assert.equal(o.shipping_address, null);
});
await test('thanks page lookup returns first name only', async () => {
  const r = await get(`/api/shop/order?session_id=${session.id}`);
  assert.equal(r.body.first_name, 'Test'); assert.equal(r.body.paid, true);
});

console.log('\nStock and shop switch');
await test('one-off sells out after purchase', async () => {
  const r = await post('/api/checkout', { items: [{ product_id: oneoff.id, qty: 1 }] });
  const id = r.body.url.split('/pay/')[1];
  await fetch(`${STRIPE}/__complete/${id}`);
  const p = (await get('/api/shop/product?slug=placeholder-one-off-one')).body.product;
  assert.equal(p.sold_out, true);
  const again = await post('/api/checkout', { items: [{ product_id: oneoff.id, qty: 1 }] });
  assert.equal(again.status, 409); assert.match(again.body.problems[0].reason, /sold out/);
});

console.log('\nPortal access');
await test('every portal page redirects to login without a session', async () => {
  for (const p of ['/portal', '/portal/products', '/portal/products/new', '/portal/products/abc', '/portal/enquiries', '/portal/settings', '/portal/index.html', '/portal/settings.html', '/portal/product-edit.html']) {
    const r = await fetch(SITE + p, { redirect: 'manual' });
    assert.equal(r.status, 302, p); assert.match(r.headers.get('location'), /\/portal\/login\?next=/);
  }
});
await test('login page is reachable', async () => assert.equal((await fetch(SITE + '/portal/login')).status, 200));
await test('admin API refuses without a session', async () => {
  for (const a of ['home', 'orders', 'products', 'enquiries', 'settings']) assert.equal((await get('/api/admin/' + a)).status, 401, a);
  assert.equal((await post('/api/admin/order-refund', { id: orderId })).status, 401);
});
await test('wrong username or password is refused', async () => {
  assert.equal((await post('/api/admin/login', { username: 'admin', password: 'nope' })).status, 401);
  assert.equal((await post('/api/admin/login', { username: 'blue', password: 'test-only-password' })).status, 401);
  assert.equal((await post('/api/admin/login', {})).status, 401);
});
await test('a forged or edited session cookie is refused', async () => {
  const fake = Buffer.from(JSON.stringify({ exp: Date.now() + 1e9 })).toString('base64url') + '.not-a-real-signature';
  assert.equal((await get('/api/admin/home', { cookie: 'bl_session=' + fake })).status, 401);
  const page = await fetch(SITE + '/portal', { headers: { cookie: 'bl_session=' + fake }, redirect: 'manual' });
  assert.equal(page.status, 302);
});
await test('admin logs in (HttpOnly signed cookie) and can open the portal', async () => {
  const r = await post('/api/admin/login', { username: 'Admin', password: 'test-only-password' });
  assert.equal(r.status, 200);
  const raw = r.headers.getSetCookie().join(' | ');
  assert.match(raw, /bl_session=/); assert.match(raw, /HttpOnly/); assert.match(raw, /SameSite=Strict/);
  cookie = cookiesFrom(r.headers);
  const page = await fetch(SITE + '/portal/products', { headers: { cookie }, redirect: 'manual' });
  assert.equal(page.status, 200);
  assert.equal((await adminGet('home')).status, 200);
});

console.log('\nSales code: order handling (switched off, kept for later)');
await test('orders list shows the paid order and the home count', async () => {
  const o = (await adminGet('orders?status=paid')).body.orders;
  assert.ok(o.some((x) => x.id === orderId));
  assert.ok((await adminGet('home')).body.toShip >= 1);
});
await test('mark as shipped stores tracking and emails the customer once', async () => {
  const before = (await emails()).length;
  assert.equal((await adminPost('order-ship', { id: orderId, tracking_number: '' })).status, 400);
  const r = await adminPost('order-ship', { id: orderId, tracking_number: 'AB123456789GB', carrier: 'Royal Mail' });
  assert.equal(r.status, 200); assert.equal(r.body.emailed, true);
  assert.equal(r.body.order.status, 'shipped');
  const sent = (await emails()).slice(before);
  assert.equal(sent.length, 1); assert.match(sent[0].html, /AB123456789GB/); assert.match(sent[0].subject, /has been sent/);
  const again = await adminPost('order-ship', { id: orderId, tracking_number: 'AB123456789GC' });
  assert.equal(again.body.emailed, false); assert.equal(again.body.alreadyEmailed, true);
  assert.equal((await emails()).length, before + 1);
});
await test('refund goes through Stripe once, even on a double click', async () => {
  const r = await adminPost('order-refund', { id: orderId });
  assert.equal(r.status, 200); assert.equal(r.body.order.status, 'refunded');
  const again = await adminPost('order-refund', { id: orderId });
  assert.equal(again.status, 409);
  const refunds = await fetch(`${STRIPE}/__refunds`).then((x) => x.json());
  assert.equal(refunds.length, 1); assert.equal(refunds[0].payment_intent, 'pi_' + session.id.slice(3));
});

console.log('\nEnquiries and contact');
await test('product enquiry is saved and emailed to Blue', async () => {
  const before = (await emails()).length;
  const r = await post('/api/shop/enquiry', { product_id: enq.id, name: 'Ann', email: 'ann@example.com', message: 'Is this still available?' });
  assert.equal(r.status, 200);
  const sent = (await emails()).slice(before);
  assert.equal(sent[0].to[0], 'blue@example.com'); assert.match(sent[0].subject, /One-off to enquire about/); assert.equal(sent[0].reply_to, 'ann@example.com');
});
await test('contact form validates and saves', async () => {
  const bad = await post('/api/shop/contact', { name: '', email: 'x', message: '' });
  assert.equal(bad.status, 400); assert.ok(bad.body.errors.email);
  assert.equal((await post('/api/shop/contact', { name: 'Bob', email: 'bob@example.com', message: 'Hello there' })).status, 200);
  const list = (await adminGet('enquiries')).body.enquiries;
  assert.equal(list.length, 2); assert.equal(list.find((e) => e.name === 'Ann').product_title, 'One-off to enquire about');
});
await test('honeypot silently drops bots', async () => {
  await post('/api/shop/contact', { name: 'Bot', email: 'bot@example.com', message: 'spam', website: 'x' });
  const [{ n }] = await sql(`select count(*)::int n from bl_enquiries where name='Bot'`);
  assert.equal(n, 0);
});

console.log('\nPortal: products and settings');
let newId;
await test('add a product with a photo, category, the window and sold', async () => {
  const u = (await adminPost('upload-url', { content_type: 'image/png' })).body;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const put = await fetch(u.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png });
  assert.equal(put.status, 200);
  assert.equal((await fetch(u.publicUrl)).status, 200);
  const cats = (await adminGet('categories')).body.categories;
  const wear = cats.find((c) => c.slug === 'things-to-wear');
  const r = await adminPost('product-save', {
    title: 'Test Scarf & Hat', description: 'x', images: [u.publicUrl, 'https://evil.example.com/x.jpg'],
    price: '35', mode: 'buy', category_id: wear.id, is_featured: true, is_published: false, sold: true,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  newId = r.body.product.id;
  const p = r.body.product;
  assert.equal(p.slug, 'test-scarf-and-hat'); assert.equal(p.mode, 'enquire', 'always enquiry'); assert.equal(p.price_pence, null, 'never a price');
  assert.equal(p.stock, 0, 'sold'); assert.equal(p.category_id, wear.id); assert.equal(p.is_featured, true);
  assert.deepEqual(p.images, [u.publicUrl], 'outside image URLs are dropped');
});
await test('validation explains problems in plain words', async () => {
  const r = await adminPost('product-save', { title: '', is_published: true, images: [] });
  assert.equal(r.status, 400); assert.ok(r.body.errors.title && r.body.errors.images);
});
await test('unpublished products never appear on the public shop', async () => {
  const list = (await get('/api/shop/products')).body.products;
  assert.ok(!list.some((p) => p.id === newId));
  assert.equal((await get('/api/shop/product?slug=test-scarf-and-hat')).status, 404);
  const rows = await (await anon(`bl_products?select=*&id=eq.${newId}`)).json();
  assert.deepEqual(rows, []);
  const ck = await post('/api/checkout', { items: [{ product_id: newId, variant_id: null, qty: 1 }] });
  assert.equal(ck.status, 409);
});
await test('unpublishing a live product hides it at once', async () => {
  await adminPost('product-publish', { id: P['vase'].id, is_published: false });
  assert.equal((await get('/api/shop/product?slug=vase')).status, 404);
  await adminPost('product-publish', { id: P['vase'].id, is_published: true });
  assert.equal((await get('/api/shop/product?slug=vase')).status, 200);
});
await test('reorder changes shop order', async () => {
  const ids = (await adminGet('products')).body.products.map((p) => p.id).reverse();
  await adminPost('product-reorder', { ids });
  const after = (await adminGet('products')).body.products.map((p) => p.id);
  assert.deepEqual(after, ids);
});
await test('duplicate web address is caught', async () => {
  const r = await adminPost('product-save', { title: 'Vase', mode: 'enquire', images: [] });
  assert.equal(r.status, 409); assert.ok(r.body.errors.slug);
});
await test('settings: name, welcome line and both illustrations reach the shop', async () => {
  const bad = await adminPost('settings-save', { shop_title: 'x', hero_image: 'https://evil.example.com/a.jpg', hero_image_mobile: '' });
  assert.equal(bad.status, 400);
  const r = await adminPost('settings-save', { shop_title: 'Blue', intro_text: 'Hello.', hero_image: '/images/placeholders/hero.svg', hero_image_mobile: '/images/placeholders/hero.svg', delivery_fee: '5', free_delivery_over: '150' });
  assert.equal(r.status, 200);
  const d = (await get('/api/shop/products')).body;
  assert.equal(d.shop_title, 'Blue'); assert.equal(d.intro_text, 'Hello.');
  assert.equal(d.hero_image, '/images/placeholders/hero.svg'); assert.equal(d.hero_image_mobile, '/images/placeholders/hero.svg');
  await adminPost('settings-save', { shop_title: "Blue's Shop", intro_text: 'Hello.', hero_image: '', hero_image_mobile: '', delivery_fee: '5', free_delivery_over: '150' });
});
await test('a closed shop stops checkout (sales code)', async () => {
  await sql(`update bl_site_settings set value='false' where key='shop_open'`);
  assert.equal((await get('/api/shop/products')).body.shop_open, false);
  const r = await post('/api/checkout', { items: [{ product_id: P['placeholder-print-two'].id, qty: 1 }] });
  assert.equal(r.status, 409); assert.match(r.body.error, /closed/);
  await sql(`update bl_site_settings set value='true' where key='shop_open'`);
});
await test('categories: add, rename, reorder; a category in use cannot be deleted', async () => {
  const add = await adminPost('category-save', { name: 'Odd Socks', description: 'Pairs that do not match.' });
  assert.equal(add.status, 200); assert.equal(add.body.category.slug, 'odd-socks');
  assert.equal((await adminPost('category-save', { name: 'Odd Socks' })).status, 409);
  const ren = await adminPost('category-save', { id: add.body.category.id, name: 'Odd Socks', description: 'Never a pair.' });
  assert.equal(ren.body.category.description, 'Never a pair.');
  let cats = (await adminGet('categories')).body.categories;
  const ids = cats.map((c) => c.id).reverse();
  await adminPost('category-reorder', { ids });
  cats = (await adminGet('categories')).body.categories;
  assert.deepEqual(cats.map((c) => c.id), ids);
  const objects = cats.find((c) => c.slug === 'objects-and-oddities');
  const del = await adminPost('category-delete', { id: objects.id });
  assert.equal(del.status, 409); assert.match(del.body.error, /Move the 3 products/);
  assert.equal((await adminPost('category-delete', { id: add.body.category.id })).status, 200);
  assert.ok(!(await get('/api/shop/products')).body.categories.some((c) => c.slug === 'odd-socks'));
});
await test('discount codes can be added and switched off', async () => {
  await adminPost('discount-save', { code: 'spring 20', percent_off: 20 });
  let q = (await post('/api/shop/quote', { items: [{ product_id: P['placeholder-print-two'].id, qty: 1 }], discount_code: 'SPRING20' })).body;
  assert.equal(q.discount.percent_off, 20);
  await adminPost('discount-save', { code: 'SPRING20', percent_off: 20, active: false });
  q = (await post('/api/shop/quote', { items: [{ product_id: P['placeholder-print-two'].id, qty: 1 }], discount_code: 'SPRING20' })).body;
  assert.equal(q.discount, null);
});
await test('logout clears the session', async () => {
  const r = await post('/api/admin/logout', {}, { cookie });
  assert.match(r.headers.getSetCookie().join(' '), /bl_session=;.*Max-Age=0/);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log('Failed:', failures); process.exit(1); }
