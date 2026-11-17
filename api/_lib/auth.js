// =============================================================
//  Portal auth: Supabase Auth (email + password), one admin.
//
//  The browser never holds a token. /api/admin/login exchanges the
//  password with Supabase and sets two HttpOnly, SameSite=Strict cookies:
//    bl_at  access token  (about an hour)
//    bl_rt  refresh token (30 days)
//  Every admin API call and every /portal page (see middleware.js)
//  checks bl_at with Supabase, and the user must have a row in the shared
//  public.portal_members table with business 'bluelogan' (the same pattern
//  Cleanway uses in the Clientside project). A Brioche or Cleanway login
//  can never open Blue's portal.
//  Designed by Barker Digital
// =============================================================

import { env } from './env.js';
import { getCookie } from './http.js';
import { isPortalMember } from './db.js';

const authFetch = (path, opts = {}) => fetch(`${env.supabaseUrl}/auth/v1/${path}`, {
  ...opts,
  headers: { apikey: env.supabaseAnon, 'Content-Type': 'application/json', ...(opts.headers || {}) },
});

export async function userFromToken(token) {
  if (!token || !env.supabaseUrl) return null;
  try {
    const r = await authFetch('user', { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const user = await r.json();
    return (await isPortalMember(user.id)) ? user : null;
  } catch { return null; }
}

export async function passwordGrant(email, password) {
  const r = await authFetch('token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
  return r.ok ? r.json() : null;
}

export async function refreshGrant(refreshToken) {
  const r = await authFetch('token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) });
  return r.ok ? r.json() : null;
}

function cookie(name, value, maxAge, secure) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

const isSecure = () => !/^http:\/\/(localhost|127\.0\.0\.1)/.test(env.siteUrl || '');

export function setSessionCookies(res, session) {
  const s = isSecure();
  res.setHeader('Set-Cookie', [
    cookie('bl_at', session.access_token, Math.max(60, (session.expires_in || 3600) - 60), s),
    cookie('bl_rt', session.refresh_token, 60 * 60 * 24 * 30, s),
  ]);
}

export function clearSessionCookies(res) {
  const s = isSecure();
  res.setHeader('Set-Cookie', [cookie('bl_at', '', 0, s), cookie('bl_rt', '', 0, s)]);
}

export const accessToken = (req) => getCookie(req, 'bl_at');
export const refreshToken = (req) => getCookie(req, 'bl_rt');
