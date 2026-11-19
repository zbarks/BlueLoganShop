/* =============================================================
   Blue's Shop: browser code. Each page sets <body data-page>.
   Prices always come from the server; the basket only stores ids.
   Designed by Barker Digital
   ============================================================= */
(function () {
  'use strict';

  var KEY = 'bl:basket:v2';
  var PLACEHOLDER = '/images/placeholders/image-1.svg';
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(p) {
    if (p == null) return '';
    var n = p / 100;
    return '£' + (n % 1 === 0 ? n.toLocaleString('en-GB') : n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }
  function api(path, body) {
    var opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { d._ok = r.ok; d._status = r.status; return d; });
    });
  }

  // ---------- basket ----------
  var basket = {
    read: function () { try { var v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } },
    write: function (items) { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {} updateCount(); },
    add: function (item) {
      var items = basket.read();
      var hit = items.filter(function (i) { return i.product_id === item.product_id && (i.variant_id || null) === (item.variant_id || null); })[0];
      if (hit) hit.qty = Math.min(20, hit.qty + item.qty); else items.push(item);
      basket.write(items);
    },
    count: function () { return basket.read().reduce(function (n, i) { return n + (i.qty || 0); }, 0); },
    clear: function () { basket.write([]); },
  };
  function updateCount() {
    var n = basket.count();
    $$('[data-basket-count]').forEach(function (el) { el.textContent = n; el.setAttribute('data-n', n); });
  }

  // ---------- one line, always: shrink to fit ----------
  function fitText() {
    $$('[data-fit]').forEach(function (el) {
      el.style.fontSize = '';
      el.classList.remove('fit-wrap');
      var min = parseFloat(el.getAttribute('data-fit')) || 14;
      var size = parseFloat(getComputedStyle(el).fontSize);
      var box = el.parentElement.clientWidth;
      if (!box || el.scrollWidth <= box) return;
      size = Math.max(min, Math.floor(size * box / el.scrollWidth));
      el.style.fontSize = size + 'px';
      var guard = 30;
      while (el.scrollWidth > box && size > min && guard--) { size -= 1; el.style.fontSize = size + 'px'; }
      if (el.scrollWidth > box && el.hasAttribute('data-fit-wrap')) { el.style.fontSize = ''; el.classList.add('fit-wrap'); }
    });
  }

  // ---------- shared shop data (one request per page) ----------
  var shopData = null;
  function loadShop() {
    if (!shopData) shopData = api('/api/shop/products').then(function (d) { if (d._ok) applyText(d); return d; });
    return shopData;
  }
  function applyText(d) {
    if (d.shop_title) $$('[data-shop-title]').forEach(function (el) { el.textContent = d.shop_title; });
    $$('[data-intro]').forEach(function (el) { el.textContent = d.intro_text || ''; el.hidden = !d.intro_text; });
    if (d.shop_open === false && !$('.closed-banner')) {
      var b = document.createElement('div'); b.className = 'closed-banner';
      b.textContent = 'The shop is closed for orders at the moment. Do have a look around.';
      $('.site-header').insertAdjacentElement('afterend', b);
    }
    fitText();
  }

  function priceLabel(p) {
    if (p.mode === 'enquire') return 'Enquire';
    if (p.variants && p.variants.length) {
      var prices = p.variants.map(function (v) { return v.price_pence != null ? v.price_pence : p.price_pence; });
      var lo = Math.min.apply(null, prices), hi = Math.max.apply(null, prices);
      return lo === hi ? money(lo) : 'From ' + money(lo);
    }
    return money(p.price_pence);
  }
  function card(p) {
    return '<a class="card" href="/shop/' + esc(p.slug) + '">' +
      (p.sold_out ? '<span class="badge">Sold</span>' : '') +
      '<div class="card-img"><img src="' + esc(p.images[0] || PLACEHOLDER) + '" alt="' + esc(p.title) + '" loading="lazy"></div>' +
      '<div class="card-title">' + esc(p.title) + '</div><div class="card-price">' + esc(priceLabel(p)) + '</div></a>';
  }

  // ---------- config, link to Blue's site, analytics ----------
  function applyConfig(c) {
    if (c.mainSiteUrl) $$('[data-main-site]').forEach(function (a) { a.href = c.mainSiteUrl.replace(/\/$/, '') + (a.getAttribute('data-main-site') || ''); });
    if (c.demo && !$('.demo-banner')) {
      var b = document.createElement('div'); b.className = 'demo-banner';
      b.textContent = 'Preview: placeholder prices and wireframe shopfront. Payments and forms are switched off.';
      document.body.insertBefore(b, document.body.firstChild);
    }
    var ph = c.posthog;
    if (!ph || !ph.key || window.posthog) return;
    /* eslint-disable */
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register identify reset get_distinct_id opt_in_capturing opt_out_capturing".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    /* eslint-enable */
    window.posthog.init(ph.key, { api_host: ph.host, person_profiles: 'identified_only', opt_out_capturing_by_default: true, disable_session_recording: true });
    var choice = null;
    try { choice = localStorage.getItem('bl:consent'); } catch (e) {}
    if (choice === 'yes') window.posthog.opt_in_capturing();
    if (choice) return;
    var bar = document.createElement('div'); bar.className = 'consent';
    bar.innerHTML = '<p>We would like to use analytics cookies to see how the shop is used. Nothing is tracked unless you accept.</p>' +
      '<button class="btn" data-c="yes">Accept</button><button class="btn light" data-c="no">No thanks</button>';
    bar.addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-c'); if (!v) return;
      try { localStorage.setItem('bl:consent', v); } catch (err) {}
      if (v === 'yes') window.posthog.opt_in_capturing(); else window.posthog.opt_out_capturing();
      bar.remove();
    });
    document.body.appendChild(bar);
  }
  function track(ev, props) { try { if (window.posthog && window.posthog.capture) window.posthog.capture(ev, props || {}); } catch (e) {} }
  function phId() { try { return window.posthog && window.posthog.get_distinct_id ? window.posthog.get_distinct_id() : null; } catch (e) { return null; } }

  // =============== HOME: the shopfront ===============
  function initHome() {
    Promise.all([loadShop(), fetch('/assets/shopfront/zones.json').then(function (r) { return r.json(); })]).then(function (r) {
      var d = r[0], z = r[1];
      if (!d._ok) return;
      var products = d.products || [], cats = d.categories || [];
      var featured = products.filter(function (p) { return p.featured && p.images.length; });
      var stage = $('#shopfront');

      function build() {
        var mobile = window.matchMedia('(max-width: 699px)').matches;
        var spec = mobile ? z.mobile : z.desktop;
        var art = mobile ? (d.hero_image_mobile || d.hero_image) : d.hero_image;
        stage.className = 'shopfront' + (mobile ? ' is-mobile' : '') + (art ? ' has-art' : ' wireframe');
        stage.style.aspectRatio = spec.canvas.width + ' / ' + spec.canvas.height;
        var html = art ? '<img class="art" src="' + esc(art) + '" alt="' + esc(d.shop_title || "Blue's shop") + '">' : '';
        spec.zones.forEach(function (zone) {
          var style = 'left:' + zone.x + '%;top:' + zone.y + '%;width:' + zone.w + '%;height:' + zone.h + '%';
          if (zone.kind === 'sign') {
            if (!art) html += '<div class="zone" data-kind="sign" style="' + style + '"><span class="zone-label" data-shop-title data-fit="14">' + esc(d.shop_title || "Blue's Shop") + '</span></div>';
            return;
          }
          var href = '/shop', label = zone.label, inner = '';
          if (zone.kind === 'category') {
            var c = cats.filter(function (x) { return x.slug === zone.category; })[0];
            if (!c) return;   // category removed in the portal: nothing to click
            href = '/category/' + c.slug; label = c.name;
          }
          if (zone.kind === 'window') {
            if (featured.length) href = '/shop/' + featured[0].slug;
            inner = '<div class="window-show">' + featured.map(function (p, i) {
              return '<img src="' + esc(p.images[0]) + '" alt="" data-slug="' + esc(p.slug) + '"' + (i === 0 ? ' class="on"' : '') + '>';
            }).join('') + '</div>';
          }
          if (zone.kind === 'door') {
            inner = art ? (zone.layer ? '<img class="door-layer" src="' + esc(zone.layer) + '" alt="">' : '')
              : '<span class="door-glow"></span><span class="door-leaf"></span><span class="open-sign">Open</span>';
          }
          html += '<a class="zone" data-kind="' + zone.kind + '" data-zone="' + zone.id + '" href="' + href + '" style="' + style + '" aria-label="' + esc(label) + '">' +
            inner + '<span class="zone-label">' + esc(label) + '</span></a>';
        });
        if (!art) html += '<span class="wireframe-note">Framework. Blue\'s illustration goes here</span>';
        stage.innerHTML = html;
        fitText();
      }
      build();
      var mq = window.matchMedia('(max-width: 699px)');
      if (mq.addEventListener) mq.addEventListener('change', build);

      // The window changes every few seconds when more than one thing is in it.
      if (featured.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        var n = 0;
        setInterval(function () {
          var imgs = $$('.window-show img'); if (!imgs.length) return;
          imgs.forEach(function (im) { im.classList.remove('on'); });
          n = (n + 1) % imgs.length; imgs[n].classList.add('on');
          var w = $('.zone[data-kind="window"]'); if (w) w.href = '/shop/' + imgs[n].getAttribute('data-slug');
        }, 4200);
      }

      $('#cats').innerHTML = cats.map(function (c) {
        var first = products.filter(function (p) { return p.category && p.category.slug === c.slug && p.images.length; })[0];
        return '<a class="cat" href="/category/' + esc(c.slug) + '"><div class="cat-img">' +
          (first ? '<img src="' + esc(first.images[0]) + '" alt="" loading="lazy">' : '<span class="cat-soon">Coming soon</span>') +
          '</div><div class="cat-name-box"><span class="cat-name" data-fit="12">' + esc(c.name) + '</span></div></a>';
      }).join('');
      fitText();
      var win = featured.length ? featured : products.slice(0, 4);
      $('#window-grid').innerHTML = win.slice(0, 8).map(card).join('') || '<p class="empty"><span class="hand">New things arriving soon.</span></p>';
    });
  }

  // =============== SHOP ALL / CATEGORY / SEARCH ===============
  function initShop() {
    var path = location.pathname;
    var catSlug = (path.match(/^\/category\/([^/]+)/) || [])[1];
    var params = new URLSearchParams(location.search);
    var q = $('#q'), sort = $('#sort');
    q.value = params.get('q') || '';
    sort.value = params.get('sort') || '';
    if (path === '/search') { q.focus(); $('#list-title').textContent = 'Search'; }

    loadShop().then(function (d) {
      if (!d._ok) { $('#grid').innerHTML = '<p class="empty">The shop could not load. Please refresh the page.</p>'; return; }
      var cats = d.categories || [];
      var cat = catSlug ? cats.filter(function (c) { return c.slug === catSlug; })[0] : null;
      if (catSlug && !cat) { $('#list-title').textContent = 'Nothing here'; $('#grid').innerHTML = '<p class="empty">That category has moved. <a href="/shop"><u>See everything</u></a>.</p>'; fitText(); return; }
      if (cat) {
        $('#list-title').textContent = cat.name; $('#list-sub').textContent = cat.description || '';
        document.title = cat.name + " | " + (d.shop_title || "Blue's Shop");
      }
      $('#tabs').innerHTML = '<a href="/shop"' + (!cat && path !== '/search' ? ' aria-current="page"' : '') + '>Everything</a>' +
        cats.map(function (c) { return '<a href="/category/' + esc(c.slug) + '"' + (cat && cat.slug === c.slug ? ' aria-current="page"' : '') + '>' + esc(c.name) + '</a>'; }).join('');
      fitText();

      function render() {
        var term = q.value.trim().toLowerCase();
        var list = (d.products || []).filter(function (p) {
          if (cat && !(p.category && p.category.slug === cat.slug)) return false;
          if (!term) return true;
          return (p.title + ' ' + p.description + ' ' + (p.category ? p.category.name : '')).toLowerCase().indexOf(term) > -1;
        });
        var price = function (p) { return p.mode === 'enquire' ? Infinity : (p.price_pence || 0); };
        if (sort.value === 'low') list.sort(function (a, b) { return price(a) - price(b); });
        if (sort.value === 'high') list.sort(function (a, b) { return (price(b) === Infinity ? -1 : price(b)) - (price(a) === Infinity ? -1 : price(a)); });
        if (sort.value === 'new') list.reverse();
        $('#grid').innerHTML = list.length ? list.map(card).join('')
          : term ? '<p class="empty"><span class="hand">Nothing matches "' + esc(q.value.trim()) + '"</span>Try another word, or <a href="/shop"><u>see everything</u></a>.</p>'
          : '<p class="empty"><span class="hand">New things arriving soon.</span>Have a look at the rest of the shop in the meantime.</p>';
        var u = new URL(location.href);
        if (term) u.searchParams.set('q', q.value.trim()); else u.searchParams.delete('q');
        if (sort.value) u.searchParams.set('sort', sort.value); else u.searchParams.delete('sort');
        history.replaceState(null, '', u);
      }
      var t; q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { render(); track('search', { q: q.value }); }, 180); });
      sort.addEventListener('change', render);
      render();
    });
  }

  // =============== PRODUCT ===============
  function initProduct() {
    var root = $('#product');
    var slug = decodeURIComponent(location.pathname.replace(/^\/shop\//, '').replace(/\/$/, ''));
    Promise.all([api('/api/shop/product?slug=' + encodeURIComponent(slug)), loadShop()]).then(function (r) {
      var d = r[0], all = r[1];
      if (!d._ok || !d.product) {
        document.title = "Nothing here | Blue's Shop";
        root.innerHTML = '<div class="page-head"><h1 class="page-title" data-fit="24">Nothing here</h1><p class="page-sub">That piece is not in the shop. It may have sold.</p><p style="margin-top:20px"><a class="btn" href="/shop">Shop all</a></p></div>';
        fitText(); return;
      }
      var p = d.product, open = d.shop_open !== false;
      document.title = p.title + ' | ' + (d.shop_title || "Blue's Shop");
      track('product_viewed', { slug: p.slug });
      var images = p.images.length ? p.images : [PLACEHOLDER];
      var hasV = p.variants && p.variants.length;
      var firstOk = hasV ? p.variants.filter(function (v) { return !v.sold_out; })[0] : null;
      var canBuy = p.mode === 'buy' && open && !p.sold_out;

      var buy = '';
      if (p.mode === 'buy') {
        buy = (hasV ? '<fieldset class="options"><legend>Choose an option</legend><div class="opt-row">' + p.variants.map(function (v) {
          var pr = v.price_pence != null ? v.price_pence : p.price_pence;
          return '<label><input type="radio" name="variant" value="' + esc(v.id) + '" data-price="' + pr + '"' + (v.sold_out ? ' disabled' : '') + (firstOk && firstOk.id === v.id ? ' checked' : '') + '><span>' + esc(v.label) + ' &middot; ' + money(pr) + (v.sold_out ? ' &middot; sold' : '') + '</span></label>';
        }).join('') + '</div></fieldset>' : '') +
          '<div class="buy-row"><div class="qty" role="group" aria-label="Quantity"><button type="button" data-q="-1" aria-label="One less">&minus;</button>' +
          '<input id="qty" type="number" min="1" max="20" value="1" aria-label="Quantity"><button type="button" data-q="1" aria-label="One more">+</button></div>' +
          '<button class="btn" id="add"' + (canBuy ? '' : ' disabled') + '>' + (p.sold_out ? 'Sold' : open ? 'Add to basket' : 'Shop closed') + '</button></div>' +
          '<div class="note" id="added" aria-live="polite"></div>';
      }
      var enquire = '<form id="enquire" class="form" novalidate' + (p.mode === 'buy' ? ' hidden' : '') + '><h2>' + (p.mode === 'buy' ? 'Ask a question' : 'Enquire') + '</h2>' +
        '<div class="field"><label for="e-name">Name</label><input id="e-name" name="name" type="text" autocomplete="name" required></div>' +
        '<div class="field"><label for="e-email">Email</label><input id="e-email" name="email" type="email" autocomplete="email" required></div>' +
        '<div class="field"><label for="e-msg">Message</label><textarea id="e-msg" name="message" required></textarea></div>' +
        '<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        '<button class="btn" type="submit">Send</button><div id="e-status" class="status" aria-live="polite"></div></form>';

      root.innerHTML =
        '<div class="crumbs"><a href="/shop">Shop all</a>' + (p.category ? ' / <a href="/category/' + esc(p.category.slug) + '">' + esc(p.category.name) + '</a>' : '') + '</div>' +
        '<div class="product"><div><div class="gallery-main"><img id="main-img" src="' + esc(images[0]) + '" alt="' + esc(p.title) + '"></div>' +
        (images.length > 1 ? '<div class="thumbs">' + images.map(function (src, i) {
          return '<button type="button" data-src="' + esc(src) + '" aria-label="Image ' + (i + 1) + '"' + (i === 0 ? ' aria-current="true"' : '') + '><img src="' + esc(src) + '" alt="" loading="lazy"></button>';
        }).join('') + '</div>' : '') + '</div>' +
        '<div class="info">' + (p.category ? '<a class="cat-link" href="/category/' + esc(p.category.slug) + '">' + esc(p.category.name) + '</a>' : '') +
        '<h1 data-fit="20" data-fit-wrap>' + esc(p.title) + '</h1>' +
        '<p class="price" id="price">' + (p.mode === 'buy' ? esc(priceLabel(p)) : '') + '</p>' +
        '<p class="desc">' + esc(p.description) + '</p>' + buy + enquire +
        (p.mode === 'buy' ? '<p style="margin-top:14px"><button class="link-btn" id="ask">Ask Blue a question about this</button></p>' : '') +
        (d.delivery_note && p.mode === 'buy' ? '<div class="delivery">' + esc(d.delivery_note) + ' <a href="/delivery-and-returns"><u>Delivery and returns</u></a></div>' : '') +
        '</div></div>';
      fitText();

      $$('.thumbs button').forEach(function (b) {
        b.addEventListener('click', function () {
          $('#main-img').src = b.getAttribute('data-src');
          $$('.thumbs button').forEach(function (x) { x.removeAttribute('aria-current'); });
          b.setAttribute('aria-current', 'true');
        });
      });
      wireForm($('#enquire'), '/api/shop/enquiry', { product_id: p.id }, $('#e-status'), 'Thank you. Your message has been sent and Blue will reply by email.');
      var ask = $('#ask');
      if (ask) ask.addEventListener('click', function () { $('#enquire').hidden = false; ask.parentNode.remove(); $('#e-name').focus(); });

      if (p.mode === 'buy') {
        var qty = $('#qty');
        var sync = function () { var v = $('input[name=variant]:checked'); if (v) $('#price').textContent = money(Number(v.getAttribute('data-price'))); };
        sync();
        $$('input[name=variant]').forEach(function (x) { x.addEventListener('change', sync); });
        $$('.qty button').forEach(function (b) {
          b.addEventListener('click', function () { qty.value = Math.max(1, Math.min(20, (parseInt(qty.value, 10) || 1) + Number(b.getAttribute('data-q')))); });
        });
        $('#add').addEventListener('click', function () {
          var vEl = $('input[name=variant]:checked');
          if (hasV && !vEl) { $('#added').innerHTML = '<div class="notice warn">Please choose an option first.</div>'; return; }
          var v = vEl ? p.variants.filter(function (x) { return x.id === vEl.value; })[0] : null;
          var n = Math.max(1, Math.min(20, parseInt(qty.value, 10) || 1));
          basket.add({ product_id: p.id, variant_id: v ? v.id : null, qty: n });
          track('product_added_to_basket', { slug: p.slug, qty: n });
          $('#added').innerHTML = '<div class="notice ok">In your basket. <a href="/basket"><b><u>View basket</u></b></a> or <a href="/shop"><u>keep looking</u></a>.</div>';
        });
      }

      // More from the same category
      var more = (all.products || []).filter(function (x) { return x.slug !== p.slug && p.category && x.category && x.category.slug === p.category.slug; }).slice(0, 4);
      if (more.length) {
        $('#more').hidden = false;
        $('#more-grid').innerHTML = more.map(card).join('');
        $('#more-link').href = '/category/' + p.category.slug;
      }
    });
  }

  function wireForm(form, url, extra, statusEl, okText) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type=submit]');
      var data = {};
      $$('input, textarea', form).forEach(function (i) { if (i.name) data[i.name] = i.value; });
      Object.keys(extra || {}).forEach(function (k) { data[k] = extra[k]; });
      btn.disabled = true; statusEl.textContent = ''; statusEl.className = 'status';
      api(url, data).then(function (d) {
        btn.disabled = false;
        $$('.field-error', form).forEach(function (x) { x.remove(); });
        Object.keys(d.errors || {}).forEach(function (k) {
          var input = form.elements[k]; if (!input) return;
          var m = document.createElement('div'); m.className = 'field-error'; m.textContent = d.errors[k];
          input.insertAdjacentElement('afterend', m);
        });
        if (d._ok) { form.reset(); statusEl.textContent = okText; track('enquiry_sent', { form: url }); }
        else { statusEl.textContent = d.error || 'Something went wrong. Please try again.'; statusEl.className = 'status bad'; }
      }).catch(function () { btn.disabled = false; statusEl.textContent = 'Your message could not be sent. Please check your connection.'; statusEl.className = 'status bad'; });
    });
  }

  // =============== BASKET ===============
  function initBasket() {
    var root = $('#basket');
    var code = ''; try { code = sessionStorage.getItem('bl:code') || ''; } catch (e) {}
    var payload = function () { return basket.read().map(function (i) { return { product_id: i.product_id, variant_id: i.variant_id, qty: i.qty }; }); };

    function render(q) {
      var items = basket.read();
      if (!items.length) {
        root.innerHTML = '<div class="empty"><span class="hand">Your basket is empty.</span><p><a class="btn" href="/shop">Shop all</a></p></div>';
        return;
      }
      var changed = false;
      (q.problems || []).forEach(function (pr) {
        items.forEach(function (i, idx) {
          if (i.product_id === pr.product_id && (i.variant_id || null) === (pr.variant_id || null)) {
            if (pr.adjusted_qty) i.qty = pr.adjusted_qty; else items[idx] = null;
            changed = true;
          }
        });
      });
      if (changed) basket.write(items.filter(Boolean));
      if (!q.lines.length) { if (changed) return refresh(); }

      root.innerHTML = '<div class="basket"><div>' +
        (q.problems || []).map(function (pr) { return '<div class="notice warn">' + esc(pr.reason) + '</div>'; }).join('') +
        '<ul class="lines">' + q.lines.map(function (l) {
          var key = ' data-p="' + esc(l.product_id) + '" data-v="' + esc(l.variant_id || '') + '"';
          return '<li class="line"><a href="/shop/' + esc(l.slug) + '"><img src="' + esc(l.image || PLACEHOLDER) + '" alt=""></a><div>' +
            '<a class="line-title" href="/shop/' + esc(l.slug) + '">' + esc(l.title) + '</a>' +
            '<div class="line-sub">' + (l.variant_label ? esc(l.variant_label) + ' &middot; ' : '') + money(l.unit_pence) + ' each</div>' +
            '<div class="line-controls"><div class="qty" role="group" aria-label="Quantity"><button type="button" data-step="-1"' + key + ' aria-label="One less">&minus;</button>' +
            '<input type="number" value="' + l.qty + '" readonly aria-label="Quantity"><button type="button" data-step="1"' + key + ' aria-label="One more">+</button></div>' +
            '<button class="link-btn" data-remove' + key + '>Remove</button><span class="line-price">' + money(l.line_pence) + '</span></div></div></li>';
        }).join('') + '</ul><p style="margin-top:16px"><a href="/shop"><u>Keep shopping</u></a></p></div>' +
        '<aside class="summary" aria-label="Order summary"><h2>Summary</h2>' +
        '<div class="sum-row"><span>Items</span><span>' + money(q.subtotal_pence) + '</span></div>' +
        (q.discount ? '<div class="sum-row"><span>' + esc(q.discount.code) + ' (' + q.discount.percent_off + '% off)</span><span>&minus;' + money(q.discount_pence) + '</span></div>' : '') +
        '<div class="sum-row"><span>UK delivery</span><span>' + (q.shipping_pence ? money(q.shipping_pence) : 'Free') + '</span></div>' +
        '<div class="sum-row total"><span>Total</span><span>' + money(q.total_pence) + '</span></div>' +
        '<form class="code-form" id="code-form"><label class="visually-hidden" for="code">Discount code</label><input id="code" placeholder="Discount code" maxlength="30" value="' + esc(q.discount ? q.discount.code : '') + '">' +
        (q.discount ? '<button class="btn light" type="button" id="code-remove">Remove</button>' : '<button class="btn light" type="submit">Apply</button>') + '</form>' +
        (q.discount_rejected ? '<div class="field-error">That code is not recognised.</div>' : '') +
        (!q.shop_open ? '<div class="notice warn">The shop is closed for orders at the moment.</div>' : '') +
        '<button class="btn block" id="checkout" style="margin-top:12px"' + (q.shop_open ? '' : ' disabled') + '>Checkout</button>' +
        '<p style="font-size:14px;color:var(--grey);margin-bottom:0">Secure payment with Stripe. UK delivery only.</p>' +
        '<div id="pay-status" aria-live="polite"></div></aside></div>';

      $$('[data-step]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          var it = basket.read();
          it.forEach(function (i) { if (i.product_id === b.getAttribute('data-p') && (i.variant_id || '') === b.getAttribute('data-v')) i.qty = Math.max(1, Math.min(20, i.qty + Number(b.getAttribute('data-step')))); });
          basket.write(it); refresh();
        });
      });
      $$('[data-remove]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          basket.write(basket.read().filter(function (i) { return !(i.product_id === b.getAttribute('data-p') && (i.variant_id || '') === b.getAttribute('data-v')); }));
          refresh();
        });
      });
      $('#code-form').addEventListener('submit', function (e) { e.preventDefault(); code = $('#code').value.trim().toUpperCase(); try { sessionStorage.setItem('bl:code', code); } catch (err) {} refresh(); });
      var rm = $('#code-remove'); if (rm) rm.addEventListener('click', function () { code = ''; try { sessionStorage.removeItem('bl:code'); } catch (err) {} refresh(); });
      $('#checkout').addEventListener('click', checkout);
    }
    function refresh() {
      if (!basket.read().length) return render({ lines: [] });
      api('/api/shop/quote', { items: payload(), discount_code: code }).then(function (q) {
        if (!q._ok) { root.innerHTML = '<div class="notice warn">Your basket could not load. Please refresh the page.</div>'; return; }
        if (q.discount_rejected) { code = ''; try { sessionStorage.removeItem('bl:code'); } catch (e) {} }
        render(q);
      });
    }
    function checkout() {
      var btn = $('#checkout'); btn.disabled = true; btn.textContent = 'Opening secure payment...';
      track('checkout_started', { items: basket.count() });
      api('/api/checkout', { items: payload(), discount_code: code, ph_id: phId() }).then(function (d) {
        if (d._ok && d.url) { location.href = d.url; return; }
        if (d.problems) { refresh(); return; }
        btn.disabled = false; btn.textContent = 'Checkout';
        $('#pay-status').innerHTML = '<div class="notice warn" style="margin-top:12px">' + esc(d.error || 'Payment could not start. Please try again.') + '</div>';
      }).catch(function () { btn.disabled = false; btn.textContent = 'Checkout'; });
    }
    refresh();
  }

  function initThanks() {
    var sid = new URLSearchParams(location.search).get('session_id');
    basket.clear(); try { sessionStorage.removeItem('bl:code'); } catch (e) {}
    if (!sid) return;
    api('/api/shop/order?session_id=' + encodeURIComponent(sid)).then(function (d) {
      if (!d.found) return;
      track('purchase', { session: sid });
      if (d.first_name) $('#thanks-title').textContent = 'Thank you, ' + d.first_name + '!';
      if (d.email) $('#thanks-email').textContent = 'A confirmation email is on its way to ' + d.email + '.';
      fitText();
    });
  }

  function initContact() { wireForm($('#contact-form'), '/api/shop/contact', {}, $('#c-status'), 'Thank you. Your message has been sent and Blue will reply by email.'); }

  document.addEventListener('DOMContentLoaded', function () {
    updateCount(); fitText();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitText);
    var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(fitText, 80); });
    window.addEventListener('storage', updateCount);
    api('/api/shop/config').then(function (c) { if (c._ok) applyConfig(c); });
    var page = document.body.getAttribute('data-page');
    var init = { home: initHome, shop: initShop, product: initProduct, basket: initBasket, thanks: initThanks, contact: initContact }[page];
    loadShop();
    if (init) init();
  });
})();
