"""Checks every shop page at 360, 390, 768 and 1440px for wrapping key lines and sideways overflow.
Long piece names typed by Blue are allowed to wrap (fit-wrap) rather than run off a phone screen."""
import sys
from playwright.sync_api import sync_playwright
pages = ['/','/shop','/category/objects-and-oddities','/search','/shop/vase','/basket','/contact','/delivery-and-returns','/order/thanks','/nope','/portal/login']
widths=[360,390,768,1440]
problems=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for w in widths:
        ctx=b.new_context(viewport={'width':w,'height':900})
        pg=ctx.new_page()
        for path in pages:
            pg.goto('http://localhost:4100'+path); pg.wait_for_timeout(700)
            r = pg.evaluate("""() => {
              const out = [];
              const doc = document.documentElement;
              if (doc.scrollWidth > window.innerWidth + 1) out.push('page overflows horizontally: ' + doc.scrollWidth);
              const keys = [...document.querySelectorAll('.wordmark, h1, .page-title, .btn, .main-nav a, .p-brand, .cat-name, .section-head h2, .footer-hand, .zone[data-kind=sign] .zone-label')];
              for (const el of keys) {
                const rect = el.getBoundingClientRect();
                if (!rect.width) continue;
                const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.2;
                const range = document.createRange(); range.selectNodeContents(el);
                const lines = new Set([...range.getClientRects()].filter(r=>r.width>1).map(r => Math.round(r.top))).size;
                if (lines > 1) out.push('wraps: ' + el.className + ' "' + el.textContent.trim().slice(0,30) + '"');
                if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline') out.push('clipped: ' + el.className + ' "' + el.textContent.trim().slice(0,30)+'"');
                if (rect.right > window.innerWidth + 1) out.push('off screen: ' + el.className + ' "' + el.textContent.trim().slice(0,30)+'"');
              }
              const all = document.querySelector('.main-nav .shop-all');
              if (location.pathname.indexOf('/portal') !== 0 && (!all || !all.getBoundingClientRect().width)) out.push('no visible Shop all button');
              return out;
            }""")
            for x in r: problems.append(f'{w}px {path}: {x}')
            if len(sys.argv)>1: pg.screenshot(path=f'/tmp/shot-{w}-{path.strip("/").replace("/","_") or "root"}.png', full_page=True)
        ctx.close()
    b.close()
real = [x for x in problems if 'fit-wrap' not in x]
print('\n'.join(real) or 'NO WRAPPING OR OVERFLOW PROBLEMS')
sys.exit(1 if real else 0)
