// =============================================================
//  Builds the shop's HTML pages from one layout so the header and
//  footer (and the way back to Blue's main site) are identical on
//  every page. Run after editing anything in src/:
//      node tools/build-pages.js
//  The generated .html files are committed, so Vercel needs no build.
//  MAIN_SITE_URL here is only the no-JavaScript fallback; at runtime
//  the link is set from the MAIN_SITE_URL env var via /api/shop/config.
//  Designed by Barker Digital
// =============================================================

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = (process.env.MAIN_SITE_URL || 'https://bluelogan.co.uk').replace(/\/$/, ''); // TODO(Zach): confirm
const layout = readFileSync(join(root, 'src/layout.html'), 'utf8');

const pages = {
  'index.html':                { page: 'home',    nav: '',        title: "Blue's Shop | Blue Logan", desc: 'A curious little world of wonderful things, by Blue Logan.' },
  'shop.html':                 { page: 'shop',    nav: 'shop',    title: "Shop all | Blue's Shop", desc: 'Everything in Blue Logan\'s shop.' },
  'product.html':              { page: 'product', nav: 'shop',    title: "Blue's Shop", desc: 'From Blue Logan\'s shop.' },
  'contact.html':              { page: 'contact', nav: 'contact', title: "Contact | Blue's Shop", desc: 'Contact Blue Logan.' },
  '404.html':                  { page: 'notfound', nav: '',       title: "Nothing here | Blue's Shop", desc: 'Page not found.', noindex: true },
};

for (const [file, meta] of Object.entries(pages)) {
  const body = readFileSync(join(root, 'src/pages', file), 'utf8');
  const cur = (k) => (meta.nav === k ? ' aria-current="page"' : '');
  const html = layout
    .replace('{{BODY}}', body.trim())
    .replaceAll('{{TITLE}}', meta.title)
    .replaceAll('{{DESC}}', meta.desc)
    .replaceAll('{{PAGE}}', meta.page)
    
    .replaceAll('{{ROBOTS}}', meta.noindex ? '<meta name="robots" content="noindex">' : '')
    .replaceAll('{{CUR_SHOP}}', cur('shop'))
    .replaceAll('{{CUR_CONTACT}}', cur('contact'))
    .replaceAll('{{CUR_BASKET}}', cur('basket'))
    .replaceAll('{{CUR_SEARCH}}', '')
    .replaceAll('{{MAIN}}', MAIN);
  writeFileSync(join(root, file), html);
  console.log('built', file);
}
