// =============================================================
//  A small stand-in for Vercel's router, for the automated tests:
//  middleware.js, redirects, rewrites and cleanUrls from vercel.json,
//  and the /api functions. (For day-to-day work use `npx vercel dev`.)
// =============================================================

import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain' };

export async function startDevServer({ port, root }) {
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  const middleware = await import(pathToFileURL(join(root, 'middleware.js')));
  const fn = async (rel) => (await import(pathToFileURL(join(root, rel)))).default;
  const routes = {
    '/api/checkout': await fn('api/checkout.js'),
    '/api/stripe-webhook': await fn('api/stripe-webhook.js'),
  };
  const shop = await fn('api/shop/[action].js');
  const admin = await fn('api/admin/[action].js');

  const toRegex = (src) => new RegExp('^' + src.replace(/:[a-z]+/g, '([^/]+)') + '$');
  const matcher = middleware.config.matcher.map((m) => new RegExp('^' + m.replace('/:path*', '(/.*)?') + '$'));

  function serveFile(res, file, status = 200) {
    res.writeHead(status, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  }
  const fileFor = (p) => {
    for (const c of [p, p + '.html', join(p, 'index.html')]) {
      const f = join(root, c);
      if (f.startsWith(root) && existsSync(f) && statSync(f).isFile()) return f;
    }
    return null;
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    let p = decodeURIComponent(url.pathname);
    try {
      // middleware first, like Vercel
      if (matcher.some((r) => r.test(p))) {
        const request = new Request(url, { headers: req.headers });
        const out = await middleware.default(request);
        if (!out.headers.get('x-middleware-next')) {
          res.writeHead(out.status, Object.fromEntries(out.headers));
          return res.end(await out.text());
        }
      }
      for (const r of vercel.redirects || []) {
        if (p === r.source) { res.writeHead(r.permanent ? 308 : 307, { Location: r.destination }); return res.end(); }
      }
      if (p.startsWith('/api/')) {
        let m;
        req.query = Object.fromEntries(url.searchParams);
        if (routes[p]) return await routes[p](req, res);
        if ((m = p.match(/^\/api\/shop\/([a-z-]+)$/))) { req.query.action = m[1]; return await shop(req, res); }
        if ((m = p.match(/^\/api\/admin\/([a-z-]+)$/))) { req.query.action = m[1]; return await admin(req, res); }
        res.writeHead(404); return res.end('{}');
      }
      const direct = p.endsWith('.html') ? null : fileFor(p);
      if (direct) return serveFile(res, direct);
      for (const r of vercel.rewrites || []) {
        if (toRegex(r.source).test(p)) return serveFile(res, join(root, r.destination));
      }
      return serveFile(res, join(root, '404.html'), 404);
    } catch (e) {
      console.error('[dev-server]', e);
      if (!res.headersSent) { res.writeHead(500); res.end('error'); }
    }
  });
  await new Promise((r) => server.listen(port, r));
  return server;
}
