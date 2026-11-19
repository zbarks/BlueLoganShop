// =============================================================
//  Portal login: one username and password, set in Vercel as
//  PORTAL_USERNAME and PORTAL_PASSWORD (never written in the code).
//
//  A correct login gets a signed session cookie (bl_session):
//  HttpOnly, SameSite=Strict, Secure, 12 hours. The signature uses
//  SESSION_SECRET, so the cookie cannot be forged or edited.
//  middleware.js checks the same cookie before any /portal page.
//  Designed by Barker Digital
// =============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getCookie } from './http.js';

const COOKIE = 'bl_session';
const HOURS = 12;

const cfg = () => ({
  user: process.env.PORTAL_USERNAME || '',
  pass: process.env.PORTAL_PASSWORD || '',
  secret: process.env.SESSION_SECRET || '',
});
export const authConfigured = () => { const c = cfg(); return !!(c.user && c.pass && c.secret.length >= 32); };

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (payload, secret) => b64(createHmac('sha256', secret).update(payload).digest());

export function checkLogin(username, password) {
  const c = cfg();
  if (!authConfigured()) return false;
  // Both compared in constant time, and both always compared.
  const u = same(String(username || '').trim().toLowerCase(), c.user.toLowerCase());
  const p = same(String(password || ''), c.pass);
  return u && p;
}

export function makeSession() {
  const payload = b64(JSON.stringify({ exp: Date.now() + HOURS * 3600 * 1000 }));
  return `${payload}.${sign(payload, cfg().secret)}`;
}

export function verifySession(token) {
  const c = cfg();
  if (!token || !authConfigured()) return false;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig || !same(sig, sign(payload, c.secret))) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}

const secure = () => !/^http:\/\/(localhost|127\.0\.0\.1)/.test(process.env.SITE_URL || '');
export function setSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=${makeSession()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${HOURS * 3600}${secure() ? '; Secure' : ''}`);
}
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure() ? '; Secure' : ''}`);
}
export const isLoggedIn = (req) => verifySession(getCookie(req, COOKIE));
