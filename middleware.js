// =============================================================
//  Vercel Routing Middleware: keeps every /portal page behind login.
//  Runs before static files are served, so the portal HTML itself is
//  never sent to someone who is not a Blue Logan portal member.
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

export default async function middleware(request) {
  const url = new URL(request.url);
  if (OPEN.has(url.pathname)) return next();

  const token = cookieValue(request.headers.get('cookie'), 'bl_at');
  const supa = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  // Logged in, and a member of the 'bluelogan' business in the shared
  // public.portal_members table (same pattern as the Cleanway portal).
  let ok = false;
  if (token && supa && service) {
    try {
      const r = await fetch(`${supa}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const user = await r.json();
        const m = await fetch(`${supa}/rest/v1/portal_members?select=user_id&business=eq.bluelogan&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, {
          headers: { apikey: service, Authorization: `Bearer ${service}` },
        });
        ok = m.ok && (await m.json()).length > 0;
      }
    } catch { ok = false; }
  }
  if (ok) return next({ headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

  const login = new URL('/portal/login', url);
  login.searchParams.set('next', url.pathname + url.search);
  return Response.redirect(login, 302);
}
