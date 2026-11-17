// =============================================================
//  Local stand-ins for Supabase, Stripe and Resend, used only by the
//  automated tests. Supabase is real Postgres (PGlite) running the real
//  migrations, behind a small PostgREST-style layer that covers the
//  queries this project makes, with the anon key mapped to the anon role
//  so row level security is genuinely enforced.
// =============================================================

import http from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import Stripe from 'stripe';

const readBody = (req) => new Promise((res) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => res(Buffer.concat(c))); });
const send = (res, status, data, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
};
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' };

// ------------------------------------------------------------------ Supabase
export async function startSupabase({ port, root, anonKey, serviceKey, users }) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  `);
  const migDir = join(root, 'supabase/migrations');
  // The shared Clientside project already has Brioche's "enquiries" table and a
  // touch_updated_at() function. Recreate them so the tests prove Blue's
  // migrations leave other clients' objects alone.
  await db.exec(`create table public.enquiries (id bigint primary key, name text);
    insert into public.enquiries values (1, 'brioche booking');
    create function public.touch_updated_at() returns trigger language plpgsql as $$ begin return new; end $$;`);
  for (const f of readdirSync(migDir).sort()) await db.exec(readFileSync(join(migDir, f), 'utf8'));
  for (const [email, u] of Object.entries(users)) {
    if (u.business) await db.query('insert into public.portal_members (user_id, business) values ($1, $2)', [u.id, u.business]);
  }
  // Run a second time to prove every migration is safe to re-run.
  for (const f of readdirSync(migDir).sort()) await db.exec(readFileSync(join(migDir, f), 'utf8'));

  const tokens = new Map();          // access token -> email
  const refresh = new Map();         // refresh token -> email
  const files = new Map();           // storage path -> { type, body }
  const signed = new Map();          // token -> path

  const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error('bad ident ' + s); return `"${s}"`; };

  function whereFrom(params, args) {
    const parts = [];
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      const col = ident(k);
      if (v.startsWith('eq.')) { args.push(v.slice(3)); parts.push(`${col}::text = $${args.length}`); }
      else if (v.startsWith('in.(')) {
        const list = v.slice(4, -1).match(/"([^"]*)"|[^,]+/g).map((x) => x.replace(/^"|"$/g, ''));
        args.push(list); parts.push(`${col}::text = any($${args.length}::text[])`);
      } else if (v === 'is.null') parts.push(`${col} is null`);
      else throw new Error('unsupported filter ' + v);
    }
    return parts.length ? ` where ${parts.join(' and ')}` : '';
  }

  async function asRole(role, fn) {
    return db.transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      return fn(tx);
    });
  }

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, '', CORS);
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    try {
      // ----- test helper -----
      if (p === '/__sql') { const r = await db.query(u.searchParams.get('q')); return send(res, 200, r.rows); }

      // ----- auth -----
      if (p === '/auth/v1/token') {
        const b = JSON.parse((await readBody(req)).toString() || '{}');
        let email = null;
        if (u.searchParams.get('grant_type') === 'password') {
          const user = users[(b.email || '').toLowerCase()];
          if (user && user.password === b.password) email = b.email.toLowerCase();
        } else if (u.searchParams.get('grant_type') === 'refresh_token') {
          email = refresh.get(b.refresh_token) || null;
          refresh.delete(b.refresh_token);
        }
        if (!email) return send(res, 400, { error: 'invalid_grant' });
        const at = 'at_' + randomUUID(); const rt = 'rt_' + randomUUID();
        tokens.set(at, email); refresh.set(rt, email);
        return send(res, 200, { access_token: at, refresh_token: rt, expires_in: 3600, token_type: 'bearer' });
      }
      if (p === '/auth/v1/user') {
        const t = (req.headers.authorization || '').replace(/^Bearer /, '');
        const email = tokens.get(t);
        return email ? send(res, 200, { id: users[email].id, email }) : send(res, 401, { msg: 'invalid token' });
      }
      if (p === '/__expire') { tokens.clear(); return send(res, 200, { ok: true }); }

      // ----- storage -----
      let m;
      if ((m = p.match(/^\/storage\/v1\/object\/upload\/sign\/blue-logan-images\/(.+)$/))) {
        if (req.method === 'POST') {
          if (req.headers.apikey !== serviceKey) return send(res, 403, { error: 'forbidden' });
          const t = randomUUID(); signed.set(t, m[1]);
          return send(res, 200, { url: `/object/upload/sign/blue-logan-images/${m[1]}?token=${t}` });
        }
        if (req.method === 'PUT') {
          const path = signed.get(u.searchParams.get('token'));
          if (path !== m[1]) return send(res, 403, { error: 'bad token' }, CORS);
          signed.delete(u.searchParams.get('token'));
          files.set(path, { type: req.headers['content-type'], body: await readBody(req) });
          return send(res, 200, { Key: path }, CORS);
        }
      }
      if ((m = p.match(/^\/storage\/v1\/object\/public\/blue-logan-images\/(.+)$/))) {
        const f = files.get(m[1]);
        if (!f) return send(res, 404, { error: 'not found' });
        res.writeHead(200, { 'Content-Type': f.type, ...CORS }); return res.end(f.body);
      }

      // ----- REST -----
      if (!p.startsWith('/rest/v1/')) return send(res, 404, { error: 'not found' });
      const key = req.headers.apikey;
      const role = key === serviceKey ? 'service_role' : key === anonKey ? 'anon' : null;
      if (!role || req.headers.authorization !== `Bearer ${key}`) return send(res, 401, { message: 'bad key' });
      const prefer = req.headers.prefer || '';
      const raw = (await readBody(req)).toString();
      const body = raw ? JSON.parse(raw) : null;

      if ((m = p.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/))) {
        const sql = {
          bl_create_order: ['select * from public.bl_create_order($1::jsonb)', (b) => [JSON.stringify(b.p)]],
          bl_set_product_order: ['select public.bl_set_product_order($1::uuid[])', (b) => [b.ids]],
        }[m[1]];
        if (!sql) return send(res, 404, { message: 'no such function' });
        const r = await asRole(role, (tx) => tx.query(sql[0], sql[1](body)));
        return send(res, 200, m[1] === 'bl_set_product_order' ? '' : r.rows);
      }

      const table = ident(p.slice('/rest/v1/'.length));
      const args = [];
      const where = whereFrom(u.searchParams, args);
      const returning = /return=representation/.test(prefer) ? ' returning *' : '';

      let sql;
      if (req.method === 'GET') {
        const sel = u.searchParams.get('select') || '*';
        const cols = sel === '*' ? '*' : sel.split(',').map(ident).join(',');
        const order = u.searchParams.get('order');
        const ord = order ? ' order by ' + order.split(',').map((o) => { const [c, d] = o.split('.'); return `${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}`; }).join(',') : '';
        const lim = u.searchParams.get('limit') ? ` limit ${parseInt(u.searchParams.get('limit'), 10)}` : '';
        sql = `select ${cols} from public.${table}${where}${ord}${lim}`;
      } else if (req.method === 'POST') {
        const rows = Array.isArray(body) ? body : [body];
        const cols = Object.keys(rows[0]).map(ident).join(',');
        args.push(JSON.stringify(rows));
        let conflict = '';
        const oc = u.searchParams.get('on_conflict');
        if (oc) {
          const keys = Object.keys(rows[0]).filter((k) => !oc.split(',').includes(k));
          conflict = /merge-duplicates/.test(prefer)
            ? ` on conflict (${oc.split(',').map(ident).join(',')}) do update set ${keys.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(',')}`
            : ` on conflict (${oc.split(',').map(ident).join(',')}) do nothing`;
        }
        sql = `insert into public.${table} (${cols}) select ${cols} from jsonb_populate_recordset(null::public.${table}, $${args.length}::jsonb)${conflict}${returning}`;
      } else if (req.method === 'PATCH') {
        const cols = Object.keys(body).map(ident);
        args.push(JSON.stringify(body));
        sql = `update public.${table} set (${cols.join(',')}) = (select ${cols.join(',')} from jsonb_populate_record(null::public.${table}, $${args.length}::jsonb))${where}${returning}`;
        if (cols.length === 1) sql = `update public.${table} set ${cols[0]} = (select ${cols[0]} from jsonb_populate_record(null::public.${table}, $${args.length}::jsonb))${where}${returning}`;
      } else if (req.method === 'DELETE') {
        sql = `delete from public.${table}${where}${returning}`;
      } else return send(res, 405, { message: 'method' });

      const r = await asRole(role, (tx) => tx.query(sql, args));
      if (req.method === 'GET' || returning) return send(res, 200, r.rows);
      return send(res, 201, '');
    } catch (e) {
      const status = e.code === '23505' ? 409 : e.code === '42501' ? 403 : 400;
      return send(res, status, { message: e.message, code: e.code });
    }
  });
  await new Promise((r) => server.listen(port, r));
  return { db, server, files };
}

// ------------------------------------------------------------------ Stripe
// Minimal form decoder for stripe-node's a[b][0][c]=x encoding.
function decodeForm(str) {
  const out = {};
  for (const pair of str.split('&').filter(Boolean)) {
    const [k, v = ''] = pair.split('=').map((x) => decodeURIComponent(x.replace(/\+/g, ' ')));
    const path = k.replace(/\]/g, '').split('[');
    let o = out;
    path.forEach((seg, i) => {
      if (i === path.length - 1) { o[seg] = v; return; }
      if (!(seg in o)) o[seg] = /^\d+$/.test(path[i + 1]) ? [] : {};
      o = o[seg];
    });
  }
  return out;
}

export async function startStripe({ port, webhookUrl, webhookSecret }) {
  const sessions = new Map(); const refunds = new Map(); const events = new Map();
  let n = 0;
  const signer = new Stripe('sk_test_mock');

  async function deliver(event) {
    const payload = JSON.stringify(event);
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const r = await fetch(webhookUrl, { method: 'POST', headers: { 'stripe-signature': header, 'content-type': 'application/json' }, body: payload, redirect: 'manual' });
    return { status: r.status, body: await r.json().catch(() => null) };
  }

  function complete(id, opts = {}) {
    const s = sessions.get(id);
    const items = s.line_items.map((l) => ({ ...l, quantity: +l.quantity }));
    const subtotal = items.reduce((a, l) => a + (+l.price_data.unit_amount) * l.quantity, 0);
    const ship = +s.shipping_options[0].shipping_rate_data.fixed_amount.amount;
    const addr = { line1: '1 Test Street', line2: null, city: 'Edinburgh', state: null, postal_code: 'EH1 1AA', country: 'GB' };
    Object.assign(s, {
      status: 'complete', payment_status: 'paid', payment_intent: 'pi_' + id.slice(3),
      amount_subtotal: subtotal, amount_total: subtotal + ship, currency: 'gbp',
      total_details: { amount_discount: 0, amount_shipping: ship, amount_tax: 0 },
      customer_details: { email: opts.email || 'customer@example.com', name: 'Test Customer', phone: '+447700900000', address: opts.noAddress ? null : addr },
      collected_information: opts.noAddress ? { shipping_details: null } : { shipping_details: { name: 'Test Customer', address: addr } },
    });
    const ev = { id: 'evt_' + (++n), object: 'event', type: 'checkout.session.completed', data: { object: s } };
    events.set(id, ev);
    return ev;
  }

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    const body = decodeForm((await readBody(req)).toString());
    let m;
    if (p === '/v1/checkout/sessions' && req.method === 'POST') {
      const id = `cs_test_${++n}${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      const s = { id, object: 'checkout.session', ...body, url: `http://localhost:${port}/pay/${id}`, metadata: body.metadata || {}, status: 'open', payment_status: 'unpaid' };
      sessions.set(id, s);
      return send(res, 200, s);
    }
    if ((m = p.match(/^\/v1\/checkout\/sessions\/([^/]+)\/line_items$/))) {
      const s = sessions.get(m[1]);
      const data = s.line_items.map((l, i) => ({
        id: 'li_' + i, object: 'item', quantity: +l.quantity, description: l.price_data.product_data.name,
        amount_total: +l.price_data.unit_amount * +l.quantity,
        price: { unit_amount: +l.price_data.unit_amount, product: { id: 'prod_' + i, name: l.price_data.product_data.name, metadata: l.price_data.product_data.metadata || {} } },
      }));
      return send(res, 200, { object: 'list', data, has_more: false });
    }
    if ((m = p.match(/^\/v1\/checkout\/sessions\/([^/]+)$/))) {
      const s = sessions.get(m[1]);
      return s ? send(res, 200, s) : send(res, 404, { error: { message: 'No such session' } });
    }
    if (p === '/v1/refunds' && req.method === 'POST') {
      const k = req.headers['idempotency-key'];
      if (!refunds.has(k)) refunds.set(k, { id: 're_' + refunds.size, payment_intent: body.payment_intent, status: 'succeeded' });
      return send(res, 200, refunds.get(k));
    }
    // ---- the hosted "pay" page and test helpers ----
    if ((m = p.match(/^\/pay\/([^/]+)$/))) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(`<!doctype html><title>Mock Stripe</title><h1>Mock Stripe Checkout</h1><form method="post" action="/pay/${m[1]}/complete"><button id="pay">Pay</button></form>`);
    }
    if ((m = p.match(/^\/pay\/([^/]+)\/complete$/))) {
      const ev = complete(m[1]);
      const r = await deliver(ev);
      if (r.status !== 200) { res.writeHead(500); return res.end('webhook failed ' + r.status); }
      res.writeHead(303, { Location: sessions.get(m[1]).success_url.replace('{CHECKOUT_SESSION_ID}', m[1]) });
      return res.end();
    }
    if ((m = p.match(/^\/__complete\/([^/]+)$/))) {
      const ev = complete(m[1], { noAddress: u.searchParams.has('noaddress') });
      return send(res, 200, await deliver(ev));
    }
    if ((m = p.match(/^\/__replay\/([^/]+)$/))) return send(res, 200, await deliver(events.get(m[1])));
    if ((m = p.match(/^\/__session\/([^/]+)$/))) return send(res, 200, sessions.get(m[1]));
    if (p === '/__refunds') return send(res, 200, [...refunds.values()]);
    if (p === '/__forged') {
      const r = await fetch(webhookUrl, { method: 'POST', headers: { 'stripe-signature': 't=1,v1=bad', 'content-type': 'application/json' }, body: '{"type":"checkout.session.completed"}' });
      return send(res, 200, { status: r.status });
    }
    return send(res, 404, { error: { message: 'mock: ' + p } });
  });
  await new Promise((r) => server.listen(port, r));
  return { server, sessions };
}

// ------------------------------------------------------------------ Resend
export async function startResend({ port }) {
  const sent = [];
  const server = http.createServer(async (req, res) => {
    if (req.url === '/__emails') return send(res, 200, sent);
    if (req.url === '/emails' && req.method === 'POST') {
      sent.push(JSON.parse((await readBody(req)).toString()));
      return send(res, 200, { id: 'em_' + sent.length });
    }
    return send(res, 404, {});
  });
  await new Promise((r) => server.listen(port, r));
  return { server, sent };
}
