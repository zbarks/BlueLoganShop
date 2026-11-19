// =============================================================
//  Vercel Routing Middleware: keeps every /portal page behind login.
//  Runs before static files are served, so the portal HTML itself is
//  never sent to someone who is not logged in. It checks the signed
//  bl_session cookie made by /api/admin/login (see api/_lib/auth.js).
//  The login page and the portal's CSS/JS are the only exceptions.
//  Designed by Barker Digital
// =============================================================

import { next } from '@vercel/functions';

export const config = { matcher: ['/portal', '/portal/:path*'] };

const OPEN = new Set(['/portal/login', '/portal/login.html', '/portal/portal.css', '/portal/portal.js']);

function cookieValue(header, name) {
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function validSession(token, secret) {
  if (!token || !secret || secret.length < 32) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff) return false;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json).exp > Date.now();
  } catch { return false; }
}

export default async function middleware(request) {
  const url = new URL(request.url);
  if (OPEN.has(url.pathname)) return next();
  const token = cookieValue(request.headers.get('cookie'), 'bl_session');
  if (await validSession(token, process.env.SESSION_SECRET || '')) {
    return next({ headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  }
  const login = new URL('/portal/login', url);
  login.searchParams.set('next', url.pathname + url.search);
  return Response.redirect(login, 302);
}
